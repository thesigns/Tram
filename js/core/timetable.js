import { PHYSICS, STOPS, TIMETABLE } from '../config.js';
import { resistance, tractionAccel } from './tram.js';

const _p = {};

export const parseClock = (text) => {
  const [h, m, s = 0] = text.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

// Timetable from a reference driving profile (GDD §6.2): full power up to just under the limit,
// braking at TIMETABLE.refBrake for lower limits and stops, the expected dwell at every stop,
// times the slack (route `slack` or TIMETABLE.slack). Departures are rounded up. A stop in the route
// data can fix its time with `dep` ("06:15:30").
// All times are game seconds since midnight. Kept free of Three.js.
export function buildTimetable(track, limits, stops, tramCfg, route) {
  const T = TIMETABLE;
  const n = Math.ceil(track.length) + 1;
  const cap = new Float32Array(n);
  for (let m = 0; m < n; m++) cap[m] = Math.max(1, limits.at(m) - T.refMargin) / 3.6;

  // tref[m]: reference driving time [real s] from the start, along the whole route
  const tref = new Float32Array(n);
  const drive = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = Math.round(stops[i].s), b = Math.round(stops[i + 1].s);
    const v = new Float32Array(b - a + 1);
    for (let m = a; m < b; m++) {
      const vi = v[m - a];
      const acc = tractionAccel(tramCfg, vi) - resistance(vi, track.at(m, 0, _p).grade);
      v[m - a + 1] = Math.min(cap[m + 1], Math.sqrt(Math.max(0, vi * vi + 2 * acc)));
    }
    v[b - a] = 0;
    for (let m = b - 1; m > a; m--) v[m - a] = Math.min(v[m - a], Math.sqrt(v[m - a + 1] ** 2 + 2 * T.refBrake));
    let t = 0;
    for (let m = a; m < b; m++) {
      t += 1 / Math.max(0.3, (v[m - a] + v[m - a + 1]) / 2);
      tref[m + 1] = tref[a] + t;
    }
    drive.push(t);
  }

  const dwell = (st) => 2 * PHYSICS.doorTime + st.waiting * STOPS.boardInterval + STOPS.boardExtra + T.reaction;
  const ceilTo = (t) => Math.ceil(t / T.round) * T.round;
  const slack = route.slack ?? T.slack;
  const last = stops.length - 1;
  const dep = [], arr = [];
  dep[0] = arr[0] = stops[0].dep != null ? parseClock(stops[0].dep) : parseClock(route.startTime ?? '06:00');
  for (let i = 1; i <= last; i++) {
    arr[i] = dep[i - 1] + drive[i - 1] * slack * T.timeScale;
    if (i === last) {
      arr[i] = stops[i].dep != null ? parseClock(stops[i].dep) : ceilTo(arr[i]);
      dep[i] = null;
    } else {
      dep[i] = stops[i].dep != null ? parseClock(stops[i].dep) : ceilTo(arr[i] + dwell(stops[i]) * T.timeScale);
    }
  }

  return {
    dep,
    arr,
    drive,
    start: dep[0],
    // When the tram should pass s: interpolated along the reference profile between departure and arrival.
    at(s) {
      let i = 0;
      while (i < last - 1 && s >= stops[i + 1].s) i++;
      const a = Math.round(stops[i].s), b = Math.round(stops[i + 1].s);
      const m = Math.min(Math.max(Math.round(s), a), b);
      const f = (tref[m] - tref[a]) / Math.max(1e-6, tref[b] - tref[a]);
      return dep[i] + f * (arr[i + 1] - dep[i]);
    },
  };
}
