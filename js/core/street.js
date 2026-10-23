import { BRIDGE, PHYSICS, STREET, TIMETABLE } from '../config.js';
import { mulberry32 } from './utils.js';

const { PI } = Math;
const WALK = 1.5;   // walking speed [m/s]

// How far ahead the tram can still stop. A hazard commits only inside the "commit" distance (a calm
// service-brake stop) and never inside the "fair" one (B4 after a short reaction): every hazard can be
// handled, and a driver who reads the street never needs the emergency brake (GDD §7). Downhill and on
// wet rails the brakes give less (st.loss, st.cap), so both distances grow.
const decel = (brake, st) => Math.max(0.3, Math.min(brake, st.cap) - st.loss);
const commitDist = (v, st) => (v * v) / (2 * decel(STREET.commitBrake, st)) + v * STREET.commitReaction + STREET.commitMargin;
const fairDist = (v, st) => (v * v) / (2 * decel(STREET.fairBrake, st)) + v * STREET.fairReaction + STREET.fairMargin;

// Anything moving on the street, in track coordinates: s along the track, off to the right of it,
// dir = heading (0 = along the track, π/2 = to the right). len × wid is the footprint.
function agent(kind, len, wid) {
  return {
    kind, len, wid, s: 0, off: 0, dir: 0, speed: 0, visible: false, state: 'idle',
    blink: null,   // 'left' | 'right' | 'hazard'
    step: 0,       // distance walked / ridden, for animation
    color: 0,
    cooldown: 0,   // after a minor collision
    quiet: false,  // no HUD warning (cross traffic)
  };
}

// Half-extents of the footprint along (hs) and across (ho) the track.
function extents(a) {
  const c = Math.abs(Math.cos(a.dir)), s = Math.abs(Math.sin(a.dir));
  return [(c * a.len + s * a.wid) / 2, (s * a.len + c * a.wid) / 2];
}

// An oncoming car waiting to turn left across the tracks, blinker on. Some drivers misjudge the gap
// and turn in front of the tram; the bell makes them wait.
class LeftTurn {
  constructor(def, st) {
    this.def = def;
    this.agent = st.add(agent('car', 4.3, 1.8));
    this.conflict = def.s - 3.5;   // the tram front has to stop before this
  }

  reset(rnd) {
    this.active = rnd() < (this.def.chance ?? 1);
    this.patient = rnd() < 0.3;
    Object.assign(this.agent, { visible: false, state: 'idle', blink: null, cooldown: 0, color: Math.floor(rnd() * 8) });
  }

  bell() {
    if (this.agent.state === 'approach' || this.agent.state === 'wait') this.patient = true;
  }

  update(dt, tram, st) {
    const c = this.agent, s0 = this.def.s, R = 6;
    if (!this.active) return;
    switch (c.state) {
      case 'idle':
        if (s0 - tram.s < 330) Object.assign(c, { state: 'approach', visible: true, s: s0 + 75, off: -2.7, dir: PI, speed: 9, blink: 'left' });
        break;
      case 'approach': {
        const left = c.s - (s0 + 4);
        c.speed = Math.min(9, Math.sqrt(Math.max(0, 5 * left)));
        c.s -= c.speed * dt;
        if (left < 0.05) { c.s = s0 + 4; c.speed = 0; c.state = 'wait'; }
        break;
      }
      case 'wait': {
        if (tram.s - st.length > s0 + 5) { this.turn(); break; }   // the tram has passed
        if (this.patient) break;
        const dist = this.conflict - tram.s;
        if (dist <= commitDist(tram.v, st) + tram.v * 0.5) {
          if (dist >= fairDist(tram.v, st)) this.turn(); else this.patient = true;
        }
        break;
      }
      case 'turn':
        // quarter circle from the oncoming lane into the cross street on the right
        c.speed = Math.min(5, c.speed + 2.5 * dt);
        this.phi = Math.min(PI / 2, this.phi + (c.speed * dt) / R);
        c.s = s0 + 4 - R * Math.sin(this.phi);
        c.off = -2.7 + R - R * Math.cos(this.phi);
        c.dir = Math.atan2(Math.sin(this.phi), -Math.cos(this.phi));
        if (this.phi >= PI / 2) { c.state = 'exit'; c.blink = null; }
        break;
      case 'exit':
        c.speed = Math.min(9, c.speed + 2.5 * dt);
        c.off += c.speed * dt;
        if (c.off > 45) { c.visible = false; c.state = 'gone'; }
        break;
      default:
    }
  }

