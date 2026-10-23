import { clamp } from '../core/utils.js';

const _a = {};

// Track centreline built from "turtle" pieces (GDD §14.2): straights and circular curves, optionally on a grade.
// Sampled into an arc-length table, so s → position / heading / curvature / grade is a cheap lookup.
// Heading 0 = forward along −Z, positive curvature turns right. Lateral offset > 0 = right of the track,
// along the right vector (cos h, 0, sin h). An object facing along the track has rotation.y = −heading.
// A track can start anywhere (`start`: a pose { x, y, z, h }) – a branch leaving the line at a junction.
// Kept free of Three.js, so it can be tested in Node.
export class Track {
  constructor(pieces, step = 2, start = { x: 0, y: 0, z: 0, h: 0 }) {
    let cs = 0, cx = start.x, cy = start.y, cz = start.z, ch = start.h;
    const s = [0], x = [cx], y = [cy], z = [cz], h = [ch];
    const k = [], g = [];   // per interval between sample i and i + 1
    const spans = [];       // the pieces by distance: { s0, s1, k, limit }
    for (const p of pieces) {
      const curve = p.type === 'curve';
      const len = curve ? p.radius * p.angle * Math.PI / 180 : p.length;
      const kk = curve ? (p.dir === 'left' ? -1 : 1) / p.radius : 0;
      const grade = (p.grade ?? 0) / 100;
      spans.push({ s0: cs, s1: cs + len, k: kk, limit: p.limit });
      const n = Math.max(1, Math.ceil(len / step));
      const ds = len / n;
      for (let i = 0; i < n; i++) {
        const h2 = ch + kk * ds;
        if (kk === 0) {
          cx += Math.sin(ch) * ds;
          cz -= Math.cos(ch) * ds;
        } else {
          // exact arc step
          cx += (Math.cos(ch) - Math.cos(h2)) / kk;
          cz += (Math.sin(ch) - Math.sin(h2)) / kk;
        }
        ch = h2;
        cs += ds;
        cy += grade * ds;
        k.push(kk); g.push(grade);
        s.push(cs); x.push(cx); y.push(cy); z.push(cz); h.push(ch);
      }
    }
    Object.assign(this, { s, x, y, z, h, k, g, spans });
    this.length = cs;
    this._i = 0;
  }

  index(t) {
    const s = this.s;
    let i = this._i;
    // sequential lookups (the tram, building chunks) start from the last index
    if (t >= s[i] && t <= s[i + 1]) return i;
    let lo = 0, hi = s.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid] <= t) lo = mid; else hi = mid - 1;
    }
    this._i = lo;
    return lo;
  }

  // Average grade between s0 and s1 – under the tram body it changes smoothly where pieces meet.
  slope(s0, s1) {
    const a = this.at(s0, 0, _a).y, b = this.at(s1, 0, _a).y;
    return s1 > s0 ? (b - a) / (s1 - s0) : 0;
  }

  // Position on the track at distance t, `off` meters to the right of the centreline.
  // out: { x, y, z, h (heading), k (curvature), grade }
  at(t, off = 0, out = {}) {
    t = clamp(t, 0, this.length);
    const i = this.index(t);
    const f = (t - this.s[i]) / (this.s[i + 1] - this.s[i]);
    const h = this.h[i] + (this.h[i + 1] - this.h[i]) * f;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * f + Math.cos(h) * off;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * f;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * f + Math.sin(h) * off;
    out.h = h;
    out.k = this.k[i];
    out.grade = this.g[i];
    return out;
  }
}

// The track the other way on a double-track line: `gap` to the left of ours, merging into it on the
// single-track sections ({ from, to }) over `merge` meters at each end. Returns s → its offset.
export function otherTrack(sections, gap, merge) {
  const smooth = (u) => u * u * (3 - 2 * u);
  return (s) => {
    let f = 1;   // 1 = apart, 0 = merged
    for (const z of sections) {
      if (s >= z.from && s <= z.to) return 0;
      if (s > z.from - merge && s < z.from) f = Math.min(f, smooth((z.from - s) / merge));
      if (s > z.to && s < z.to + merge) f = Math.min(f, smooth((s - z.to) / merge));
    }
    return -gap * f;
  };
}
