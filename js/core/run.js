import { STOPS } from '../config.js';
import { mulberry32 } from './utils.js';

// One run along a route: precision stops, doors, boarding, score (GDD §6).
// stops[0] is where the run starts (doors closed, ready to depart); the last stop is the terminus.
// Events go out through emit(type, data): rating, missed, penalty, board, ready, done.
export class Run {
  constructor(route, tramCfg, emit) {
    this.tramCfg = tramCfg;
    this.emit = emit;
    const rnd = mulberry32(route.seed ?? 1);
    this.stops = route.stops.map((st, i) => {
      const end = st.s + STOPS.markerFromEnd;
      const last = i === route.stops.length - 1;
      return {
        name: st.name,
        s: st.s,
        start: end - STOPS.platformLength,
        end,
        waiting: i === 0 || last ? 0 : 2 + Math.floor(rnd() * 6),
      };
    });
    this.reset();
  }

  reset() {
    this.idx = 1;               // target stop
    this.phase = 'drive';       // drive | board | ready | done
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.time = 0;
    this.boarded = 0;
    this.boardTimer = 0;
    this.results = [];          // per stop: { name, rating, error, points }
  }

  get target() { return this.stops[this.idx] ?? null; }
  get terminus() { return this.idx === this.stops.length - 1; }

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
    if (this.phase === 'done') return;
    if (tram.doorsTarget === 1) {
      tram.setDoors(false);
      if (this.phase === 'board') {
        const left = this.target.waiting - this.boarded;
        if (left > 0) this.penalty('left', STOPS.penaltyLeftBehind);
        this.next();
      } else if (this.phase === 'ready') {
        this.next();
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
    this.score += points;
    this.results.push({ name: st.name, rating, error, points });
    this.phase = 'board';
    this.boarded = 0;
    this.boardTimer = 0;
    this.emit('rating', { stop: this.idx, rating, error, points, mult });
  }

  penalty(reason, points) {
    this.score -= points;
    this.emit('penalty', { reason, points });
  }

  next() {
    this.idx++;
    this.phase = this.idx < this.stops.length ? 'drive' : 'done';
    if (this.phase === 'done') this.emit('done', {});
  }

  update(dt, tram) {
    if (this.phase === 'done') return;
    this.time += dt;
    const st = this.target;

    if (this.phase === 'drive') {
      // the front door can no longer be on the platform: the stop is missed (forward only, no reversing)
      if (tram.s - st.s > this.missDistance(st)) {
        this.combo = 0;
        this.results.push({ name: st.name, rating: 'MISSED', error: tram.s - st.s, points: 0 });
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