  turn() {
    this.agent.state = 'turn';
    this.phi = 0;
  }
}

// A pedestrian at the kerb, looking at the street, who steps out in front of the tram.
// Before reaching the tracks the bell sends them back; on the tracks it makes them hurry.
class Jaywalker {
  constructor(def, st) {
    this.def = def;
    this.agent = st.add(agent('ped', 0.45, 0.45));
  }

  reset(rnd, st) {
    const d = this.def;
    this.kerb = st.roadHalf + 0.6;   // waiting on the kerb
    this.active = rnd() < (d.chance ?? 1);
    this.side = d.side === 'left' ? -1 : d.side === 'right' ? 1 : rnd() < 0.5 ? 1 : -1;
    this.patient = false;
    this.timer = 0;
    Object.assign(this.agent, {
      visible: this.active, state: 'wait', s: d.s + (rnd() - 0.5) * 6, off: this.side * this.kerb,
      dir: (-this.side * PI) / 2, speed: 0, step: 0, cooldown: 0, color: Math.floor(rnd() * 8),
    });
  }

  bell() {
    const p = this.agent;
    if (p.state === 'wait') this.patient = true;
    else if (p.state === 'walk') {
      if (p.off * this.side > STREET.envelope + 0.5) {
        p.state = 'back';
        p.dir = (this.side * PI) / 2;
        this.patient = true;
      } else {
        p.speed = 3;
      }
    }
  }

  update(dt, tram, st) {
    if (!this.active) return;
    const p = this.agent, toward = -this.side;
    switch (p.state) {
      case 'wait': {
        const passed = tram.s - st.length > p.s + 1;
        if (this.patient && !passed) break;
        const dist = p.s - 0.5 - tram.s;
        const lead = (this.kerb - STREET.envelope) / WALK;
        if (passed || dist <= commitDist(tram.v, st) + tram.v * lead * 0.6) {
          if (passed || dist >= fairDist(tram.v, st)) { p.state = 'walk'; p.speed = WALK; } else this.patient = true;
        }
        break;
      }
      case 'walk':
        p.off += toward * p.speed * dt;
        p.step += p.speed * dt;
        if (p.off * toward >= this.kerb) {
          Object.assign(p, { off: toward * this.kerb, state: 'away', dir: 0, speed: 1.2 });
          this.timer = 10;
        }
        break;
      case 'back':
        p.off += this.side * 1.8 * dt;
        p.step += 1.8 * dt;
        if (p.off * this.side >= this.kerb) Object.assign(p, { off: this.side * this.kerb, state: 'wait', dir: (toward * PI) / 2 });
        break;
      case 'away':
        p.s += p.speed * dt;
        p.step += p.speed * dt;
        this.timer -= dt;
        if (this.timer <= 0) { p.visible = false; p.state = 'gone'; }
        break;
      default:
    }
  }
}

// A delivery van double-parked too close to the rails, hazard lights on (GDD §7).
// Wait for the driver, or ring the bell to call them.
class Parked {
  constructor(def, st) {
    this.def = def;
    this.agent = st.add(agent('van', 5.4, 2.1));
  }

  reset(rnd) {
    this.active = rnd() < (this.def.chance ?? 1);
    this.waited = 0;
    this.timer = 0;
    Object.assign(this.agent, {
      visible: this.active, state: 'parked', s: this.def.s, off: 2, dir: 0, speed: 0, blink: 'hazard', cooldown: 0,
    });
  }

  bell() {
    if (this.agent.state === 'parked') { this.agent.state = 'driver'; this.timer = 2.5; }
  }

