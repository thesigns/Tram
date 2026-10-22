import { LIMITS } from '../config.js';

// Speed limits along the route (GDD §5): the line speed, slow zones from the route data and curves.
// Each curve is signed for v_safe = √(aLat · R), rounded down; a piece can override it with `limit`.
// raw[m] is the posted limit at meter m – what the lineside signs say. The tram obeys the lowest limit
// under its whole body, so a higher limit applies only once the rear has passed its sign.
// Kept free of Three.js, so it can be tested in Node.
export class SpeedLimits {
  constructor(track, route, tramLength) {
    this.length = tramLength;
    const n = Math.ceil(track.length) + 1;
    const raw = this.raw = new Uint8Array(n).fill(route.speed ?? LIMITS.lineSpeed);
    const restrict = (from, to, kmh) => {
      for (let m = Math.max(0, Math.floor(from)); m < Math.min(n, Math.ceil(to)); m++) raw[m] = Math.min(raw[m], kmh);
    };
    for (const z of route.limits ?? []) restrict(z.from, z.to, z.kmh);

    this.curves = [];
    for (const sp of track.spans) {
      if (!sp.k) continue;
      const radius = 1 / Math.abs(sp.k);
      const safe = Math.sqrt(LIMITS.aLat * radius);   // [m/s]
      const kmh = sp.limit ?? Math.floor((safe * 3.6) / LIMITS.step) * LIMITS.step;
      this.curves.push({ s0: sp.s0, s1: sp.s1, radius, safe, kmh, dir: Math.sign(sp.k) });
      restrict(sp.s0, sp.s1, kmh);
    }

    // a sign wherever the posted limit changes, plus one after the first stop for the line speed
    this.signs = [];
    const first = route.stops?.[0]?.s ?? 0;
    this.signs.push({ s: Math.min(first + 20, n - 1), kmh: raw[Math.min(Math.round(first + 20), n - 1)] });
    for (let m = 1; m < n; m++) {
      if (raw[m] !== raw[m - 1] && m > first + 20) this.signs.push({ s: m, kmh: raw[m] });
    }
  }

  // The limit for a tram whose front is at s [km/h].
  at(s) {
    const raw = this.raw;
    const a = Math.max(0, Math.floor(s - this.length)), b = Math.min(raw.length - 1, Math.floor(s));
    let v = 255;
    for (let m = a; m <= b; m++) if (raw[m] < v) v = raw[m];
    return v;
  }

  // The next sign ahead with a lower limit than the current one, within `range` meters.
  next(s, range = LIMITS.warnAhead) {
    const now = this.at(s);
    for (const sg of this.signs) {
      if (sg.s <= s) continue;
      if (sg.s > s + range) return null;
      if (sg.kmh < now) return { kmh: sg.kmh, dist: sg.s - s };
    }
    return null;
  }

  // The tightest curve under the tram body, or null.
  curveAt(s) {
    let best = null;
    for (const c of this.curves) {
      if (c.s0 < s && c.s1 > s - this.length && (!best || c.safe < best.safe)) best = c;
    }
    return best;
  }
}
