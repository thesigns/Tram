import { LIMITS, STOPS, TIMETABLE } from '../config.js';
import { clamp, formatClock, formatDelta } from '../core/utils.js';
import { EB, notchName } from '../core/tram.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const INK = 'rgba(248,244,232,0.96)';
const DIM = 'rgba(248,244,232,0.7)';
const RED = '#ff5a46';
const AMBER = '#f2c230';
const GREEN = '#9fe05e';
export const RATING_COLORS = {
  PERFECT: '#5ee08a', GREAT: GREEN, GOOD: AMBER, OK: '#f0a050', MISSED: RED,
};

// Precision bar range: 20 m before the marker … 6 m past it, with a square-root scale so the last meters are wide.
const BAR_MIN = -6;
const warp = (d) => Math.sign(d) * Math.sqrt(Math.abs(d));

// 2D overlay: next stop, distance / precision bar, speed and limits, clock and schedule, comfort,
// prompts and rating popups.
export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.popup = null;      // { title, sub, color, time, duration }
    this.notice = null;     // { text, color, time }
    this.left = 60;         // room for the pause button
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
    const tt = run.timetable;
    const blink = Math.floor(performance.now() / 350) % 2 === 0;

    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 4;
    c.textBaseline = 'alphabetic';

    // next stop with its departure (arrival at the terminus)
    const target = run.target;
    const left = this.left;
    if (target) {
      const atStop = run.phase === 'board' || run.phase === 'ready';
      const time = run.terminus ? `ARR ${formatClock(tt.arr[run.idx])}` : `DEP ${formatClock(tt.dep[run.idx])}`;
      this.text(`${atStop ? 'AT STOP' : run.terminus ? 'TERMINUS' : 'NEXT STOP'} · ${time}`, left, 22, 13, DIM, 'left', 600);
      this.text(target.name, left, 48, 25);
    }

    // score, combo, comfort
    this.text('SCORE', w - 16, 22, 13, DIM, 'right', 600);
    if (run.combo >= 2) {
      c.font = `600 13px ${FONT}`;
      this.text(`COMBO ×${run.combo}`, w - 26 - c.measureText('SCORE').width, 22, 13, GREEN, 'right');
    }
    this.text(String(run.score), w - 16, 48, 25, INK, 'right');
    this.comfortBar(c, w - 16 - 86, 56, 86, run.comfort);

    // distance to the marker, or the precision bar close to it
    const d = run.distance(tram.s);
    const bar = target && run.phase === 'drive' && d <= STOPS.precisionRange;
    if (target && run.phase === 'drive' && !bar) this.text(`${Math.round(d)} m`, left, 76, 22);
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
    const n = tram.notch;
    this.text(notchName(n), w / 2, y + 20, 15, n === EB ? RED : n > 0 ? '#9fe0a0' : n < 0 ? AMBER : DIM, 'center');

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
    else if (run.overspeed > LIMITS.tolerance) { prompt = blink ? `OVERSPEED  −${LIMITS.overspeedRate}/s` : ''; color = RED; }
    else if (run.phase === 'board') prompt = run.terminus ? 'Passengers are getting off…' : `Boarding… ${run.boarded}/${target.waiting}`;
    else if (run.phase === 'ready') {
      prompt = run.countdown > 0 ? `Close the doors · departure in ${formatDelta(run.countdown).replace('+', '')}` : 'Close the doors and depart';
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
