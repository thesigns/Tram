import { EB, notchName } from './tram.js';

// Lever layout from the top (GDD §4.1): P4…P1, N, B1…B4 and EB below an extra gap – reaching EB
// needs a deliberate pull past a detent. Units of notch spacing.
const LAYOUT = [
  [4, 0], [3, 1], [2, 2], [1, 3], [0, 4.4], [-1, 5.8], [-2, 6.8], [-3, 7.8], [-4, 8.8], [EB, 10.8],
];
const SPAN = 10.8;
const EB_DETENT = 0.75;   // fraction of the B4→EB gap the finger has to travel

const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

// Controls: the master controller under the right thumb, doors and bell under the left.
// The lever stays where it is released, like a real controller. Keyboard for desktop.
export class Input {
  constructor() {
    this.notch = 0;
    this.enabled = false;
    this.onNotch = null;
    this.onDoors = null;
    this.onBell = null;
    this.onPause = null;
    this.onPoints = null;       // (dir) – left | straight | right
    this.onPointsStep = null;   // (−1 | +1) – keyboard: one position left or right

    this.lever = document.getElementById('lever');
    this.handle = this.lever.querySelector('.handle');
    this.handleLabel = this.handle.querySelector('span');
    this.labels = new Map();
    for (const [n] of LAYOUT) {
      const el = document.createElement('div');
      el.className = `notch ${n === EB ? 'eb' : n > 0 ? 'power' : n < 0 ? 'brake' : 'neutral'}`;
      el.textContent = notchName(n);
      this.lever.appendChild(el);
      this.labels.set(n, el);
    }
    this.drag = null;
    this.bindLever();
    this.bindButton('doors-btn', () => this.onDoors?.());
    this.bindButton('bell-btn', () => this.onBell?.());
    for (const btn of document.querySelectorAll('#points [data-dir]')) this.bindButton(btn, () => this.onPoints?.(btn.dataset.dir));
    document.getElementById('pause-btn').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPause?.(); });
    this.bindKeyboard();
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.drag = null; });
    this.layout();
  }

  // Pixel position of each notch inside the lever element.
  layout() {
    const h = this.lever.clientHeight;
    if (!h) return;   // hidden – laid out again when the controls are shown
    const pad = 22;
    this.unit = (h - 2 * pad) / SPAN;
    this.ys = new Map(LAYOUT.map(([n, u]) => [n, pad + u * this.unit]));
    for (const [n, el] of this.labels) el.style.top = `${this.ys.get(n)}px`;
    this.render();
  }

  notchAt(y) {
    const b4 = this.ys.get(-4), eb = this.ys.get(EB);
    if (y > b4 + (eb - b4) * EB_DETENT) return EB;
    let best = 0, bestD = Infinity;
    for (const [n, ny] of this.ys) {
      if (n === EB) continue;
      const d = Math.abs(ny - y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  setNotch(n) {
    if (!this.enabled || n === this.notch) return;
    this.notch = n;
    buzz(n === EB ? 40 : 8);
    this.render();
    this.onNotch?.(n);
  }

  // Back to neutral without effects (new run).
  resetNotch(n = 0) {
    this.notch = n;
    this.render();
  }

  render() {
    if (!this.ys) return;
    this.handle.style.transform = `translateY(${this.ys.get(this.notch)}px)`;
    this.handleLabel.textContent = notchName(this.notch);
    this.lever.dataset.zone = this.notch === EB ? 'eb' : this.notch > 0 ? 'power' : this.notch < 0 ? 'brake' : 'neutral';
    for (const [n, el] of this.labels) el.classList.toggle('active', n === this.notch);
  }

  bindLever() {
    const el = this.lever;
    // relative drag: the handle never jumps to where the thumb lands
    el.addEventListener('pointerdown', (e) => {
      if (this.drag) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.drag ={ id: e.pointerId, y0: e.clientY, from: this.ys.get(this.notch) };
      el.classList.add('held');
    });
    el.addEventListener('pointermove', (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.setNotch(this.notchAt(this.drag.from + e.clientY - this.drag.y0));
    });
    const end = (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      el.classList.remove('held');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  bindButton(id, fn) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      el.classList.add('pressed');
      buzz(12);
      fn();
    });
    const up = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) this.onPause?.(); return; }
      if (!this.enabled || e.repeat) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.setNotch(this.notch === EB ? -4 : Math.min(4, this.notch + 1)); break;
        // S / ↓ stops at B4; the emergency brake is a separate key, like the detent on the lever
        case 'KeyS': case 'ArrowDown': if (this.notch !== EB) this.setNotch(Math.max(-4, this.notch - 1)); break;
        case 'Space': this.setNotch(EB); break;
        case 'KeyE': this.onDoors?.(); break;
        case 'KeyR': this.onBell?.(); break;   // R – ring the bell
        case 'KeyA': case 'ArrowLeft': this.onPointsStep?.(-1); break;
        case 'KeyD': case 'ArrowRight': this.onPointsStep?.(1); break;
        default:
      }
    });
  }
}
