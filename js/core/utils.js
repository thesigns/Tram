export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent smoothing.
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

// Deterministic RNG (the city must always be the same for a given seed).
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

const pad2 = (n) => String(n).padStart(2, '0');

// 06:14:30 from seconds since midnight.
export function formatClock(t) {
  const s = Math.floor(t);
  return `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

// +0:12 / −1:05 from a number of seconds (the sign is always shown, except for zero).
export function formatDelta(t) {
  const s = Math.round(Math.abs(t));
  const sign = s === 0 ? '' : t > 0 ? '+' : '−';
  return `${sign}${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