  update(dt, tram, st) {
    if (!this.active) return;
    const v = this.agent;
    switch (v.state) {
      case 'parked': {
        // nobody rang: the driver comes back after a while anyway
        const gap = v.s - v.len / 2 - tram.s;
        if (tram.stopped && gap > 0 && gap < 40) this.waited += dt;
        if (this.waited > 15) { v.state = 'driver'; this.timer = 1; }
        break;
      }
      case 'driver':
        this.timer -= dt;
        if (this.timer <= 0) { v.state = 'pull'; v.blink = 'right'; }
        break;
      case 'pull': {
        v.speed = Math.min(6, v.speed + 2 * dt);
        const lane = st.roadHalf - 1.5;   // the outer lane
        const ds = v.speed * dt, doff = Math.min(1.4 * dt, lane - v.off);
        v.s += ds;
        v.off += doff;
        v.dir = Math.atan2(doff, Math.max(ds, 1e-6));
        if (v.off >= lane - 1e-6) Object.assign(v, { state: 'drive', dir: 0, blink: null });
        break;
      }
      case 'drive':
        v.speed = Math.min(10, v.speed + 2 * dt);
        v.s += v.speed * dt;
        if (v.s > this.def.s + 250) { v.visible = false; v.state = 'gone'; }
        break;
      default:
    }
  }
}

// A cyclist waiting at the edge of the road who pulls onto the tracks ahead of the tram and rides
// between the rails. The bell sends them to the side of the road; otherwise they turn off at `turnAt`
// (an intersection).
class Cyclist {
  constructor(def, st) {
    this.def = def;
    this.agent = st.add(agent('bike', 1.8, 0.6));
  }

  reset(rnd, st) {
    this.active = rnd() < (this.def.chance ?? 1);
    this.aside = 0;
    this.patient = false;
    Object.assign(this.agent, {
      visible: this.active, state: 'wait', s: this.def.s, off: st.roadHalf - 1.6, dir: 0, speed: 0, cooldown: 0, step: 0,
      color: Math.floor(rnd() * 8),
    });
  }

  bell() {
    const b = this.agent;
    if (b.state === 'wait') this.patient = true;
    else if (b.state === 'ride' && this.aside === 0) this.aside = 0.8;   // reaction time
  }

  update(dt, tram, st) {
    if (!this.active) return;
    const b = this.agent, d = this.def, R = 4;
    switch (b.state) {
      case 'wait': {
        const passed = tram.s - st.length > b.s + 2;
        if (this.patient && !passed) break;
        const dist = b.s - tram.s;
        // it reaches the rails ~3 s after setting off, riding ahead of the tram
        if (passed || dist <= commitDist(tram.v, st) + tram.v * 1.5) {
          if (passed || dist >= fairDist(tram.v, st)) { b.state = 'ride'; b.speed = 2; } else this.patient = true;
        }
        break;
      }
      case 'ride':
        b.speed = Math.min(5, b.speed + 1.5 * dt);
        // behind the tram: keep a distance from its rear
        if (b.s < tram.s && b.s + b.len / 2 > tram.s - st.length - 4) b.speed = Math.min(b.speed, tram.v);
        b.s += b.speed * dt;
        b.step += b.speed * dt;
        if (this.aside === 0 && b.off > 0.85) {
          // pulling in between the rails
          b.off = Math.max(0.85, b.off - 1.5 * dt);
          b.dir = b.off > 0.85 ? -0.3 : 0;
        }
        if (this.aside > 0) {
          this.aside -= dt;
          if (this.aside <= 0) this.aside = -1;
        } else if (this.aside < 0 && b.off < 3.3) {
          b.off = Math.min(3.3, b.off + 1.2 * dt);
          b.dir = b.off < 3.3 ? 0.24 : 0;
        }
        if (d.turnAt && b.s >= d.turnAt - R) { b.state = 'turn'; this.phi = 0; this.s1 = b.s; this.o1 = b.off; }
        if (b.s > st.end) { b.visible = false; b.state = 'gone'; }
        break;
      case 'turn':
        this.phi = Math.min(PI / 2, this.phi + (b.speed * dt) / R);
        b.s = this.s1 + R * Math.sin(this.phi);
        b.off = this.o1 + R - R * Math.cos(this.phi);
        b.dir = this.phi;
        b.step += b.speed * dt;
        if (this.phi >= PI / 2) b.state = 'exit';
        break;
      case 'exit':
        b.off += b.speed * dt;
        b.step += b.speed * dt;
        if (b.off > 40) { b.visible = false; b.state = 'gone'; }
        break;
      default:
    }
  }
}

// A forklift crossing the street from a warehouse gate to the quay, with a crate on its forks (GDD §8).
// The bell makes it wait at the gate, or hurry if it has already set off.
class Forklift {
  constructor(def, st) {
    this.def = def;
    this.agent = st.add(agent('lift', 3, 1.3));
  }

