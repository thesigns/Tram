import { COMFORT } from '../config.js';
import { EB } from './tram.js';

// Ride comfort 0–100 (GDD §6.3): how the ride feels right now. It falls with sudden changes of
// acceleration (jumping notches, stopping on a hard brake), a curve taken too fast, driving over the
// limit (the tram shakes) and the emergency brake, and recovers within seconds on a smooth ride.
// A low comfort angers the riders (js/core/crowd.js).
export class Comfort {
  constructor() {
    this.reset();
  }

  reset() {
    this.value = 100;
    this.sum = 0;
    this.time = 0;
    this.recent = 0;      // recent losses, decaying – for the HUD flash
    this.lastNotch = 0;
  }

  get average() { return this.time > 0 ? this.sum / this.time : this.value; }

  hit(points) {
    this.value = Math.max(0, this.value - points);
    this.recent += points;
  }

  // lateral: lateral acceleration [m/s²]; over: km/h over the limit + tolerance
  update(dt, tram, lateral, over) {
    const C = COMFORT;
    let loss = C.jerk * Math.max(0, Math.abs(tram.da) - C.jerkFree * dt);
    loss += C.lateral * Math.max(0, lateral - C.lateralFree) * dt;
    loss += C.overspeed * Math.max(0, over) * dt;
    if (tram.notch === EB && this.lastNotch !== EB) loss += C.emergency;
    this.lastNotch = tram.notch;
    if (loss > 0) this.hit(loss);
    else this.value = Math.min(100, this.value + C.recover * dt);
    this.recent *= Math.exp(-2 * dt);
    this.sum += this.value * dt;
    this.time += dt;
  }
}
