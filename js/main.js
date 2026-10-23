import * as THREE from 'three';
import { LOOKS, PASSENGERS, SIM, TRAMS, VIEW, WORLD } from './config.js';
import { EB, Tram } from './core/tram.js';
import { Run } from './core/run.js';
import { Input } from './core/input.js';
import { loadProgress, recordRun, rememberLine, starsFor, totalStars } from './core/progress.js';
import { clamp, damp, formatClock, formatDelta } from './core/utils.js';
import { Track } from './world/track.js';
import { SpeedLimits } from './world/limits.js';
import { createCity } from './world/city.js';
import { createLandmarks } from './world/landmarks.js';
import { createStructures } from './world/structures.js';
import { createSigns } from './world/signs.js';
import { createSky, paintSky } from './world/sky.js';
import { groundLevel } from './world/frame.js';
import { Passengers } from './entities/passengers.js';
import { TrafficView } from './entities/traffic.js';
import { createCab, setLamp, setSpeedo } from './models/cab.js';
import { Sound } from './audio/sound.js';
import { Hud, RATING_COLORS } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const debug = new URLSearchParams(location.search).has('debug');

// ---------- renderer and scenes ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.autoClear = false;
const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = maxPixelRatio;
renderer.setPixelRatio(pixelRatio);

const sunDir = new THREE.Vector3(...WORLD.sunDir).normalize();
const scene = new THREE.Scene();
scene.background = new THREE.Color(WORLD.fogColor);
scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);
scene.add(new THREE.HemisphereLight(0xe4edf4, 0x6b6656, 1.6));
const fogColor = new THREE.Color(WORLD.fogColor);       // the line's fog colour outside tunnels
const TUNNEL_FOG = new THREE.Color(0x15171a);
const sunLight = new THREE.DirectionalLight(0xfff1d8, 2.0);
sunLight.position.copy(sunDir);
scene.add(sunLight);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1000);
const sky = createSky();
scene.add(sky);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: WORLD.ground }),
);
scene.add(ground);

// cab – a separate scene; its light is the sun transformed into the tram's frame
const cabScene = new THREE.Scene();
const cab = createCab();
cabScene.add(cab);
const cabSun = new THREE.DirectionalLight(0xfff1d8, 1.5);
const cabHemi = new THREE.HemisphereLight(0xe4edf4, 0x6b6656, 1.5);
cabScene.add(cabHemi, cabSun, cabSun.target);
const cabCam = new THREE.PerspectiveCamera(60, 1, 0.02, 10);

// ---------- game systems ----------
const tramCfg = TRAMS.classic;
const tram = new Tram(tramCfg);
const input = new Input();
const sound = new Sound();
const hud = new Hud($('hud'));
const progress = loadProgress();

const game = {
  mode: 'menu',     // menu | playing | paused | results
  acc: 0,           // fixed-step accumulator
  prevS: 0,         // tram position before the last step (render interpolation)
  endTimer: 0,
  beepTimer: 0,
  fps: 60,
};

// ---------- lines and the world ----------
let lines = [];     // data/routes/index.json
let W = null;       // the loaded line: { def, route, track, limits, run, city, structures, passengers, traffic, group }

async function loadLine(def) {
  if (W?.def.id === def.id) return;
  $('loading').textContent = 'Loading…';
  $('loading').classList.remove('hidden');
  const route = await fetch(`data/routes/${def.file}`).then((r) => {
    if (!r.ok) throw new Error(`${def.file}: ${r.status}`);
    return r.json();
  });
  if (W) disposeWorld(W);
  const group = new THREE.Group();
  const track = new Track(route.pieces);
  const limits = new SpeedLimits(track, route, tramCfg.length);
  const run = new Run(route, tramCfg, track, limits, onRunEvent);
  const city = createCity(track, run.stops, route);
  const structures = createStructures(track, route);
  group.add(city.group, structures.group, createSigns(track, limits), createLandmarks(track, route).group);
  const passengers = new Passengers(group, track, run.stops, route.seed);
  const traffic = new TrafficView(group, track, run.street);
  scene.add(group);
  // the city's sky, fog and ground – the sea where there is one
  const look = LOOKS[route.look ?? 'modern'];
  fogColor.set(look.fog ?? WORLD.fogColor);
  scene.fog.color.copy(fogColor);
  scene.background.copy(fogColor);
  paintSky(sky, look.sky ?? WORLD.skyTop, fogColor);
  ground.position.y = groundLevel(track, route);
  ground.material.color.set(route.sea != null ? look.sea : WORLD.ground);
  W = { def, route, track, limits, run, city, structures, passengers, traffic, group };
  tram.reset(run.stops[0].s);
  game.prevS = tram.s;
  rememberLine(progress, def.id);
  $('loading').classList.add('hidden');
}

