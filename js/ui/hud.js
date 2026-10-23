import { LIMITS, PASSENGERS, STOPS, TIMETABLE } from '../config.js';
import { clamp, formatClock, formatDelta } from '../core/utils.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const INK = 'rgba(248,244,232,0.96)';
const DIM = 'rgba(248,244,232,0.7)';
const RED = '#ff5a46';
const AMBER = '#f2c230';
const GREEN = '#9fe05e';
const BLUE = '#62c4ff';
const HAZARD_TEXT = { car: 'CAR ON THE TRACK', van: 'OBSTRUCTION', ped: 'PEDESTRIAN', bike: 'CYCLIST AHEAD', lift: 'FORKLIFT' };
export const RATING_COLORS = {
  PERFECT: '#5ee08a', GREAT: GREEN, GOOD: AMBER, OK: '#f0a050', MISSED: RED, PASSED: GREEN, EMPTY: '#b8c0c8',
};

// Precision bar range: 20 m before the marker … 6 m past it, with a square-root scale so the last meters are wide.
const BAR_MIN = -6;
const warp = (d) => Math.sign(d) * Math.sqrt(Math.abs(d));

// 2D overlay: next stop, distance / precision bar, speed and limits, clock and schedule, the passengers and
// comfort, prompts and rating popups. The score is only shown at the end of the line.
export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.popup = null;      // { title, sub, color, time, duration }
    this.notice = null;     // { text, color, time }
    this.left = 60;         // room for the pause button
    this.moodFlash = 0;     // somebody just got angrier: flash the passenger bar
    this.lastBad = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  showRating(title, sub, color) { this.popup = { title, sub, color, time: 2.6, duration: 2.6 }; }
  showNotice(text, color = INK, time = 2.2) { this.notice = { text, color, time }; }

  text(str, x, y, size, color = INK, align = 'left', weight = 700) {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = align;
    c.fillStyle = color;
    c.fillText(str, x, y);
  }

  draw(dt, st) {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    if (!st.playing) { this.drawPopup(c, dt); return; }
    const { run, tram } = st;
    const blink = Math.floor(performance.now() / 350) % 2 === 0;

    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 4;
    c.textBaseline = 'alphabetic';

    // next stop with its departure (arrival at the terminus)
    const target = run.target;
    const left = this.left;
    if (target) {
      const atStop = run.phase === 'board' || run.phase === 'ready';
      const time = run.terminus ? `ARR ${formatClock(run.arrAt(run.idx))}` : `DEP ${formatClock(run.depAt(run.idx))}`;
      const kind = atStop ? 'AT STOP' : run.terminus ? 'TERMINUS' : target.request ? 'REQUEST STOP' : 'NEXT STOP';
      this.text(`${kind} · ${time}`, left, 22, 13, DIM, 'left', 600);
      this.text(target.name, left, 48, 25);
    }

    // the passengers on the line and the ride comfort
    this.passengerBar(c, w - 16 - 120, 30, 120, run.crowd, dt);
    this.comfortBar(c, w - 16 - 120, 56, 120, run.comfort);

    // distance to the marker, or the precision bar close to it
    const d = run.distance(tram.s);
    const bar = target && run.phase === 'drive' && d <= STOPS.precisionRange;
    if (target && run.phase === 'drive' && !bar) {
      this.text(`${Math.round(d)} m`, left, 76, 22);
      if (run.stopRequested) {
        c.font = `700 22px ${FONT}`;
        this.text('● STOP REQUESTED', left + c.measureText(`${Math.round(d)} m`).width + 12, 76, 15, BLUE);
      }
    }
    if (bar) this.precisionBar(c, d, 100, run.missDistance(target));

    // speed, the current limit and the next lower one
    const y = bar ? 160 : 126;
    const kmh = Math.round(tram.v * 3.6);
    const over = run.overspeed > LIMITS.tolerance ? RED : run.overspeed > 0 ? AMBER : INK;
    this.text(`${kmh}`, w / 2 - 18, y, 30, over, 'center');
    this.text('km/h', w / 2 + 2, y, 15, DIM, 'left', 600);
    this.limitSign(c, w / 2 - 74, y - 10, 17, run.limit);
    const next = run.limits.next(tram.s);
    if (next) {
      this.limitSign(c, w / 2 + 66, y - 12, 12, next.kmh);
      this.text(`in ${Math.round(next.dist)} m`, w / 2 + 84, y - 7, 14, DIM, 'left', 600);
    }
    const sig = run.street.nextSignal(tram.s);
    if (sig) this.signalIcon(c, w / 2 - 120, y - 10, sig, blink);
    // wet rails under the tram or ahead (GDD §5 adhesion); the notch is on the lever, not here
    const wet = run.wetAhead(tram.s);
    if (wet) this.text(wet.dist > 0 ? `WET RAILS in ${Math.round(wet.dist)} m` : 'WET RAILS', w / 2, y + 20, 14, BLUE, 'center');

    // clock and the schedule: countdown at a stop, live delta on the way
    const clock = formatClock(run.clock);
    let sched, schedColor;
    if (run.countdown !== null) {
      sched = run.countdown > 0 ? `DEP IN ${formatDelta(run.countdown).replace('+', '')}` : `LATE ${formatDelta(-run.countdown)}`;
      schedColor = run.countdown > 0 ? DIM : -run.countdown > TIMETABLE.lateTolerance ? RED : AMBER;
    } else {
      sched = formatDelta(run.delta);
      schedColor = run.delta > TIMETABLE.lateTolerance ? RED : run.delta > 0 ? AMBER : GREEN;
    }
    c.font = `600 16px ${FONT}`;
    const cw = c.measureText(clock).width, gap = 10;
    c.font = `700 16px ${FONT}`;
    const sw = c.measureText(sched).width;
    const x0 = w / 2 - (cw + gap + sw) / 2;
    this.text(clock, x0, y + 44, 16, DIM, 'left', 600);
    this.text(sched, x0 + cw + gap, y + 44, 16, schedColor, 'left', 700);

    // prompts, most urgent first
    let prompt = null, color = INK;
    const standing = tram.stopped && run.phase === 'drive' && run.departPending !== null;
    if (tram.interlocked) { prompt = blink ? 'DOORS OPEN – NO TRACTION' : ''; color = RED; }
    else if (run.curve && tram.v > run.curve.safe) { prompt = blink ? 'TOO FAST FOR THE CURVE!' : ''; color = RED; }
    else if (tram.slide) { prompt = blink ? 'WHEELS SLIDING – EASE THE BRAKE' : ''; color = RED; }
    else if (tram.slip) { prompt = blink ? 'WHEELS SLIPPING – LESS POWER' : ''; color = RED; }
    else if (run.overspeed > LIMITS.tolerance) { prompt = blink ? 'TOO FAST – THE TRAM IS SHAKING' : ''; color = RED; }
    else if (run.phase === 'board') prompt = run.terminus ? 'Passengers are getting off…' : 'Boarding…';
    else if (run.phase === 'ready') {
      prompt = run.countdown > 0 ? `Close the doors · departure in ${formatDelta(run.countdown).replace('+', '')}` : 'Close the doors and depart';
    } else if (standing && tram.doorsClosed && run.crowd.waitingAt(run.departPending, run.sched).length) {
      prompt = blink ? 'Somebody is running for the tram – open the doors' : '';
      color = AMBER;
    } else if (standing && tram.doorsClosed) {
      prompt = run.countdown > 0 ? `Departure in ${formatDelta(run.countdown).replace('+', '')}` : 'Depart now';
      color = run.countdown > 0 ? INK : GREEN;
    } else if (run.phase === 'drive' && tram.stopped && target && run.doorsOnPlatform(target, tram.s) && tram.doorsClosed) {
      prompt = 'Open the doors';
    } else if (this.notice) { prompt = this.notice.text; color = this.notice.color; }
    if (prompt) this.text(prompt, w / 2, y + 74, 20, color, 'center');
    if (this.notice) {
      this.notice.time -= dt;
      if (this.notice.time <= 0) this.notice = null;
    }

    // hazards worth watching, and something on the tracks ahead
    for (const m of st.markers ?? []) this.marker(c, m.x, m.y, m.dist);
    const hz = run.street.warning;
    if (hz && run.phase === 'drive') this.hazard(c, w / 2, y + 102, `${HAZARD_TEXT[hz.kind]} · ${Math.round(hz.dist)} m`);

    this.drawPopup(c, dt);
    if (st.debug) this.drawDebug(c, st);
    c.shadowBlur = 0;
  }

  limitSign(c, x, y, r, kmh) {
    c.save();
    c.shadowBlur = 3;
    c.fillStyle = '#c8382c';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#f6f4ee';
    c.beginPath();
    c.arc(x, y, r * 0.76, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#151515';
    c.font = `800 ${Math.round(r * 0.95)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(kmh), x, y + 1);
    c.restore();
  }

  // The next tram signal: a black head with the lit lamp (stop / prepare / go) and the distance.
  signalIcon(c, x, y, sig, blink) {
    c.save();
    c.shadowBlur = 3;
    c.fillStyle = '#121212';
    c.beginPath();
    if (c.roundRect) c.roundRect(x - 11, y - 25, 22, 50, 5);
    else c.rect(x - 11, y - 25, 22, 50);   // older Safari
    c.fill();
    c.shadowBlur = 0;
    const lamps = [['stop', y - 15], ['prepare', y], ['go', y + 15]];
    for (const [sym, ly] of lamps) {
      const lit = sym === sig.aspect && (sym !== 'prepare' || blink);
      c.fillStyle = lit ? '#fffbe8' : '#3a3a3a';
      if (sym === 'stop') c.fillRect(x - 7, ly - 2, 14, 4);
      else if (sym === 'go') c.fillRect(x - 2, ly - 7, 4, 14);
      else { c.beginPath(); c.arc(x, ly, 3.5, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
    const color = sig.aspect === 'stop' ? RED : sig.aspect === 'prepare' ? AMBER : DIM;
    this.text(`${Math.round(sig.dist)} m`, x, y + 41, 13, color, 'center', 600);
    if (sig.bridge) this.text('BRIDGE', x, y + 55, 11, DIM, 'center', 600);
  }

  // A small "!" above a hazard in the street; it grows as the tram gets closer.
  marker(c, x, y, dist) {
    const r = clamp(11 - dist / 25, 5, 10);
    c.save();
    c.shadowBlur = 3;
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(x, y - r * 1.8);
    c.lineTo(x + r, y);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#151515';
    c.fillRect(x - 1, y - r * 1.25, 2, r * 0.75);
    c.fillRect(x - 1, y - r * 0.35, 2, 2);
    c.restore();
  }

  hazard(c, x, y, label) {
    c.font = `700 17px ${FONT}`;
    const tw = c.measureText(label).width;
    const x0 = x - (tw + 26) / 2;
    c.save();
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(x0 + 9, y - 16);
    c.lineTo(x0 + 19, y + 2);
    c.lineTo(x0 - 1, y + 2);
    c.closePath();
    c.fill();
    c.fillStyle = '#151515';
    c.fillRect(x0 + 8, y - 10, 2, 7);
    c.fillRect(x0 + 8, y - 2, 2, 2);
    c.restore();
    this.text(label, x0 + 26, y, 17, AMBER, 'left');
  }

  // Everybody on the line, one segment each, sorted green – yellow – red; the ones aboard are bright.
  passengerBar(c, x, y, bw, crowd, dt) {
    const P = PASSENGERS, bh = 12;
    const rank = (a) => (a >= P.red ? 2 : a >= P.yellow ? 1 : 0);
    const list = crowd.people.map((p) => ({ r: rank(crowd.anger(p)), on: p.state === 'riding' }));
    list.sort((a, b) => a.r - b.r || b.on - a.on);
    const bad = list.reduce((n, p) => n + p.r, 0);
    if (bad > this.lastBad) this.moodFlash = 0.8;
    this.lastBad = bad;
    this.moodFlash = Math.max(0, this.moodFlash - dt);
    const aboard = list.filter((p) => p.on).length;
    this.text(`PASSENGERS · ${aboard} ABOARD`, x + bw, y - 8, 13, this.moodFlash > 0 ? RED : DIM, 'right', 600);
    c.save();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(20,22,24,0.55)';
    c.fillRect(x, y, bw, bh);
    const seg = (bw - 2) / Math.max(1, list.length), gap = seg >= 4 ? 1 : 0;
    list.forEach((p, i) => {
      c.globalAlpha = p.on ? 1 : 0.45;
      c.fillStyle = [GREEN, AMBER, RED][p.r];
      c.fillRect(x + 1 + i * seg, y + 1, seg - gap, bh - 2);
    });
    c.globalAlpha = 1;
    if (this.moodFlash > 0) {
      c.strokeStyle = RED;
      c.lineWidth = 2;
      c.strokeRect(x - 1, y - 1, bw + 2, bh + 2);
    }
    c.restore();
  }

  comfortBar(c, x, y, bw, comfort) {
    const v = comfort.value;
    const flash = comfort.recent > 0.4;
    c.save();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(20,22,24,0.55)';
    c.fillRect(x, y, bw, 8);
    c.fillStyle = v > 70 ? GREEN : v > 40 ? AMBER : RED;
    c.fillRect(x + 1, y + 1, ((bw - 2) * v) / 100, 6);
    if (flash) {
      c.strokeStyle = RED;
      c.lineWidth = 2;
      c.strokeRect(x - 1, y - 1, bw + 2, 10);
    }
    c.restore();
    this.text(`COMFORT ${Math.round(v)}`, x + bw, y + 22, 13, flash ? RED : DIM, 'right', 600);
  }

  precisionBar(c, d, y, missAt) {
    const { w } = this;
    const bw = Math.min(w - 32, 440), x0 = (w - bw) / 2, bh = 14;
    const top = warp(STOPS.precisionRange), span = top - warp(BAR_MIN);
    const X = (m) => x0 + (bw * (top - warp(clamp(m, BAR_MIN, STOPS.precisionRange)))) / span;
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(20,22,24,0.55)';
    c.fillRect(x0, y - bh, bw, bh);
    // rating zones; past the platform end the stop is lost
    const zones = [[3, RATING_COLORS.GOOD], [1.5, RATING_COLORS.GREAT], [0.5, RATING_COLORS.PERFECT]];
    for (const [m, col] of zones) {
      c.fillStyle = col;
      c.globalAlpha = 0.55;
      c.fillRect(X(m), y - bh, X(-m) - X(m), bh);
    }
    c.globalAlpha = 0.5;
    c.fillStyle = RATING_COLORS.MISSED;
    c.fillRect(X(-missAt), y - bh, X(BAR_MIN) - X(-missAt), bh);
    c.globalAlpha = 1;
    // marker
    c.fillStyle = '#fff';
    c.fillRect(X(0) - 1, y - bh - 5, 2, bh + 10);
    // tram front
    const tx = X(d);
    c.beginPath();
    c.moveTo(tx, y + 2);
    c.lineTo(tx - 8, y + 13);
    c.lineTo(tx + 8, y + 13);
    c.closePath();
    c.fill();
    c.shadowBlur = 4;
    const label = d >= 0 ? `${d.toFixed(1)} m` : `+${(-d).toFixed(1)} m past`;
    this.text(label, clamp(tx, x0 + 30, x0 + bw - 30), y + 30, 16, INK, 'center');
  }

  drawPopup(c, dt) {
    const p = this.popup;
    if (!p) return;
    p.time -= dt;
    if (p.time <= 0) { this.popup = null; return; }
    const age = p.duration - p.time;
    const a = Math.min(1, p.time / 0.5);
    const scale = 1 + Math.max(0, 0.25 - age) * 1.6;
    const { w, h } = this;
    c.save();
    c.globalAlpha = a;
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 5;
    c.translate(w / 2, h * 0.3);
    c.scale(scale, scale);
    c.textAlign = 'center';
    c.fillStyle = p.color;
    c.font = `800 46px ${FONT}`;
    c.fillText(p.title, 0, 0);
    if (p.sub) {
      c.fillStyle = INK;
      c.font = `600 18px ${FONT}`;
      c.fillText(p.sub, 0, 28);
    }
    c.restore();
  }

  drawDebug(c, { tram, run, fps }) {
    c.shadowBlur = 0;
    const top = this.h * 0.42;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(8, top, 200, 142);
    c.fillStyle = '#cfe';
    c.font = '12px monospace';
    c.textAlign = 'left';
    const lines = [
      `s ${tram.s.toFixed(2)} m  d ${run.distance(tram.s).toFixed(2)}`,
      `v ${(tram.v * 3.6).toFixed(1)} km/h  limit ${run.limit}`,
      `a ${tram.a.toFixed(2)} m/s²  lat ${run.lateral.toFixed(2)}`,
      `jerk ${tram.jerk.toFixed(2)} m/s³`,
      `trac ${tram.traction.toFixed(2)}  brake ${tram.brake.toFixed(2)}`,
      `doors ${tram.doors.toFixed(2)}  phase ${run.phase}`,
      `comfort ${run.comfort.value.toFixed(1)} avg ${run.comfort.average.toFixed(1)}`,
      `delta ${run.delta.toFixed(1)}  cd ${run.countdown?.toFixed(1) ?? '–'}`,
      `t ${run.time.toFixed(1)} s  fps ${fps.toFixed(0)}`,
    ];
    lines.forEach((l, i) => c.fillText(l, 14, top + 16 + i * 15));
  }
}
