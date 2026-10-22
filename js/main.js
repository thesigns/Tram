import * as THREE from 'three';
import { SIM, TRAMS, VIEW, WORLD } from './config.js';
import { EB, Tram } from './core/tram.js';
import { Run } from './core/run.js';
import { Input } from './core/input.js';
import { clamp, damp } from './core/utils.js';
import { Track } from './world/track.js';
import { createCity } from './world/city.js';
import { createSky } from './world/sky.js';
import { Passengers } from './entities/passengers.js';
import { createCab, setLamp, setSpeedo } from './models/cab.js';
import { Sound } from './audio/sound.js';
import { Hud, RATING_COLORS } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
const debug = new URLSearchParams(location.search).has('debug');

let route;
try {
  route = await fetch('data/routes/test-line.json').then((r) => r.json());
} catch (err) {
  $('loading').textContent = 'Could not load the route.';
  throw err;
}

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
const sunLight = new THREE.DirectionalLight(0xfff1d8, 2.0);
sunLight.position.copy(sunDir);
scene.add(sunLight);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1000);
const sky = createSky();
scene.add(sky);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: WORLD.ground }),
);
ground.position.y = -0.03;
scene.add(ground);

// cab – a separate scene; its light is the sun transformed into the tram's frame
const cabScene = new THREE.Scene();
const cab = createCab();
cabScene.add(cab);
const cabSun = new THREE.DirectionalLight(0xfff1d8, 1.5);
cabScene.add(new THREE.HemisphereLight(0xe4edf4, 0x6b6656, 1.5), cabSun, cabSun.target);
const cabCam = new THREE.PerspectiveCamera(60, 1, 0.02, 10);

// ---------- game systems ----------
const tramCfg = TRAMS.classic;
const track = new Track(route.pieces);
const tram = new Tram(tramCfg);
const run = new Run(route, tramCfg, onRunEvent);
const city = createCity(track, run.stops, route.seed);
scene.add(city.group);
const passengers = new Passengers(scene, track, run.stops, route.seed);
const input = new Input();
const sound = new Sound();
const hud = new Hud($('hud'));

const game = {
  mode: 'menu',     // menu | playing | paused | results
  acc: 0,           // fixed-step accumulator
  prevS: 0,         // tram position before the last step (render interpolation)
  endTimer: 0,
  beepTimer: 0,
  fps: 60,
};

// ---------- run events ----------
const fmtError = (e) => (Math.abs(e) < 0.05 ? 'spot on' : `${Math.abs(e).toFixed(1)} m ${e < 0 ? 'short' : 'past'}`);

function onRunEvent(type, d) {
  switch (type) {
    case 'rating': {
      const title = d.rating === 'PERFECT' || d.rating === 'GREAT' ? `${d.rating}!` : d.rating;
      const mult = d.mult > 1 ? ` ×${d.mult}` : '';
      hud.showRating(title, `${fmtError(d.error)} · +${d.points}${mult}`, RATING_COLORS[d.rating]);
      sound.rating(d.rating);
      break;
    }
    case 'missed':
      hud.showRating('MISSED', 'Passengers left waiting', RATING_COLORS.MISSED);
      sound.rating('MISSED');
      break;
    case 'penalty':
      hud.showNotice(`${d.reason === 'left' ? 'Passengers left behind' : 'Doors opened away from a platform'}  −${d.points}`,
        '#ff8a70', 2.8);
      sound.penalty();
      break;
    case 'board': passengers.board(d.stop, d.k); break;
    case 'ready': sound.beep(); break;
    case 'hint': hud.showNotice(d.text, '#f2c230', 1.4); break;
    case 'done': game.endTimer = 1.6; break;
    default:
  }
}

// ---------- controls ----------
input.onNotch = (n) => {
  tram.notch = n;
  sound.notch(n);
};
input.onDoors = () => {
  const before = tram.doorsTarget;
  run.pressDoors(tram);
  if (tram.doorsTarget !== before) sound.doors(tram.doorsTarget === 1);
};
input.onBell = () => sound.bell();
input.onPause = togglePause;

// ---------- game flow ----------
function startRun() {
  sound.init();
  if (isTouch) enterFullscreen();
  tram.reset(run.stops[0].s);
  run.reset();
  passengers.reset();
  input.resetNotch(0);
  game.prevS = tram.s;
  game.acc = 0;
  game.endTimer = 0;
  sound.lastS = null;
  setMode('playing');
  hud.showRating('DEPART', `Next stop: ${run.target.name}`, '#f8f4e8');
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
}