function disposeWorld(w) {
  scene.remove(w.group);
  w.traffic.dispose();
  w.group.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      if (m.userData.shared) continue;
      m.map?.dispose();
      m.dispose();
    }
  });
}

// ---------- run events ----------
const fmtError = (e) => (Math.abs(e) < 0.05 ? 'spot on' : `${Math.abs(e).toFixed(1)} m ${e < 0 ? 'short' : 'past'}`);

function onRunEvent(type, d) {
  const run = W.run;
  switch (type) {
    case 'rating': {
      if (d.rating === 'EMPTY') {
        hud.showRating('NOBODY HERE', 'A request stop nobody needed – you could have passed', RATING_COLORS.EMPTY);
        break;
      }
      const title = d.rating === 'PERFECT' || d.rating === 'GREAT' ? `${d.rating}!` : d.rating;
      hud.showRating(title, fmtError(d.error) + (d.off ? ` · ${d.off} getting off` : ''), RATING_COLORS[d.rating]);
      sound.rating(d.rating);
      break;
    }
    case 'missed':
      hud.showRating('MISSED', 'Nobody could get on or off', RATING_COLORS.MISSED);
      sound.rating('MISSED');
      break;
    case 'skipped':
      hud.showRating('PASSED', 'Nobody to pick up or drop off', RATING_COLORS.GREAT);
      sound.rating('GOOD');
      break;
    case 'request':
      sound.request();
      hud.showNotice('Stop requested', '#62c4ff', 2);
      break;
    case 'notice':
      hud.showNotice(d.text, d.bad ? '#ff8a70' : '#f8f4e8', 2.8);
      if (d.bad) sound.penalty();
      break;
    case 'bump':
      sound.bump();
      cam.jolt = 1;
      hud.showNotice('Collision – the passengers are furious', '#ff8a70', 2.8);
      break;
    case 'departure':
    case 'arrival': {
      const text = d.verdict === 'ON TIME' ? 'On time' : `${d.verdict === 'LATE' ? 'Late' : 'Early'} ${formatDelta(d.dev)}`;
      hud.showNotice(text, PUNCT_COLORS[d.verdict], 2.6);
      if (d.verdict !== 'ON TIME') sound.penalty();
      break;
    }
    case 'fail':
      if (d.reason === 'collision' || d.reason === 'bridge') {
        hud.showRating('CRASH', d.reason === 'bridge' ? 'The bridge was up' : `${Math.round(d.kmh)} km/h`, RATING_COLORS.MISSED);
        sound.crash();
        cam.jolt = 1;
      } else {
        // people: no gore – the screen fades out (GDD §6.4)
        sound.bump();
        fade.style.opacity = 1;
      }
      game.endTimer = 2.8;
      break;
    case 'bridge':
      if (d.phase === 'warning') hud.showNotice('The bridge is about to lift', '#f2c230', 3);
      if (d.phase === 'made') {
        hud.showNotice('Made the bridge', '#9fe05e', 2.2);
        sound.rating('GOOD');
      }
      if (d.phase === 'cleared' && d.excuse > 0) hud.showNotice(`Bridge lift: timetable ${formatDelta(d.excuse)}`, '#62c4ff', 3);
      break;
    case 'arrive':
      W.passengers.arrive(d.person);
      // somebody running for a tram that is still there
      if (d.person.from === run.idx || d.person.from === run.departPending) hud.showNotice('Somebody is running for the tram', '#f2c230', 2.6);
      break;
    case 'board': W.passengers.board(d.person, tramCfg.doors.map((x) => tram.s - x)); break;
    case 'ready': sound.beep(); break;
    case 'hint': hud.showNotice(d.text, '#f2c230', 1.4); break;
    case 'done': game.endTimer = 1.6; break;
    default:
  }
}