  reset(rnd, st) {
    const d = this.def;
    this.side = d.side === 'left' ? -1 : 1;   // the gate side
    this.gate = st.roadHalf + 2.5;
    this.active = rnd() < (d.chance ?? 1);
    this.patient = false;
    this.timer = 0;
    Object.assign(this.agent, {
      visible: this.active, state: 'wait', s: d.s, off: this.side * this.gate, dir: (-this.side * PI) / 2,
      speed: 0, cooldown: 0, color: Math.floor(rnd() * 8),
    });
  }

  bell() {
    const f = this.agent;
    if (f.state === 'wait') this.patient = true;
    else if (f.state === 'cross') f.speed = 4;
  }

  update(dt, tram, st) {
    if (!this.active) return;
    const f = this.agent, toward = -this.side;
    switch (f.state) {
      case 'wait': {
        const passed = tram.s - st.length > f.s + 2;
        if (this.patient && !passed) break;
        const dist = f.s - f.wid / 2 - tram.s;
        const lead = (this.gate - f.len / 2 - STREET.envelope) / 2.5;   // until it fouls the tracks
        if (passed || dist <= commitDist(tram.v, st) + tram.v * lead * 0.6) {
          if (passed || dist >= fairDist(tram.v, st)) { f.state = 'cross'; f.speed = 2.5; } else this.patient = true;
        }
        break;
      }
      case 'cross':
        f.off += toward * f.speed * dt;
        if (f.off * toward >= st.roadHalf + 4) Object.assign(f, { state: 'away', dir: 0, speed: 3 });
        break;
      case 'away':
        // along the quay, then out of sight
        f.s += f.speed * dt;
        this.timer += dt;
        if (this.timer > 8) { f.visible = false; f.state = 'gone'; }
        break;
      default:
    }
  }
}

// A lifting bridge (GDD §8) with its own bridge signal (the tram signal aspects). When it is due to lift,
// the warning starts while the tram can still stop calmly: cross before it ends (a bonus) or wait.
// It never lifts with the tram on it; driving on while it is up ends the run.
class Bridge {
  constructor(def) {
    this.def = def;
    this.s0 = def.s;
    this.s1 = def.s + def.length;
    this.line = def.s - STREET.stopLineBack;
    this.s = def.s;   // like a Signal (the HUD, the signal head)
  }

  aspect() {
    const k = this.state;
    return k === 'down' ? 'go' : k === 'warning' ? 'prepare' : 'stop';
  }

  reset(rnd) {
    this.active = rnd() < (this.def.chance ?? 1);
    this.extra = rnd() * BRIDGE.triggerExtra;
    this.state = 'down';
    this.timer = 0;
    this.lift = 0;          // the leaves: 0 (down) … 1 (open)
    this.barriers = 0;      // 0 (up) … 1 (down)
    this.boat = null;       // 0 … 1 along the channel while the leaves are up
    this.done = false;
    this.waited = false;    // the tram stood before it while it was up
  }

  update(dt, tram, st, prevS) {
    const B = BRIDGE;
    if (prevS < this.line && tram.s >= this.line) {
      const a = this.aspect();
      if (a === 'stop') st.event('red', { signal: this });
      else if (a === 'prepare') st.event('bridge', { phase: 'made' });
      else if (this.waited) st.event('bridge', { phase: 'cleared', line: this.line });
    }
    if (this.lift > 0 && tram.s > this.s0 - 0.5 && tram.s - st.length < this.s1) st.event('fall', {});

    const fouling = tram.s >= this.line && tram.s - st.length <= this.s1 + 1;
    this.timer += dt;
    switch (this.state) {
      case 'down': {
        if (!this.active || this.done || tram.s >= this.line) break;
        const v = tram.v, calm = (v * v) / (2 * decel(STREET.commitBrake, st)) + v + 4;
        if (this.line - tram.s <= calm + this.extra) {
          this.state = 'warning';
          this.timer = 0;
          st.event('bridge', { phase: 'warning' });
        }
        break;
      }
      case 'warning':
        if (this.timer >= B.warning) { this.state = 'barriers'; this.timer = 0; }
        break;
      case 'barriers':
        this.barriers = Math.min(1, this.timer / B.barriers);
        // the bridge keeper waits for a tram that is already crossing
        if (this.barriers === 1 && !fouling) { this.state = 'lift'; this.timer = 0; }
        break;
      case 'lift':
        this.lift = Math.min(1, this.timer / B.lift);
        if (this.lift === 1) { this.state = 'open'; this.timer = 0; }
        break;
      case 'open':
        if (this.timer >= B.open) { this.state = 'lower'; this.timer = 0; }
        break;
      case 'lower':
        this.lift = Math.max(0, 1 - this.timer / B.lift);
        if (this.lift === 0) { this.state = 'reopen'; this.timer = 0; }
        break;
      case 'reopen':
        this.barriers = Math.max(0, 1 - this.timer / B.reopen);
        if (this.barriers === 0) { this.state = 'down'; this.done = true; }
        break;
      default:
    }
    if (this.lift > 0 && tram.s < this.line) this.waited = true;
    const up = this.state === 'lift' ? this.timer : this.state === 'open' ? B.lift + this.timer
      : this.state === 'lower' ? B.lift + B.open + this.timer : -1;
    this.boat = up >= 0 ? up / (2 * B.lift + B.open) : null;
  }
}

