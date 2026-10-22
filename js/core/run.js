import { COMFORT, LIMITS, STOPS, TIMETABLE } from '../config.js';
import { Comfort } from './comfort.js';
import { buildTimetable } from './timetable.js';
import { mulberry32 } from './utils.js';

// One run along a route: precision stops, doors, boarding, speed limits, comfort, timetable, score (GDD §6).
// stops[0] is where the run starts (doors closed, departure due); the last stop is the terminus.
// Events go out through emit(type, data): rating, missed, penalty, board, ready, departure, arrival,
// derail, done, hint.
export class Run {
  constructor(route, tramCfg, track, limits, emit) {
    this.tramCfg = tramCfg;
    this.limits = limits;
    this.emit = emit;
    const rnd = mulberry32(route.seed ?? 1);
    this.stops = route.stops.map((st, i) => {
      const end = st.s + STOPS.markerFromEnd;
      const last = i === route.stops.length - 1;
      return {
        name: st.name,
        s: st.s,
        dep: st.dep,
        start: end - STOPS.platformLength,
        end,
        waiting: i === 0 || last ? 0 : 2 + Math.floor(rnd() * 6),
      };
    });
    this.timetable = buildTimetable(track, limits, this.stops, tramCfg, route);
    this.comfort = new Comfort();
    this.reset();
  }

  reset() {
    this.idx = 1;               // target stop
    this.phase = 'drive';       // drive | board | ready | done | failed
    this.pts = { stops: 0, punctuality: 0, comfort: 0, overspeed: 0, penalties: 0 };
    this.combo = 0;
    this.bestCombo = 0;
    this.time = 0;              // real seconds since the start
    this.boarded = 0;
    this.boardTimer = 0;
    this.departPending = 0;     // the stop the tram stands at, served, until it moves off
    this.limit = this.limits.at(this.stops[0].s);
    this.overspeed = 0;         // km/h above the limit (negative = under)
    this.overAcc = 0;
    this.curve = null;          // the tightest curve under the tram
    this.lateral = 0;           // lateral acceleration [m/s²]
    this.delta = 0;             // behind schedule [game s], > 0 = late
    this.countdown = TIMETABLE.leadIn;   // at a stop: time to the departure [game s]
    this.fail = null;
    this.comfort.reset();
    // per stop: { name, rating, error, points, dev, punct, punctPoints }
    this.results = [{ name: this.stops[0].name, rating: 'START', error: null, points: 0, dev: null, punct: null, punctPoints: 0 }];
    this.byStop = { 0: this.results[0] };
  }

  get score() {
    const p = this.pts;
    return p.stops + p.punctuality + p.comfort + p.overspeed + p.penalties;
  }

  get target() { return this.stops[this.idx] ?? null; }
  get terminus() { return this.idx === this.stops.length - 1; }
  // Game clock [s since midnight].
  get clock() { return this.timetable.start - TIMETABLE.leadIn + this.time * TIMETABLE.timeScale; }

  // Distance from the tram front to the target marker (negative = overshoot).
  distance(s) { return this.target ? this.target.s - s : 0; }

  // Overshoot past the marker at which the front door can no longer be on the platform.
  missDistance(stop) { return stop.end - stop.s + this.tramCfg.doors[0] - STOPS.doorMargin; }

  doorsOnPlatform(stop, s) {
    const m = STOPS.doorMargin;
    return this.tramCfg.doors.every((d) => s - d - m >= stop.start && s - d + m <= stop.end);
  }

  // The doors button: open at standstill (rated at the target platform), or close.
  pressDoors(tram) {
    if (this.phase === 'done' || this.phase === 'failed') return;
    if (tram.doorsTarget === 1) {
      tram.setDoors(false);
      if (this.phase === 'board' || this.phase === 'ready') {
        if (this.phase === 'board' && this.target.waiting - this.boarded > 0) {
          this.penalty('left', STOPS.penaltyLeftBehind);
          this.comfort.hit(COMFORT.doorsSlam);
        }
        const served = this.idx;
        this.next();
        this.departPending = served;
      }
      return;
    }
    if (!tram.stopped) { this.emit('hint', { text: 'Stop first' }); return; }
    tram.setDoors(true);
    if (this.phase !== 'drive') return;
    if (this.doorsOnPlatform(this.target, tram.s)) {
      this.rate(tram.s);
    } else if (!this.stops.some((st) => this.doorsOnPlatform(st, tram.s))) {
      this.penalty('doorsAway', STOPS.penaltyDoorsAway);
    }
  }

