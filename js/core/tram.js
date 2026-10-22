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
    this.derailed = false;
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

  step(dt, grade = 0) {
    const cfg = this.cfg, P = PHYSICS;
    const n = this.notch;

    // traction and brake effort build up gradually – jumping notches is felt as jerk, not hidden
    let tracTarget = n > 0 && this.doorsClosed ? n / 4 : 0;
    let brakeTarget = n === EB ? BRAKE.emergency : n < 0 ? BRAKE.service[-n - 1] : 0;
    if (this.derailed) { tracTarget = 0; brakeTarget = P.derailDecel; }
    const tau = n === EB || this.derailed ? P.ebTau : P.effortTau;
    const k = 1 - Math.exp(-dt / tau);
    this.traction += (tracTarget - this.traction) * k;
    this.brake += (brakeTarget - this.brake) * k;

    const v = this.v;
    const aTraction = this.traction * tractionAccel(cfg, v);

    let a;
    if (v > 0) {
      a = aTraction - resistance(v, grade) - this.brake;
    } else {
      // standing: brakes and rolling resistance hold the tram until the drive overcomes them (forward only)
      const drive = aTraction - P.g * grade;
      a = drive > this.brake + P.rolling ? drive - this.brake - P.rolling : 0;
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
