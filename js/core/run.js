import { LIMITS, LOOKS, PASSENGERS, PHYSICS, STOPS, STREET, TIMETABLE } from '../config.js';
import { EB } from './tram.js';
import { Comfort } from './comfort.js';
import { Crowd } from './crowd.js';
import { Street } from './street.js';
import { buildTimetable } from './timetable.js';
import { clamp, mulberry32 } from './utils.js';

// One run along a route: precision stops, doors, boarding, speed limits, comfort, the timetable, the street
// and the passengers (GDD §6, §7). stops[0] is where the run starts (doors closed, departure due); the last
// stop is the terminus. The score is the passengers' satisfaction at the end of the line (js/core/crowd.js);
// an accident ends the run.
// Events go out through emit(type, data): rating, missed, skipped, request, notice, board, arrive, ready,
// departure, arrival, bump, fail, done, hint, bridge, points, trip.
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
        index: i,
        name: st.name,
        s: st.s,
        dep: st.dep,
        request: !!st.request && i > 0 && !last,
        start: end - STOPS.platformLength,
        end,
        baseWaiting: i === 0 || last ? 0 : 2 + Math.floor(rnd() * 6),   // people built here (the timetable assumes them)
        requestAt: st.s,        // somebody inside presses the stop button when the tram passes this point
      };
    });
    this.timetable = buildTimetable(track, limits, this.stops, tramCfg, route);
    this.wet = route.wet ?? [];
    const roadHalf = LOOKS[route.look ?? 'modern'].roadHalf;
    this.street = new Street(route, track, this.timetable, tramCfg.length, roadHalf, (type, d) => this.streetEvent(type, d));
    this.comfort = new Comfort();
    this.crowd = new Crowd(this.stops);
    this.reset();
  }

  // seed: hazards, passengers and request stops differ from run to run
  reset(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.seed = seed;
    this.idx = 1;               // target stop
    this.phase = 'drive';       // drive | board | ready | done | failed
    this.time = 0;              // real seconds since the start
    this.boardTimer = 0;
    this.alightWait = 0;
    this.departPending = 0;     // the stop the tram stands at, served, until it moves off
    this.limit = this.limits.at(this.stops[0].s);
    this.overspeed = 0;         // km/h above the limit (negative = under)
    this.rough = 0;             // 0–1: how hard the tram shakes from going too fast
    this.curve = null;          // the tightest curve under the tram
    this.lateral = 0;           // lateral acceleration [m/s²]
    this.delta = 0;             // behind schedule [game s], > 0 = late
    this.countdown = TIMETABLE.leadIn;   // at a stop: time to the departure [game s]
    this.fail = null;
    this.prevS = this.stops[0].s;
    this.lastBell = -Infinity;
    this.stopRequested = false;
    this.shift = 0;             // the timetable moved by an excused bridge lift [game s]
    this.bridgeDelta = 0;       // the delay when the bridge warning started
    this.lastNotch = 0;
    this.comfort.reset();

    const rnd = mulberry32(seed);
    for (const st of this.stops) if (st.request) st.requestAt = st.s - 130 - rnd() * 80;
    this.street.reset(seed);
    this.crowd.reset(seed, this.timetable);

    // per stop: { stop, name, rating, error, dev, punct, on, off, left }
    this.results = [];
    this.byStop = {};
    this.record(0, { rating: 'START', error: null });
  }

  get score() { return this.crowd.score; }
  get satisfaction() { return this.crowd.satisfaction; }

  // Everybody delivered and (nearly) nobody upset.
  get perfect() {
    return this.phase === 'done'
      && this.crowd.people.every((p) => p.state === 'done' && this.crowd.anger(p) <= PASSENGERS.perfect);
  }

  get target() { return this.stops[this.idx] ?? null; }
  get terminus() { return this.idx === this.stops.length - 1; }
  get over() { return this.phase === 'done' || this.phase === 'failed'; }
  // Game clock [s since midnight].
  get clock() { return this.timetable.start - TIMETABLE.leadIn + this.time * TIMETABLE.timeScale; }
  // The clock the timetable is read against: an excused bridge lift moves the whole timetable.
  get sched() { return this.clock - this.shift; }
  // Departure and arrival times as they stand now [game s].
  depAt(i) { return this.timetable.dep[i] + this.shift; }
  arrAt(i) { return this.timetable.arr[i] + this.shift; }

  // Adhesion under the tram (GDD §5) for tram.step: lower on wet rails.
  grip(s) { return this.wet.some((z) => z.from < s && z.to > s - this.tramCfg.length) ? PHYSICS.wetGrip : Infinity; }

  // Wet rails under the tram (dist 0) or ahead: { dist } or null.
  wetAhead(s) {
    let best = null;
    for (const z of this.wet) {
      if (z.to <= s - this.tramCfg.length || z.from > s + STREET.wetWarn) continue;
      const dist = Math.max(0, z.from - s);
      if (!best || dist < best.dist) best = { dist };
    }
    return best;
  }

  // Does anybody need this stop? (Only request stops can be passed.)
  needed(st) {
    return !st.request || this.crowd.waitingAt(st.index, this.sched).length > 0 || this.crowd.ridersTo(st.index).length > 0;
  }

  // Distance from the tram front to the target marker (negative = overshoot).
  distance(s) { return this.target ? this.target.s - s : 0; }

  // Overshoot past the marker at which the front door can no longer be on the platform.
  missDistance(stop) { return stop.end - stop.s + this.tramCfg.doors[0] - STOPS.doorMargin; }

  doorsOnPlatform(stop, s) {
    const m = STOPS.doorMargin;
    return this.tramCfg.doors.every((d) => s - d - m >= stop.start && s - d + m <= stop.end);
  }

  // An emergency stop throws the riders forward: the faster, the angrier (the comfort falls too).
  emergencyStop(v) {
    if (v > 0) this.upsetRiders(PASSENGERS.emergency * (v * 3.6) / 50, 'emergency');
  }

  // Anger for everybody aboard.
  upsetRiders(amount, cause) {
    for (const p of this.crowd.riders) this.crowd.upset(p, amount, cause);
  }

  // The doors button: open at standstill (rated at the target platform), or close.
  pressDoors(tram) {
    if (this.over) return;
    if (tram.doorsTarget === 1) {
      tram.setDoors(false);
      if (this.phase === 'board' || this.phase === 'ready') {
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
      this.upsetRiders(PASSENGERS.doorsAway, 'safety');
      this.emit('notice', { text: 'Doors opened away from a platform', bad: true });
    }
  }

  // The points ahead (◄ ▲ ►): set them, if there are any within reach.
  setPoints(dir, tram) {
    const j = this.over ? null : this.street.nextJunction(tram.s);
    if (j?.throw(dir, tram)) this.emit('points', { junction: j, dir });
  }

  // The bell: hazards ahead react (GDD §4.1); ringing in quick succession upsets the passengers.
  bell(tram) {
    if (this.over) return;
    if (this.time - this.lastBell < STREET.bellSpam) this.comfort.hit(STREET.bellSpamComfort);
    this.lastBell = this.time;
    this.street.bell(tram);
  }

  // Doors open at the target platform: the stop is rated, the riders for this stop get off.
  rate(s) {
    const st = this.target, i = this.idx;
    const error = s - st.s;
    this.phase = 'board';
    this.boardTimer = 0;
    // stopping is always right, also at a request stop nobody needed
    const r = STOPS.ratings.find((x) => Math.abs(error) <= x.max);
    const rating = r ? r.name : 'OK';
    const off = this.terminus ? this.crowd.riders : this.crowd.ridersTo(i);
    // the people getting on and off here walk less or more to the doors
    for (const p of [...off, ...this.crowd.waitingAt(i, this.sched)]) this.crowd.upset(p, PASSENGERS.stop[rating], 'stopping');
    for (const p of off) p.state = 'done';
    this.alightWait = off.length ? 1 : 0;
    this.record(i, { rating, error, off: off.length });
    this.emit('rating', { stop: i, rating, error, off: off.length });
    if (this.terminus) this.punctuality(i, this.sched - this.timetable.arr[i], true);
  }

  record(i, r) {
    const row = { stop: i, name: this.stops[i].name, dev: null, punct: null, on: 0, off: 0, left: 0, ...r };
    this.results.push(row);
    this.byStop[i] = row;
  }

  // Departure from a stop (or arrival at the terminus) against the timetable – the passengers feel it
  // (crowd.update); this is the verdict for the HUD and the results.
  punctuality(stop, dev, arrival) {
    const T = TIMETABLE;
    const verdict = !arrival && dev < -T.earlyTolerance ? 'EARLY' : dev <= T.lateTolerance ? 'ON TIME' : 'LATE';
    const row = this.byStop[stop];
    if (row) Object.assign(row, { dev, punct: verdict });
    this.emit(arrival ? 'arrival' : 'departure', { stop, dev, verdict });
  }

  next() {
    this.idx++;
    this.stopRequested = false;
    this.phase = this.idx < this.stops.length ? 'drive' : 'done';
    if (this.phase === 'done') {
      for (const p of this.crowd.riders) p.state = 'done';
      this.emit('done', {});
    }
  }

  // The run ends: an accident (a person, a car at speed, the open bridge).
  failRun(tram, reason, extra = {}) {
    this.phase = 'failed';
    tram.halted = true;
    this.fail = { reason, kmh: tram.v * 3.6, ...extra };
    this.emit('fail', this.fail);
  }

  streetEvent(type, d) {
    const tram = this.tram;
    if (this.over) return;
    if (type === 'red') {
      this.upsetRiders(PASSENGERS.signal, 'safety');
      this.emit('notice', { text: d.signal === this.street.bridge ? 'Passed the bridge signal' : 'Passed a stop signal', bad: true });
    }
    if (type === 'fall') this.failRun(tram, 'bridge');
    if (type === 'trip') {
      // train protection: the emergency brake, until the tram stands before the points
      tram.trip = true;
      this.comfort.hit(this.comfort.emergency(tram.v));
      this.emergencyStop(tram.v);
      this.emit('trip', {});
    }
    if (type === 'bridge') {
      if (d.phase === 'warning') this.bridgeDelta = this.sched - this.timetable.at(tram.s);
      if (d.phase === 'cleared') {
        // the delay the lift caused doesn't count: the timetable (and the green wave) moves with it
        const excuse = Math.max(0, Math.round(this.sched - this.timetable.at(d.line) - this.bridgeDelta));
        this.shift += excuse;
        this.street.lag = this.shift / TIMETABLE.timeScale;
        d = { ...d, excuse };
      }
      this.emit('bridge', d);
    }
    if (type === 'collision') {
      const kind = d.agent.kind;
      if (kind === 'ped' || kind === 'bike') this.failRun(tram, kind === 'ped' ? 'pedestrian' : 'cyclist');
      else if (tram.v * 3.6 > STREET.fatalSpeed) this.failRun(tram, 'collision', { what: kind });
      else {
        // a bump: the tram stops dead, the passengers are not amused
        this.upsetRiders(PASSENGERS.bump, 'safety');
        this.comfort.hit(STREET.collisionComfort);
        tram.v = 0;
        this.emit('bump', {});
      }
    }
  }

  update(dt, tram) {
    if (this.over) return;
    this.tram = tram;
    this.time += dt;
    const v = tram.v;

    // too fast: over the limit the tram shakes, in a curve it lurches – the comfort falls (no derailing)
    this.limit = this.limits.at(tram.s);
    this.overspeed = v * 3.6 - this.limit;
    this.curve = this.limits.curveAt(tram.s);
    this.lateral = this.curve ? (v * v) / this.curve.radius : 0;
    const over = this.overspeed - LIMITS.tolerance;
    this.rough = clamp(Math.max(0, over) / 20 + Math.max(0, this.lateral - LIMITS.aLat) / 2, 0, 1);

    // the street: signals, traffic, hazards, collisions
    this.street.update(dt, tram, this.prevS);
    this.prevS = tram.s;
    if (this.over) return;
    if (tram.notch === EB && this.lastNotch !== EB) this.emergencyStop(v);
    this.lastNotch = tram.notch;
    this.comfort.update(dt, tram, this.lateral, over);
    this.crowd.update(dt, this.sched, this.timetable, this.comfort.value);
    for (const p of this.crowd.arrivals(this.sched)) this.emit('arrive', { person: p });

    // departure = the first movement after a served stop; whoever is still on the platform stays there
    if (this.departPending !== null && v > 0) {
      const i = this.departPending;
      this.departPending = null;
      const left = this.crowd.people.filter((p) => p.state === 'waiting' && p.from === i);
      for (const p of left) this.crowd.strand(p, 'left');
      if (left.length) {
        this.byStop[i].left = left.length;
        this.emit('notice', { text: `${left.length} left behind on the platform`, bad: true });
      }
      this.punctuality(i, this.sched - this.timetable.dep[i], false);
    }
    // countdown while standing at a stop, otherwise the live delta along the reference profile
    const at = this.phase === 'board' || this.phase === 'ready' ? this.idx : this.departPending;
    const dep = at !== null ? this.timetable.dep[at] : null;
    this.countdown = dep != null ? dep - this.sched : null;
    this.delta = this.countdown !== null ? Math.max(0, -this.countdown) : this.sched - this.timetable.at(tram.s);

    const st = this.target;
    if (this.phase === 'drive') {
      // somebody inside presses the stop button
      if (st.request && !this.stopRequested && tram.s >= st.requestAt && this.crowd.ridersTo(this.idx).length) {
        this.stopRequested = true;
        this.emit('request', {});
      }
      // the front door can no longer be on the platform: passed (forward only, no reversing)
      if (tram.s - st.s > this.missDistance(st)) {
        if (!this.needed(st)) {
          this.record(this.idx, { rating: 'PASSED', error: null });
          this.emit('skipped', { stop: this.idx });
        } else {
          // carried past their stop: they get off at the next one; the people waiting stay behind
          for (const p of this.crowd.ridersTo(this.idx)) {
            this.crowd.upset(p, PASSENGERS.missed, 'missed');
            p.to = Math.min(this.idx + 1, this.stops.length - 1);
          }
          const left = this.crowd.people.filter((p) => p.state === 'waiting' && p.from === this.idx);
          for (const p of left) this.crowd.strand(p, 'missed');
          this.record(this.idx, { rating: 'MISSED', error: tram.s - st.s, left: left.length });
          this.emit('missed', { stop: this.idx });
        }
        this.next();
      }
    }

    // boarding while the doors are open at a stop: at the target (board, ready) or, doors opened
    // again, at the stop just served – latecomers can still make it
    const boardAt = this.phase === 'board' || this.phase === 'ready' ? this.idx
      : this.departPending !== null && this.doorsOnPlatform(this.stops[this.departPending], tram.s) ? this.departPending : null;
    if (boardAt === null || tram.doors < 1) return;
    this.boardTimer += dt;
    if (this.phase === 'board' && this.terminus) {
      if (this.boardTimer >= STOPS.alightTime) this.next();
      return;
    }
    const queue = this.crowd.waitingAt(boardAt, this.sched);
    if (queue.length) {
      if (this.phase === 'ready') this.phase = 'board';
      if (this.boardTimer >= STOPS.boardInterval) {
        const p = queue[0];
        p.state = 'riding';
        this.byStop[boardAt].on++;
        this.boardTimer = 0;
        this.emit('board', { stop: boardAt, person: p });
      }
    } else if (this.phase === 'board' && this.boardTimer >= STOPS.boardExtra + this.alightWait) {
      this.phase = 'ready';
      this.emit('ready', {});
    }
  }
}
