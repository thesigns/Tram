import { COMFORT } from '../config.js';
import { clamp } from '../core/utils.js';

const JOINT = 15;                       // rail length between joints [m]
const AXLES = [1.8, 3.6, 11.4, 13.2];   // axles behind the front [m]

// Sound synthesized with Web Audio – no audio files (GDD §12).
// Traction motor: growl + gear whine rising with speed; rolling noise; rail-joint clacks; brake squeal.
export class Sound {
  constructor() {
    this.ctx = null;
    this.lastS = null;
    this.nextDing = 0;
  }

  // Must be called from a user-gesture handler (autoplay policy).
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filter = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };

    this.growl = osc('sawtooth', 40);
    this.growlFilter = filter('lowpass', 300, 3);
    this.growlGain = gain();
    this.growl.connect(this.growlFilter).connect(this.growlGain).connect(this.master);

    this.whine = osc('sine', 200);
    this.whineGain = gain();
    this.whine.connect(this.whineGain).connect(this.master);

    const roll = ctx.createBufferSource();
    roll.buffer = this.noise;
    roll.loop = true;
    roll.start();
    this.rollFilter = filter('lowpass', 300);
    this.rollGain = gain();
    roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);

    this.squeal = osc('triangle', 2350);
    const vib = osc('sine', 7);
    const vibGain = gain(25);
    vib.connect(vibGain).connect(this.squeal.frequency);
    this.squealGain = gain();
    this.squeal.connect(this.squealGain).connect(this.master);

    // wheel flanges grinding in a curve taken too fast
    const flange = osc('sawtooth', 3400);
    const wobble = osc('sine', 13);
    const wobbleGain = gain(160);
    wobble.connect(wobbleGain).connect(flange.frequency);
    this.flangeGain = gain();
    flange.connect(filter('bandpass', 3400, 6)).connect(this.flangeGain).connect(this.master);
  }

  update(tram, run) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = tram.v;
    const moving = clamp(v / 2, 0, 1);
    // electric braking makes the motors sing too
    const effort = Math.max(tram.traction, Math.min(1, tram.brake / 1.6) * 0.7 * moving);
    this.growl.frequency.setTargetAtTime(28 + v * 6, t, 0.05);
    this.growlFilter.frequency.setTargetAtTime(180 + v * 30 + effort * 250, t, 0.1);
    this.growlGain.gain.setTargetAtTime((0.02 + effort * 0.16) * Math.max(moving, tram.traction), t, 0.08);
    // slipping wheels spin up: the motors race
    this.whine.frequency.setTargetAtTime(90 + (v + (tram.slip ? 6 : 0)) * 52, t, 0.05);
    this.whineGain.gain.setTargetAtTime(tram.slip ? 0.05 : effort * 0.03 * moving, t, 0.08);
    const sp = clamp(v / 14, 0, 1.3);
    this.rollFilter.frequency.setTargetAtTime(160 + v * 50, t, 0.2);
    this.rollGain.gain.setTargetAtTime(sp * 0.16, t, 0.15);
    const squeal = tram.brake > 0.5 && v > 0.05 && v < 2.2 ? 0.035 : 0;
    this.squealGain.gain.setTargetAtTime(squeal, t, squeal ? 0.15 : 0.05);
    const excess = clamp((run.lateral - COMFORT.lateralFree) / COMFORT.lateralFree, 0, 1);
    // flanges in a curve taken too fast; sliding wheels grind the same way
    const grind = tram.slide && v > 0.5 ? 0.09 : excess > 0 && v > 0.5 ? 0.02 + excess * 0.12 : 0;
    this.flangeGain.gain.setTargetAtTime(grind, t, 0.08);

    // the lifting bridge's warning bells, until the barriers are down
    const br = run.street.bridge;
    if (br && (br.state === 'warning' || br.state === 'barriers') && t >= this.nextDing) {
      const near = clamp(1 - Math.abs(br.s0 - tram.s) / 320, 0, 1);
      if (near > 0) this.tone(640, 0.14 * near, 0.35, 0, [[1, 1], [2.4, 0.3]]);
      this.nextDing = t + 0.45;
    }

    // rail joints under each axle
    if (this.lastS !== null && v > 0.3) {
      for (const a of AXLES) {
        if (Math.floor((tram.s - a) / JOINT) !== Math.floor((this.lastS - a) / JOINT)) {
          this.burst(clamp(v / 12, 0.08, 0.5) * 0.5, 1100, 0.05, 1.2);
          this.thump(clamp(v / 12, 0.05, 0.4) * 0.5, 120, 60, 0.05);
        }
      }
    }
    this.lastS = tram.s;
  }

  burst(volume, freq, decay, q = 0.8, type = 'bandpass') {
    if (!this.ctx || volume < 0.005) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * Math.max(0, 1.9 - decay), decay + 0.05);
  }

  thump(volume, from, to, decay) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  // A struck metal tone (bell, chimes): a few inharmonic partials with exponential decay.
  tone(freq, volume, decay, delay = 0, partials = [[1, 1], [2.76, 0.4], [5.4, 0.15]]) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    for (const [mul, amp] of partials) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / mul ** 0.3);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  notch(n) {
    this.thump(0.25, 900, 300, 0.03);
    this.burst(0.12, 3000, 0.03, 2);
    if (n === -5) this.burst(0.5, 900, 0.9, 0.4, 'highpass');   // emergency brake: air dump
  }

  bell() {
    this.tone(1180, 0.32, 1.3);
    this.tone(1180, 0.28, 1.3, 0.22);
  }

  doors(open) {
    // two-tone chime, then the door motors
    const [a, b] = open ? [784, 988] : [988, 784];
    const soft = [[1, 1], [2, 0.12]];
    this.tone(a, 0.16, 0.7, 0, soft);
    this.tone(b, 0.16, 0.9, 0.28, soft);
    this.burst(0.07, 380, 1.4, 0.6);
  }

  beep() { this.tone(1000, 0.08, 0.12, 0, [[1, 1]]); }

  rating(name) {
    const seq = { PERFECT: [523, 659, 784, 1047], GREAT: [523, 659, 784], GOOD: [523, 659], OK: [440] }[name];
    if (!seq) { this.thump(0.3, 160, 70, 0.35); return; }   // missed
    seq.forEach((f, i) => this.tone(f, 0.14, 0.5, i * 0.09, [[1, 1], [2, 0.2]]));
  }

  penalty() { this.thump(0.3, 220, 110, 0.25); }

  // somebody pressed the stop button
  request() {
    this.tone(1320, 0.18, 0.6, 0, [[1, 1], [2.01, 0.15]]);
  }

  // a minor collision
  bump() {
    this.thump(0.7, 140, 50, 0.25);
    this.burst(0.5, 900, 0.35, 0.8);
  }

  derail() {
    this.burst(0.9, 500, 1.8, 0.4, 'lowpass');
    this.burst(0.5, 2600, 1.2, 3);
    this.thump(0.8, 110, 35, 0.9);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
}