// A tram signal at an intersection, with cross traffic during the stop aspect (GDD §7). The phases are
// a green wave for the timetable: a punctual tram meets the middle of the go aspect. Cross traffic gives
// way to a tram in the intersection – unless it went through on the stop aspect.
class Signal {
  constructor(I, st) {
    const cfg = { ...STREET.signal, ...(typeof I.signal === 'object' ? I.signal : {}) };
    this.s = I.s;
    this.line = I.s - STREET.stopLineBack;
    this.cycle = cfg.cycle;
    this.go = cfg.go;
    this.prepare = cfg.prepare;
    this.tRef = 0;   // run time [real s] when a punctual tram passes the stop line
    this.cars = [0, 1, 2, 3].map(() => st.add(agent('car', 4.3, 1.8)));
  }

  phase(t) { return (((t - this.tRef + this.go / 2) % this.cycle) + this.cycle) % this.cycle; }
  cycleIndex(t) { return Math.floor((t - this.tRef + this.go / 2) / this.cycle); }

  aspect(t) {
    const p = this.phase(t);
    return p < this.go ? 'go' : p < this.go + this.prepare ? 'prepare' : 'stop';
  }

  reset() {
    this.violated = null;
    this.spawn = 0;
    this.side = 1;
    for (const c of this.cars) Object.assign(c, { visible: false, state: 'idle', quiet: true, cooldown: 0 });
  }

  update(dt, tram, st, prevS) {
    const t = st.signalTime;
    if (prevS < this.line && tram.s >= this.line && this.aspect(t) === 'stop') {
      this.violated = this.cycleIndex(t);
      st.event('red', { signal: this });
    }

    // cross traffic after a short all-red
    const p = this.phase(t);
    if (p > this.go + this.prepare + 1.5 && p < this.cycle - 2) {
      this.spawn -= dt;
      const car = this.cars.find((c) => !c.visible);
      if (this.spawn <= 0 && car) {
        // right-hand traffic: cars heading right drive on the near side of the cross street
        Object.assign(car, {
          visible: true, state: 'drive', dir: (this.side * PI) / 2, off: -this.side * 40,
          s: this.s - this.side * 2.5, speed: 9, color: Math.floor(st.rnd() * 8),
        });
        this.side = -this.side;
        this.spawn = 2.2 + st.rnd() * 2.5;
      }
    } else {
      this.spawn = 0;
    }

    const blocked = tram.s >= this.line - 0.3 && tram.s - st.length <= this.s + STREET.crossHalf
      && this.violated !== this.cycleIndex(t);
    for (const c of this.cars) {
      if (!c.visible) continue;
      const sign = Math.sin(c.dir) > 0 ? 1 : -1;
      const hold = -sign * (STREET.envelope + c.len / 2 + 1.5);   // where to stop before the tracks
      const before = (hold - c.off) * sign;                       // distance to that point
      if (blocked && before > -0.1) c.speed = Math.min(9, Math.sqrt(Math.max(0, 8 * before)));
      else c.speed = Math.min(9, c.speed + 3 * dt);
      c.off += sign * c.speed * dt;
      if (c.off * sign > 40) { c.visible = false; c.state = 'gone'; }
    }
  }
}

const HAZARDS = { leftTurn: LeftTurn, jaywalker: Jaywalker, parked: Parked, cyclist: Cyclist, forklift: Forklift };

