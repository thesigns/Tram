import { COMFORT } from '../config.js';
import { EB } from './tram.js';

// Passenger comfort 0–100 (GDD §6.3). It falls with sudden changes of acceleration (jumping notches,
// stopping on a hard brake), lateral acceleration above the curve design value, the emergency brake
// and doors closed on boarding passengers. It recovers slowly on a smooth ride.
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

  update(dt, tram, lateral) {
    const C = COMFORT;
    let loss = C.jerk * Math.max(0, Math.abs(tram.da) - C.jerkFree * dt);
    loss += C.lateral * Math.max(0, lateral - C.lateralFree) * dt;
    if (tram.notch === EB && this.lastNotch !== EB) loss += C.emergency;
    this.lastNotch = tram.notch;
    if (loss > 0) this.hit(loss);
    else this.value = Math.min(100, this.value + C.recover * dt);
    this.recent *= Math.exp(-2 * dt);
    this.sum += this.value * dt;
    this.time += dt;
  }
}
