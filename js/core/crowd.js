import { PASSENGERS, STOPS, TIMETABLE } from '../config.js';
import { mulberry32 } from './utils.js';

// Everybody who rides the line in one run (GDD §6.3). A passenger waits at one stop and rides to another;
// their anger (0 calm … 1 furious) has a lasting part and a "shaken" part from a rough ride, which fades
// again on a smooth one. Their satisfaction (1 − anger) at the end of the line is the score.
// state: waiting | riding | done | stranded (left behind). Kept free of Three.js, so it can be tested in Node.
export class Crowd {
  constructor(stops) {
    this.stops = stops;
    this.people = [];
    this.lost = {};
  }

  // stops[i].baseWaiting people wait at stop i (a few only arrive just before the departure), and some are
  // aboard from the start. Request stops: sometimes nobody needs them, sometimes only somebody inside.
  reset(seed, timetable) {
    const P = PASSENGERS, stops = this.stops, last = stops.length - 1;
    const rnd = mulberry32(seed * 31 + 17);
    this.people = [];
    this.lost = {};     // anger added (or taken away) by cause, summed over everybody – for the results
    const plan = stops.map((st) => {
      if (!st.request) return 'normal';
      if (rnd() < STOPS.requestEmpty) return 'empty';
      return rnd() < STOPS.requestInside ? 'inside' : 'normal';
    });
    const add = (from, slot) => {
      const to = stops.map((_, j) => j).filter((j) => j > from && plan[j] !== 'empty');
      const p = { from, to: to[Math.floor(rnd() * to.length)], base: 0, shaken: 0, state: 'waiting', slot, arrive: -Infinity, here: true };
      this.people.push(p);
      return p;
    };
    const aboard = P.onBoard[0] + Math.floor(rnd() * (P.onBoard[1] - P.onBoard[0] + 1));
    for (let k = 0; k < aboard; k++) add(0, -1).state = 'riding';
    for (let i = 1; i < last; i++) {
      if (plan[i] !== 'normal') continue;
      for (let k = 0; k < stops[i].baseWaiting; k++) {
        const p = add(i, k);
        if (!stops[i].request && rnd() < P.latecomer) {
          p.arrive = timetable.dep[i] - (3 + rnd() * 9) * TIMETABLE.timeScale;
          p.here = false;
        }
      }
    }
    plan.forEach((k, i) => {
      if (k !== 'inside') return;
      const riders = this.people.filter((p) => p.from < i && p.to > i);
      if (riders.length) riders[Math.floor(rnd() * riders.length)].to = i;
    });
  }

  anger(p) { return Math.min(1, p.base + p.shaken); }

  // More anger for one passenger (less, if negative – the shaken part goes first), recorded by cause.
  upset(p, amount, cause, shaken = false) {
    const before = this.anger(p);
    if (amount < 0) {
      const s = Math.min(p.shaken, -amount);
      p.shaken -= s;
      if (!shaken) p.base = Math.max(0, p.base + amount + s);
    } else if (shaken) p.shaken = Math.min(1, p.shaken + amount);
    else p.base = Math.min(1, p.base + amount);
    const d = this.anger(p) - before;
    if (d) this.lost[cause] = (this.lost[cause] ?? 0) + d;
  }

  // Left behind on the platform: as angry as it gets, and never delivered.
  strand(p, cause) {
    this.upset(p, 1, cause);
    p.state = 'stranded';
  }

  // At stop i: the people waiting there by now (sched: the timetable clock).
  waitingAt(i, sched) { return this.people.filter((p) => p.state === 'waiting' && p.from === i && p.arrive <= sched); }
  ridersTo(i) { return this.people.filter((p) => p.state === 'riding' && p.to === i); }
  get riders() { return this.people.filter((p) => p.state === 'riding'); }

  // Latecomers who have just reached their platform.
  arrivals(sched) {
    const out = [];
    for (const p of this.people) {
      if (!p.here && p.state === 'waiting' && p.arrive <= sched) {
        p.here = true;
        out.push(p);
      }
    }
    return out;
  }

  // A rough ride shakes the riders (it fades on a smooth one); a late tram angers everybody whose stop
  // it should have reached by now – waiting there, or riding to it.
  update(dt, sched, timetable, comfort) {
    const P = PASSENGERS, T = TIMETABLE;
    const rough = Math.max(0, (P.comfortCalm - comfort) / P.comfortCalm);
    for (const p of this.people) {
      if (p.state === 'riding') {
        if (rough > 0) this.upset(p, P.comfortRate * rough * dt, 'comfort', true);
        else if (comfort > P.calmAbove && p.shaken > 0) this.upset(p, -P.calmDown * dt, 'comfort', true);
      }
      const stop = p.state === 'riding' ? p.to : p.state === 'waiting' && p.here ? p.from : -1;
      if (stop < 0) continue;
      const over = sched - timetable.arr[stop] - T.lateTolerance;
      if (over > 0) this.upset(p, P.late * dt * T.timeScale, 'late');
    }
  }

  // { green, yellow, red } – the HUD colours.
  counts() {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const p of this.people) {
      const a = this.anger(p);
      c[a >= PASSENGERS.red ? 'red' : a >= PASSENGERS.yellow ? 'yellow' : 'green']++;
    }
    return c;
  }

  // Average satisfaction 0–1, and the score: satisfaction × PASSENGERS.points per passenger.
  get satisfaction() {
    const n = this.people.length;
    return n ? this.people.reduce((sum, p) => sum + 1 - this.anger(p), 0) / n : 1;
  }

  get score() { return Math.round(this.satisfaction * this.people.length * PASSENGERS.points); }
}
