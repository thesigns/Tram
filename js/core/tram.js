import { BRAKE, PHYSICS } from '../config.js';
import { clamp } from './utils.js';

// Notches of the master controller: EB = -5, B4..B1 = -4..-1, N = 0, P1..P4 = 1..4.
export const EB = -5;
export const notchName = (n) => (n === EB ? 'EB' : n < 0 ? `B${-n}` : n > 0 ? `P${n}` : 'N');

// Traction motor at full power: constant force up to the base speed, then constant power,
// cut-off at max speed [m/s²].
export function tractionAccel(cfg, v) {
  return (cfg.tractiveForce * Math.min(1, cfg.baseSpeed / Math.max(v, 0.01))
    * clamp((cfg.maxSpeed - v) / 1.5, 0, 1)) / cfg.mass;
}

// Rolling resistance, drag and the gradient while moving [m/s²].
export const resistance = (v, grade) => PHYSICS.rolling + PHYSICS.aero * v * v + PHYSICS.g * grade;

// Longitudinal tram dynamics along the track (GDD §5). Position = s, the distance of the front along the route.
// Kept free of Three.js, so it can be tested in Node.
export class Tram {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset(0);
  }

  reset(s) {
    this.s = s;
    this.v = 0;
    this.a = 0;
    this.jerk = 0;
    this.notch = 0;
    this.traction = 0;    // actual traction effort 0..1 (follows the notch with a lag)
    this.brake = 0;       // actual brake deceleration [m/s²]
    this.doors = 0;       // 0 = closed … 1 = fully open
    this.doorsTarget = 0;
    this.da = 0;          // change of acceleration in the last step (comfort)
    this.halted = false;  // the run has ended (derailment, collision): grind to a halt
    this.slide = false;   // the brake asks for more than the rail can give (GDD §5 adhesion)
    this.slip = false;    // … or the power does
  }

  get stopped() { return this.v === 0; }
  get doorsClosed() { return this.doors === 0 && this.doorsTarget === 0; }
  // Interlock: power is cut while any door is open (GDD §4.1).
  get interlocked() { return !this.doorsClosed && this.notch > 0; }

  setDoors(open) {
    if (open && !this.stopped) return false;
    this.doorsTarget = open ? 1 : 0;
    return true;
  }

  // grip: the adhesion available [m/s²] (Infinity on dry rails)
  step(dt, grade = 0, grip = Infinity) {
    const cfg = this.cfg, P = PHYSICS;
    const n = this.notch;

    // traction and brake effort build up gradually – jumping notches is felt as jerk, not hidden
    let tracTarget = n > 0 && this.doorsClosed ? n / 4 : 0;
    let brakeTarget = n === EB ? BRAKE.emergency : n < 0 ? BRAKE.service[-n - 1] : 0;
    if (this.halted) { tracTarget = 0; brakeTarget = P.haltDecel; }
    const tau = n === EB || this.halted ? P.ebTau : P.effortTau;
    const k = 1 - Math.exp(-dt / tau);
    this.traction += (tracTarget - this.traction) * k;
    this.brake += (brakeTarget - this.brake) * k;

    const v = this.v;
    // asking for more than the grip slides or slips the wheels; the emergency brake works anyway
    const full = tractionAccel(cfg, v);
    this.slide = n !== EB && !this.halted && brakeTarget > grip && v > 0;
    this.slip = tracTarget * full > grip;
    const brake = this.slide ? Math.min(this.brake, grip * P.slideFactor) : this.brake;
    const aTraction = this.slip ? Math.min(this.traction * full, grip * P.slideFactor) : this.traction * full;

    let a;
    if (v > 0) {
      a = aTraction - resistance(v, grade) - brake;
    } else if (brake > 0.05 || !this.doorsClosed) {
      // standing: any brake notch (or open doors) holds the tram – a hill can't push it away
      a = Math.max(0, aTraction - Math.max(0, P.g * grade) - brake - P.rolling);
    } else {
      // brakes released: the drive (or the hill, forward only) moves it once it beats rolling resistance
      const drive = aTraction - P.g * grade;
      a = drive > P.rolling ? drive - P.rolling : 0;
    }

    let v2 = v + a * dt;
    if (v2 <= 0) {
      // stopped within this step: advance only to the standstill point
      this.s += v > 0 && a < 0 ? (v * v) / (-2 * a) : 0;
      v2 = 0;
      a = v > 0 ? -v / dt : 0;
    } else {
      this.s += (v + v2) * 0.5 * dt;
    }
    this.v = v2;

    // the change of acceleration drives the comfort meter; jerk is lightly smoothed for ?debug
    this.da = a - this.a;
    this.jerk += (this.da / dt - this.jerk) * 0.2;
    this.a = a;

    // doors
    const dd = dt / P.doorTime;
    if (this.doorsTarget > this.doors) this.doors = Math.min(this.doorsTarget, this.doors + dd);
    else if (this.doorsTarget < this.doors) this.doors = Math.max(this.doorsTarget, this.doors - dd);
  }
}