function togglePause() {
  if (game.mode === 'playing') setMode('paused');
  else if (game.mode === 'paused') setMode('playing');
}

// darker shades of the HUD rating colors, readable on the light card
const RESULT_COLORS = { PERFECT: '#1f8a4c', GREAT: '#4f8a1f', GOOD: '#9a7400', OK: '#b5651d', MISSED: '#c8382c' };

function showResults() {
  setMode('results');
  sound.suspend();
  const body = $('res-rows');
  body.replaceChildren();
  for (const r of run.results) {
    const tr = document.createElement('tr');
    const cells = [r.name, r.rating, r.rating === 'MISSED' ? '–' : fmtError(r.error), r.points];
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i === 1) td.style.color = RESULT_COLORS[r.rating];
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
  $('res-score').textContent = run.score;
  const t = Math.round(run.time);
  $('res-meta').textContent = `Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · best combo ×${run.bestCombo}`;
}

async function enterFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* e.g. iOS – not supported, keep playing */ }
}

// ---------- camera ----------
const _a = {};
const _b = {};
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const bodyQ = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const cam = { lean: 0, roll: 0, t: 0 };

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function updateCamera(s, dt) {
  cam.t += dt;
  const eyeS = s - tramCfg.eyeBack;
  track.at(eyeS, 0, _a);
  track.at(eyeS + VIEW.lookAhead, 0, _b);
  camera.position.set(_a.x, _a.y + tramCfg.eyeHeight, _a.z);

  // the gaze turns into curves ahead; the cab stays aligned with the body
  const gaze = _a.h + wrapAngle(Math.atan2(_b.x - _a.x, -(_b.z - _a.z)) - _a.h) * 0.7;
  // lean back when accelerating, forward when braking; sway outwards in curves
  cam.lean = damp(cam.lean, clamp(tram.a * 0.008, -0.025, 0.02), 4, dt);
  cam.roll = damp(cam.roll, clamp(-_a.k * tram.v * tram.v * 0.02, -0.02, 0.02), 3, dt);
  const amp = 0.0006 * clamp(tram.v / 14, 0, 1.2);
  const bob = (Math.sin(cam.t * 31) + Math.sin(cam.t * 17.3)) * amp;
  _e.set(VIEW.headTilt + Math.atan(_a.grade) + cam.lean + bob, -gaze, cam.roll + Math.sin(cam.t * 23.1) * amp * 0.5, 'YXZ');
  camera.quaternion.setFromEuler(_e);

  bodyQ.setFromAxisAngle(UP, -_a.h);
  _inv.copy(bodyQ).invert();
  cabCam.quaternion.copy(_inv).multiply(camera.quaternion);
  cabSun.position.copy(sunDir).applyQuaternion(_inv);
  sky.position.copy(camera.position);
}

const doorsBtn = $('doors-btn');

function updateCab() {
  const { lamps } = cab.userData;
  const blink = Math.floor(performance.now() / 300) % 2 === 0;
  setLamp(lamps.closed, tram.doors === 0);
  setLamp(lamps.open, tram.doors > 0);
  setLamp(lamps.interlock, tram.interlocked && blink);
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

  if (game.mode === 'playing') {
    game.acc += dt;
    while (game.acc >= STEP) {
      game.prevS = tram.s;
      tram.step(STEP, track.at(tram.s - tramCfg.length / 2, 0, _b).grade);
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
    sound.update(tram);
  }

  const alpha = game.mode === 'playing' ? game.acc / STEP : 1;
  const s = game.prevS + (tram.s - game.prevS) * alpha;
  updateCamera(s, game.mode === 'paused' ? 0 : dt);
  updateCab();
  city.update(s);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(cabScene, cabCam);
  hud.draw(dt, { playing: game.mode === 'playing', run, tram, debug, fps: game.fps });

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
$('start-btn').addEventListener('click', startRun);
$('again-btn').addEventListener('click', startRun);
$('resume-btn').addEventListener('click', () => setMode('playing'));
$('restart-btn').addEventListener('click', startRun);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') setMode('paused');
});
window.addEventListener('resize', resize);

tram.reset(run.stops[0].s);
game.prevS = tram.s;
resize();
setMode('menu');
if (debug) window.tram = { game, tram, run, track, input, sound, camera, EB };
Promise.race([document.fonts?.load('700 16px "Barlow Condensed"'), new Promise((r) => setTimeout(r, 1500))])
  .catch(() => {})
  .finally(() => $('loading').classList.add('hidden'));
requestAnimationFrame((t) => { last = t; frame(t); });