  rate(s) {
    const st = this.target;
    const error = s - st.s;
    const r = STOPS.ratings.find((x) => Math.abs(error) <= x.max);
    const rating = r ? r.name : 'OK';
    const base = r ? r.points : STOPS.okPoints;
    this.combo = rating === 'PERFECT' || rating === 'GREAT' ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = this.combo >= 2 ? Math.min(STOPS.comboMax, 1 + STOPS.comboStep * (this.combo - 1)) : 1;
    const points = Math.round(base * mult);
    this.pts.stops += points;
    this.record({ name: st.name, rating, error, points });
    this.phase = 'board';
    this.boarded = 0;
    this.boardTimer = 0;
    this.emit('rating', { stop: this.idx, rating, error, points, mult });
    if (this.terminus) this.punctuality(this.idx, this.clock - this.timetable.arr[this.idx], true);
  }

  record(r) {
    const row = { dev: null, punct: null, punctPoints: 0, ...r };
    this.results.push(row);
    this.byStop[this.idx] = row;
  }

  // Departure from a stop (or arrival at the terminus) against the timetable.
  punctuality(stop, dev, arrival) {
    const T = TIMETABLE;
    let verdict, points;
    if (!arrival && dev < -T.earlyTolerance) {
      verdict = 'EARLY';
      points = -T.earlyPenalty;
    } else if (dev <= T.lateTolerance) {
      verdict = 'ON TIME';
      points = T.onTimePoints;
    } else {
      verdict = 'LATE';
      points = -Math.min(T.lateMax, Math.round(T.latePerSecond * (dev - T.lateTolerance)));
    }
    this.pts.punctuality += points;
    const row = this.byStop[stop];
    if (row) Object.assign(row, { dev, punct: verdict, punctPoints: points });
    this.emit(arrival ? 'arrival' : 'departure', { stop, dev, verdict, points });
  }

  penalty(reason, points) {
    this.pts.penalties -= points;
    this.emit('penalty', { reason, points });
  }

  next() {
    this.idx++;
    this.phase = this.idx < this.stops.length ? 'drive' : 'done';
    if (this.phase === 'done') {
      this.pts.comfort = Math.round(this.comfort.average * COMFORT.bonus);
      this.emit('done', {});
    }
  }

  derail(tram) {
    this.phase = 'failed';
    tram.derailed = true;
    this.fail = { reason: 'derail', kmh: tram.v * 3.6, limit: this.curve.kmh };
    this.emit('derail', this.fail);
  }

  update(dt, tram) {
    if (this.phase === 'done' || this.phase === 'failed') return;
    this.time += dt;
    const v = tram.v;

    // speed limits: points lost for every second over the limit (+ tolerance)
    this.limit = this.limits.at(tram.s);
    this.overspeed = v * 3.6 - this.limit;
    if (this.overspeed > LIMITS.tolerance) {
      this.overAcc += LIMITS.overspeedRate * dt;
      const whole = Math.floor(this.overAcc);
      this.overAcc -= whole;
      this.pts.overspeed -= whole;
    }

    // curves: discomfort above the design lateral acceleration, derailment far above the safe speed
    this.curve = this.limits.curveAt(tram.s);
    this.lateral = this.curve ? (v * v) / this.curve.radius : 0;
    if (this.curve && v > this.curve.safe * LIMITS.derail) { this.derail(tram); return; }
    this.comfort.update(dt, tram, this.lateral);

    // departure = the first movement after a served stop
    if (this.departPending !== null && v > 0) {
      const i = this.departPending;
      this.departPending = null;
      this.punctuality(i, this.clock - this.timetable.dep[i], false);
    }
    // countdown while standing at a stop, otherwise the live delta along the reference profile
    const at = this.phase === 'board' || this.phase === 'ready' ? this.idx : this.departPending;
    const dep = at !== null ? this.timetable.dep[at] : null;
    this.countdown = dep != null ? dep - this.clock : null;
    this.delta = this.countdown !== null ? Math.max(0, -this.countdown) : this.clock - this.timetable.at(tram.s);

    const st = this.target;
    if (this.phase === 'drive') {
      // the front door can no longer be on the platform: the stop is missed (forward only, no reversing)
      if (tram.s - st.s > this.missDistance(st)) {
        this.combo = 0;
        this.record({ name: st.name, rating: 'MISSED', error: tram.s - st.s, points: 0 });
        this.emit('missed', { stop: this.idx });
        this.next();
      }
      return;
    }

    if (this.phase === 'board' && tram.doors === 1) {
      this.boardTimer += dt;
      if (this.terminus) {
        if (this.boardTimer >= STOPS.alightTime) this.next();
        return;
      }
      while (this.boarded < st.waiting && this.boardTimer >= (this.boarded + 1) * STOPS.boardInterval) {
        this.emit('board', { stop: this.idx, k: this.boarded });
        this.boarded++;
      }
      if (this.boardTimer >= st.waiting * STOPS.boardInterval + STOPS.boardExtra) {
        this.phase = 'ready';
        this.emit('ready', {});
      }
    }
  }
}
