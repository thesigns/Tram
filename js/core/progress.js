// Career progress (GDD §9, §14.5): best score, stars and the perfect-run badge per line, in localStorage.
// Storage can be unavailable (private mode, blocked site data): everything still works, nothing is kept.

const KEY = 'tram.progress.v2';   // v2: scores are passenger satisfaction

export function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && typeof p.lines === 'object') return p;
  } catch { /* storage unavailable or corrupt */ }
  return { lines: {}, last: null };
}

function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

// 0–3 stars for a finished run: its satisfaction (0–1) against the thresholds.
export const starsFor = (value, thresholds) => thresholds.filter((t) => value >= t).length;

export const totalStars = (p) => Object.values(p.lines).reduce((n, l) => n + (l.stars ?? 0), 0);

// Record a finished run; returns { best: a new best score?, newPerfect: the badge earned just now? }.
export function recordRun(p, lineId, score, stars, perfect) {
  const line = p.lines[lineId] ?? { best: null, stars: 0, perfect: false };
  const best = line.best === null || score > line.best;
  const newPerfect = perfect && !line.perfect;
  p.lines[lineId] = {
    best: best ? score : line.best,
    stars: Math.max(line.stars, stars),
    perfect: line.perfect || perfect,
  };
  save(p);
  return { best, newPerfect };
}

export function rememberLine(p, lineId) {
  p.last = lineId;
  save(p);
}