const PUNCT_COLORS = { 'ON TIME': '#9fe05e', LATE: '#ff8a70', EARLY: '#ff8a70' };
const fade = $('fade');

// ---------- controls ----------
input.onNotch = (n) => {
  tram.notch = n;
  sound.notch(n);
};
input.onDoors = () => {
  const before = tram.doorsTarget;
  W.run.pressDoors(tram);
  if (tram.doorsTarget !== before) sound.doors(tram.doorsTarget === 1);
};
input.onBell = () => {
  sound.bell();
  W.run.bell(tram);
};
input.onPause = togglePause;

// ---------- game flow ----------
function resetView() {
  input.resetNotch(0);
  game.prevS = tram.s;
  game.acc = 0;
  game.endTimer = 0;
  cam.jolt = 0;
  fade.style.opacity = 0;
  sound.lastS = null;
}

function startRun() {
  sound.init();
  const run = W.run;
  tram.reset(run.stops[0].s);
  run.reset();
  W.passengers.reset(run.crowd);
  resetView();
  setMode('playing');
  hud.showRating(`DEP ${formatClock(run.depAt(0)).slice(0, 5)}`, `Next stop: ${run.target.name}`, '#f8f4e8');
}

async function chooseLine(def) {
  sound.init();   // inside the tap, before any await (autoplay policy)
  try {
    await loadLine(def);
  } catch (err) {
    $('loading').textContent = 'Could not load the line.';
    console.error(err);
    return;
  }
  startRun();
}

function setMode(mode) {
  game.mode = mode;
  input.enabled = mode === 'playing';
  $('menu').classList.toggle('hidden', mode !== 'menu');
  $('pause').classList.toggle('hidden', mode !== 'paused');
  $('results').classList.toggle('hidden', mode !== 'results');
  $('controls').classList.toggle('hidden', mode !== 'playing');
  if (mode === 'paused') sound.suspend();
  if (mode === 'playing') {
    sound.resume();
    input.layout();
  }
  if (mode === 'menu') {
    sound.suspend();
    renderMenu();
  }
}

function togglePause() {
  if (game.mode === 'playing') setMode('paused');
  else if (game.mode === 'paused') setMode('playing');
}

const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// The line list (GDD §9): lines unlock with the stars collected.
function renderMenu() {
  const list = $('lines');
  list.replaceChildren();
  const total = totalStars(progress);
  $('menu-stars').textContent = `★ ${total}`;
  for (const def of lines) {
    const rec = progress.lines[def.id];
    const locked = !debug && total < (def.unlock ?? 0);   // ?debug opens every line
    const btn = document.createElement('button');
    btn.className = 'line';
    btn.disabled = locked;
    const info = document.createElement('span');
    info.className = 'line-info';
    const title = document.createElement('b');
    title.textContent = `${def.city} · ${def.name}`;
    const sub = document.createElement('small');
    sub.textContent = `${def.stops} stops · ${def.from} – ${def.to}`;
    info.append(title, sub);
    const score = document.createElement('span');
    score.className = 'line-score';
    const stars = document.createElement('b');
    stars.textContent = locked ? `🔒 ${def.unlock} ★` : starText(rec?.stars ?? 0);
    const best = document.createElement('small');
    best.textContent = rec?.best != null ? `best ${rec.best}${rec.perfect ? ' · perfect' : ''}` : locked ? 'locked' : 'not driven yet';
    score.append(stars, best);
    btn.append(info, score);
    btn.addEventListener('click', () => chooseLine(def));
    list.appendChild(btn);
  }
}