// The living street (GDD §7): signals, cross traffic, scripted hazards and a lifting bridge, plus collision
// detection against the tram's swept path. Events go to onEvent(type, data): red, collision,
// bridge ({ phase: warning | made | cleared }), fall (onto the open bridge).
// Kept free of Three.js, so it can be tested in Node.
export class Street {
  constructor(route, track, timetable, tramLength, roadHalf, onEvent) {
    this.track = track;
    this.wet = route.wet ?? [];
    this.length = tramLength;
    this.roadHalf = roadHalf;
    this.end = track.length;
    this.onEvent = onEvent;
    this.agents = [];
    this.signals = (route.intersections ?? []).filter((I) => I.signal).map((I) => new Signal(I, this));
    // the green wave: when a punctual tram passes each stop line, counted from the start of the run
    const t0 = timetable.start - TIMETABLE.leadIn;
    for (const sg of this.signals) sg.tRef = (timetable.at(sg.line) - t0) / TIMETABLE.timeScale;
    this.hazards = (route.hazards ?? []).map((h) => new HAZARDS[h.type](h, this));
    // the bridge signal is listed with the tram signals (the HUD, signal heads)
    this.bridge = route.bridge ? new Bridge(route.bridge) : null;
    if (this.bridge) this.signals.push(this.bridge);
    this.signals.sort((a, b) => a.line - b.line);
    this.reset(1);
  }

  // The green wave shifts with the timetable when a bridge lift is excused (run.shift).
  get signalTime() { return this.time - this.lag; }

  // Wet rails anywhere in [s0, s1]?
  wetAt(s0, s1) { return this.wet.some((z) => z.from < s1 && z.to > s0); }

  add(a) {
    this.agents.push(a);
    return a;
  }

  event(type, data) { this.onEvent?.(type, data); }

  reset(seed) {
    this.rnd = mulberry32(seed);
    this.time = 0;
    this.lag = 0;           // [real s]
    this.warning = null;
    this.loss = 0;          // braking lost downhill [m/s²]
    this.cap = Infinity;    // the strongest brake that holds on the rails ahead [m/s²]
    for (const sg of this.signals) sg.reset(this.rnd);
    for (const h of this.hazards) h.reset(this.rnd, this);
  }

  // Hazards within earshot react to the bell.
  bell(tram) {
    for (const h of this.hazards) {
      const d = h.agent.s - tram.s;
      if (h.agent.visible && d > -this.length && d < STREET.bellRange) h.bell(tram);
    }
  }

  // The next tram signal ahead: { aspect, dist } or null.
  nextSignal(s) {
    for (const sg of this.signals) {
      const d = sg.line - s;
      if (d > -0.5 && d < STREET.signalAhead) return { aspect: sg.aspect(this.signalTime), dist: Math.max(0, d), bridge: sg === this.bridge };
    }
    return null;
  }

  update(dt, tram, prevS) {
    this.time += dt;
    // what the brakes can give ahead: less downhill and on wet rails
    const L = this.length, tr = this.track;
    this.loss = Math.max(0, -Math.min(tr.slope(tram.s - L, tram.s), tr.slope(tram.s, tram.s + 60)) * PHYSICS.g);
    this.cap = this.wetAt(tram.s - L, tram.s + 90) ? STREET.wetBrake : Infinity;
    for (const sg of this.signals) sg.update(dt, tram, this, prevS);
    for (const h of this.hazards) h.update(dt, tram, this);

    // collisions with the tram, and the nearest thing on (or about to be on) the tracks for the HUD
    this.warning = null;
    let nearest = STREET.warnRange;
    for (const a of this.agents) {
      if (!a.visible) continue;
      a.cooldown = Math.max(0, a.cooldown - dt);
      const [hs, ho] = extents(a);
      const fouling = Math.abs(a.off) - ho < STREET.envelope;
      if (fouling && a.cooldown === 0 && a.s + hs > tram.s - this.length && a.s - hs < tram.s) {
        a.cooldown = 3;
        this.event('collision', { agent: a });
      }
      if (a.quiet) continue;
      const soon = Math.abs(a.off + Math.sin(a.dir) * a.speed * 2) - ho < STREET.envelope;
      const dist = a.s - hs - tram.s;
      if ((fouling || soon) && dist > -1 && dist < nearest) {
        nearest = dist;
        this.warning = { kind: a.kind, dist: Math.max(0, dist) };
      }
    }
  }
}
