import { STOPS } from '../config.js';
import { clamp } from '../core/utils.js';
import { notchName } from '../core/tram.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const INK = 'rgba(248,244,232,0.96)';
const DIM = 'rgba(248,244,232,0.7)';
export const RATING_COLORS = {
  PERFECT: '#5ee08a', GREAT: '#9fe05e', GOOD: '#f2c230', OK: '#f0a050', MISSED: '#ff5a46',
};

// Precision bar range: 20 m before the marker … 6 m past it, with a square-root scale so the last meters are wide.
const BAR_MIN = -6;
const warp = (d) => Math.sign(d) * Math.sqrt(Math.abs(d));

// 2D overlay: next stop, distance, precision bar, speed, prompts and rating popups.
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

  draw(dt, st) {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    if (!st.playing) return;
    const { run, tram } = st;

    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 4;
    c.textBaseline = 'alphabetic';

    // next stop and distance
    const target = run.target;
    const left = this.left;
    if (target) {
      c.textAlign = 'left';
      c.fillStyle = DIM;
      c.font = `600 13px ${FONT}`;
      c.fillText(run.terminus ? 'NEXT STOP · TERMINUS' : 'NEXT STOP', left, 22);
      c.fillStyle = INK;
      c.font = `700 25px ${FONT}`;
      c.fillText(target.name, left, 48);
    }
    c.textAlign = 'right';
    c.fillStyle = DIM;
    c.font = `600 13px ${FONT}`;
    c.fillText('SCORE', w - 16, 22);
    c.fillStyle = INK;
    c.font = `700 25px ${FONT}`;
    c.fillText(String(run.score), w - 16, 48);
    if (run.combo >= 2) {
      c.fillStyle = RATING_COLORS.GREAT;
      c.font = `700 15px ${FONT}`;
      c.fillText(`COMBO ×${run.combo}`, w - 16, 68);
    }

    // distance to the marker, or the precision bar close to it
    const d = run.distance(tram.s);
    let y = 82;
    if (target && run.phase === 'drive') {
      if (d > STOPS.precisionRange) {
        c.textAlign = 'left';
        c.font = `700 22px ${FONT}`;
        c.fillStyle = INK;
        c.fillText(`${Math.round(d)} m`, left, y - 4);
      } else {
        this.precisionBar(c, d, y, run.missDistance(target));
      }
    }

    // speed and notch
    y = d <= STOPS.precisionRange && run.phase === 'drive' ? 150 : 118;
    c.textAlign = 'center';
    c.fillStyle = INK;
    c.font = `700 30px ${FONT}`;
    const kmh = Math.round(tram.v * 3.6);
    c.fillText(`${kmh}`, w / 2 - 18, y);
    c.font = `600 15px ${FONT}`;
    c.fillStyle = DIM;
    c.textAlign = 'left';
    c.fillText('km/h', w / 2 + 2, y);
    c.textAlign = 'center';
    c.font = `700 15px ${FONT}`;
    c.fillStyle = tram.notch > 0 ? '#9fe0a0' : tram.notch < 0 ? '#f2c230' : DIM;
    if (tram.notch === -5) c.fillStyle = '#ff5a46';
    c.fillText(notchName(tram.notch), w / 2, y + 20);

    // prompts
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    let prompt = null, color = INK;
    if (tram.interlocked) { prompt = blink ? 'DOORS OPEN – NO TRACTION' : ''; color = '#ff5a46'; }
    else if (run.phase === 'board') prompt = run.terminus ? 'Passengers are getting off…' : `Boarding… ${run.boarded}/${target.waiting}`;
    else if (run.phase === 'ready') prompt = 'Close the doors and depart';
    else if (run.phase === 'drive' && tram.stopped && target && run.doorsOnPlatform(target, tram.s) && tram.doorsClosed) {
      prompt = 'Open the doors';
    } else if (this.notice) { prompt = this.notice.text; color = this.notice.color; }
    if (prompt) {
      c.font = `700 20px ${FONT}`;
      c.fillStyle = color;
      c.fillText(prompt, w / 2, y + 52);
    }
    if (this.notice) {
      this.notice.time -= dt;
      if (this.notice.time <= 0) this.notice = null;
    }

    this.drawPopup(c, dt);
    if (st.debug) this.drawDebug(c, st);
    c.shadowBlur = 0;
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
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(tx, y + 2);
    c.lineTo(tx - 8, y + 13);
    c.lineTo(tx + 8, y + 13);
    c.closePath();
    c.fill();
    c.shadowBlur = 4;
    c.font = `700 16px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = INK;
    const label = d >= 0 ? `${d.toFixed(1)} m` : `+${(-d).toFixed(1)} m past`;
    c.fillText(label, clamp(tx, x0 + 30, x0 + bw - 30), y + 32);
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
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(8, this.h * 0.42, 190, 112);
    c.fillStyle = '#cfe';
    c.font = '12px monospace';
    c.textAlign = 'left';
    const lines = [
      `s ${tram.s.toFixed(2)} m  d ${run.distance(tram.s).toFixed(2)}`,
      `v ${(tram.v * 3.6).toFixed(1)} km/h`,
      `a ${tram.a.toFixed(2)} m/s²`,
      `jerk ${tram.jerk.toFixed(2)} m/s³`,
      `trac ${tram.traction.toFixed(2)}  brake ${tram.brake.toFixed(2)}`,
      `doors ${tram.doors.toFixed(2)}  phase ${run.phase}`,
      `t ${run.time.toFixed(1)} s  fps ${fps.toFixed(0)}`,
    ];
    lines.forEach((l, i) => c.fillText(l, 14, this.h * 0.42 + 16 + i * 15));
  }
}