// darker shades of the HUD rating colors, readable on the light card
const RESULT_COLORS = {
  PERFECT: '#1f8a4c', GREAT: '#4f8a1f', GOOD: '#9a7400', OK: '#b5651d', MISSED: '#c8382c', PASSED: '#4f8a1f', EMPTY: '#6b665c',
};
const FAIL_TEXT = {
  collision: (f) => ['YOU CRASHED THE TRAM', `You hit ${VEHICLE[f.what] ?? 'a car'} at ${Math.round(f.kmh)} km/h. The run is over.`],
  bridge: () => ['YOU CRASHED THE TRAM', 'You drove onto the lifting bridge while it was up. Stop on the bridge signal.'],
  pedestrian: () => ['RUN ENDED', 'You hit a pedestrian. Watch the kerbs, brake early and use the bell.'],
  cyclist: () => ['RUN ENDED', 'You hit a cyclist. Keep your distance and use the bell.'],
};
const VEHICLE = { car: 'a car', van: 'a van', lift: 'a forklift' };
const ROW_NOTE = { PASSED: 'nobody needed it', EMPTY: 'nobody needed it', MISSED: '' };

const RESULT_PUNCT = { 'ON TIME': '#1f8a4c', LATE: '#c8382c', EARLY: '#c8382c' };

// A table cell with a main line and an optional small second line.
function cell(main, sub, color) {
  const td = document.createElement('td');
  const b = document.createElement('span');
  b.textContent = main;
  if (color) b.style.color = color;
  td.appendChild(b);
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    td.appendChild(s);
  }
  return td;
}

// What upset the passengers (crowd.lost), for the results.
const CAUSES = [
  ['comfort', 'Rough ride'],
  ['late', 'Lateness'],
  ['stopping', 'Walking to the doors'],
  ['missed', 'Missed stops'],
  ['left', 'Left on the platform'],
  ['safety', 'Signals, doors, bumps'],
];
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

function showResults() {
  setMode('results');
  sound.suspend();
  const run = W.run;
  const failed = run.phase === 'failed';
  const sat = run.satisfaction;
  const [title, msg] = failed ? FAIL_TEXT[run.fail.reason](run.fail)
    : ['END OF THE LINE', `${Math.round(sat * 100)}% of your passengers are satisfied.`];
  $('res-title').textContent = title;
  $('res-msg').textContent = msg;

  // stars (by satisfaction), a new best, the perfect-run badge
  const badges = [];
  let stars = 0;
  if (!failed) {
    stars = starsFor(sat, W.route.stars ?? PASSENGERS.stars);
    const rec = recordRun(progress, W.def.id, run.score, stars, run.perfect);
    if (rec.best) badges.push('NEW BEST');
    if (run.perfect) badges.push('PERFECT RUN');
  }
  $('res-stars').textContent = starText(stars);
  $('res-stars').classList.toggle('hidden', failed);
  $('res-badges').textContent = badges.join(' · ');

  const body = $('res-rows');
  body.replaceChildren();
  for (const r of run.results) {
    const tr = document.createElement('tr');
    tr.appendChild(cell(r.name));
    const start = r.rating === 'START';
    tr.appendChild(cell(start ? '–' : r.rating, start ? '' : ROW_NOTE[r.rating] ?? fmtError(r.error), RESULT_COLORS[r.rating]));
    tr.appendChild(r.punct ? cell(formatDelta(r.dev), r.punct.toLowerCase(), RESULT_PUNCT[r.punct]) : cell('–'));
    tr.appendChild(cell(r.on || r.off ? `+${r.on} −${r.off}` : '–', r.left ? `${r.left} left behind` : '', r.left ? '#c8382c' : undefined));
    body.appendChild(tr);
  }

  const dl = $('res-breakdown');
  dl.replaceChildren();
  const c = run.crowd.counts();
  const items = [[`Passengers (${run.crowd.people.length})`, `${c.green} happy · ${c.yellow} annoyed · ${c.red} furious`]];
  for (const [key, label] of CAUSES) {
    const lost = run.crowd.lost[key];
    if (lost) items.push([label, signed(-Math.round(lost * PASSENGERS.points))]);
  }
  for (const [label, value] of items) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
  dl.classList.toggle('hidden', failed);
  $('res-score-line').classList.toggle('hidden', failed);
  $('res-score').textContent = run.score;
  const t = Math.round(run.time);
  $('res-meta').textContent = `${W.def.city} · ${W.def.name} · time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('again-btn').textContent = failed ? 'TRY AGAIN' : 'DRIVE AGAIN';
}

// ---------- camera ----------
const _a = {};
const _b = {};
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const bodyQ = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const cam = { lean: 0, roll: 0, t: 0, jolt: 0, grade: 0 };

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function updateCamera(s, dt) {
  const { track, run } = W;
  cam.t += dt;
  const eyeS = s - tramCfg.eyeBack;
  track.at(eyeS, 0, _a);
  track.at(eyeS + VIEW.lookAhead, 0, _b);
  camera.position.set(_a.x, _a.y + tramCfg.eyeHeight, _a.z);

  // the gaze turns into curves ahead; the cab stays aligned with the body
  const gaze = _a.h + wrapAngle(Math.atan2(_b.x - _a.x, -(_b.z - _a.z)) - _a.h) * 0.7;
  // the view follows hills smoothly; lean back when accelerating, forward when braking; sway in curves
  cam.grade = dt > 0 ? damp(cam.grade, track.slope(eyeS - 8, eyeS + 4), 3, dt) : track.slope(eyeS - 8, eyeS + 4);
  cam.lean = damp(cam.lean, clamp(tram.a * 0.008, -0.025, 0.02), 4, dt);
  cam.roll = damp(cam.roll, clamp(-_a.k * tram.v * tram.v * 0.02, -0.03, 0.03), 3, dt);
  // too fast, the tram shakes; a crashed tram grinds to a halt
  const amp = 0.0006 * clamp(tram.v / 14, 0, 1.2) + run.rough * 0.005 + (tram.halted && tram.v > 0 ? 0.02 : 0);
  const bob = (Math.sin(cam.t * 31) + Math.sin(cam.t * 17.3)) * amp;
  // a collision throws the view forward and down for a moment
  cam.jolt = Math.max(0, cam.jolt - dt * 2.5);
  const jolt = cam.jolt * cam.jolt * 0.06;
  _e.set(VIEW.headTilt + Math.atan(cam.grade) + cam.lean + bob - jolt, -gaze, cam.roll + Math.sin(cam.t * 23.1) * amp * 0.5, 'YXZ');
  camera.quaternion.setFromEuler(_e);

  bodyQ.setFromAxisAngle(UP, -_a.h);
  _inv.copy(bodyQ).invert();
  cabCam.quaternion.copy(_inv).multiply(camera.quaternion);
  cabSun.position.copy(sunDir).applyQuaternion(_inv);
  sky.position.copy(camera.position);
}

const doorsBtn = $('doors-btn');

function updateCab() {
  const run = W.run;
  const { lamps } = cab.userData;
  const blink = Math.floor(performance.now() / 300) % 2 === 0;
  setLamp(lamps.closed, tram.doors === 0);
  setLamp(lamps.open, tram.doors > 0);
  setLamp(lamps.interlock, tram.interlocked && blink);
  setLamp(lamps.request, run.stopRequested && run.phase === 'drive');
  setLamp(lamps.slip, (tram.slide || tram.slip) && blink);
  setSpeedo(cab, tram.v * 3.6);
  doorsBtn.classList.toggle('open', tram.doorsTarget === 1);
}

// Portrait: the optical centre sits in the upper part of the screen – street ahead above, cab and thumbs below.
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const portrait = h > w;
  const center = portrait ? VIEW.centerPortrait : VIEW.centerLandscape;
  const hfov = THREE.MathUtils.degToRad(portrait ? VIEW.hfovPortrait : VIEW.hfovLandscape);
  // a virtual frame symmetric around the optical centre; the screen is its upper part
  const fullH = 2 * (1 - center) * h;
  const aspect = w / fullH;
  let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  if (!portrait) vfov = clamp(vfov, 0.75, 1.3);
  for (const c of [camera, cabCam]) {
    c.aspect = aspect;
    c.fov = THREE.MathUtils.radToDeg(vfov);
    c.setViewOffset(w, fullH, 0, fullH / 2 - center * h, w, h);
    c.updateProjectionMatrix();
  }
  hud.resize();
  input.layout();
}

// ---------- loop ----------
const STEP = 1 / SIM.hz;
let last = performance.now();
let frameAcc = 0, frameCount = 0, lastAdapt = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.1);
  if (!W) return;
  const { run, track, traffic } = W;

  if (game.mode === 'playing') {
    game.acc += dt;
    while (game.acc >= STEP) {
      game.prevS = tram.s;
      // the average grade under the body: smooth where pieces meet
      tram.step(STEP, track.slope(tram.s - tramCfg.length, tram.s), run.grip(tram.s));
      run.update(STEP, tram);
      game.acc -= STEP;
    }
    if (game.endTimer > 0) {
      game.endTimer -= dt;
      if (game.endTimer <= 0) showResults();
    }
    // interlock warning beep while power is selected with the doors open
    game.beepTimer -= dt;
    if (tram.interlocked && game.beepTimer <= 0) { sound.beep(); game.beepTimer = 0.5; }
    sound.update(tram, run);
    W.passengers.update(dt);
  }

  const alpha = game.mode === 'playing' ? game.acc / STEP : 1;
  const s = game.prevS + (tram.s - game.prevS) * alpha;
  updateCamera(s, game.mode === 'paused' ? 0 : dt);
  updateCab();
  W.city.update(s);
  W.structures.update(run.street, run.street.time);
  traffic.update(run.street.time);
  // inside a tunnel: dark fog, a dim cab
  const dark = W.structures.darkness(s - tramCfg.eyeBack);
  scene.fog.color.copy(fogColor).lerp(TUNNEL_FOG, dark * 0.9);
  cabHemi.intensity = 1.5 * (1 - 0.7 * dark);
  cabSun.intensity = 1.5 * (1 - 0.95 * dark);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(cabScene, cabCam);
  const markers = game.mode === 'playing' ? traffic.markers(camera, window.innerWidth, window.innerHeight, tram.s, W.structures.hides) : null;
  hud.draw(dt, { playing: game.mode === 'playing', run, tram, markers, debug, fps: game.fps });

  // adaptive resolution: lower the pixel ratio on a weak GPU
  frameAcc += rawDt;
  frameCount++;
  if (frameCount >= 90) {
    const avg = frameAcc / frameCount;
    game.fps = 1 / avg;
    if (avg > 0.024 && pixelRatio > 0.75 && now - lastAdapt > 3000 && game.mode === 'playing') {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
      lastAdapt = now;
    }
    frameAcc = 0;
    frameCount = 0;
  }
}

// ---------- UI ----------
$('again-btn').addEventListener('click', startRun);
$('resume-btn').addEventListener('click', () => setMode('playing'));
$('restart-btn').addEventListener('click', startRun);
for (const id of ['lines-btn', 'pause-lines-btn']) $(id).addEventListener('click', () => setMode('menu'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') setMode('paused');
});
window.addEventListener('resize', resize);

if (debug) {
  window.tram = {
    game, tram, input, sound, camera, EB, progress, loadLine,
    get W() { return W; },
    get run() { return W.run; },
    get track() { return W.track; },
    get limits() { return W.limits; },
    get traffic() { return W.traffic; },
  };
}

try {
  lines = (await fetch('data/routes/index.json').then((r) => r.json())).lines;
  // the menu shows the last line driven in the background
  await loadLine(lines.find((l) => l.id === progress.last) ?? lines[0]);
} catch (err) {
  $('loading').textContent = 'Could not load the lines.';
  throw err;
}
resize();
setMode('menu');
Promise.race([document.fonts?.load('700 16px "Barlow Condensed"'), new Promise((r) => setTimeout(r, 1500))])
  .catch(() => {})
  .finally(() => $('loading').classList.add('hidden'));
requestAnimationFrame((t) => { last = t; frame(t); });
