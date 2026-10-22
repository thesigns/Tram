import * as THREE from 'three';
import { CITY, STOPS } from '../config.js';
import { MeshBuilder, flatMaterial } from '../models/builder.js';
import { mulberry32, pick } from '../core/utils.js';

// Placeholder city along the track (GDD §13): street, rails, sidewalks, catenary poles, facades and platforms.
// Everything static is merged into one mesh per chunk of track (one draw call each) and hidden beyond the fog.

const COL = {
  asphalt: '#55585c',
  trackbed: '#7a7266',
  rail: '#b4b9bd',
  dash: '#d8d8d0',
  sidewalk: '#a49e94',
  curb: '#8d877e',
  pole: '#4d5650',
  wire: '#2a2a2a',
  window: '#3b4651',
  cornice: '#8a7f70',
  trunk: '#5a4632',
  leaves: ['#5f7f45', '#6d8a4a', '#4f7040'],
  platform: '#b3aca0',
  tactile: '#e2c044',
  white: '#f2f0ea',
  black: '#1d1d1d',
  shelter: '#3e4c5a',
  glass: '#8fa5b5',
  stopSign: '#f2c230',
  buffer: '#c8382c',
};
const SHOPS = ['#6d3b2f', '#2f4a5d', '#4a5d3a', '#7a6a3a', '#5a3f5d'];
const UP = { x: 0, y: 1, z: 0 };
const DOWN = { x: 0, y: -1, z: 0 };
const _t = {};

// A point in the track frame: s along the track, `off` to the right, `y` above the rail top.
function pt(track, s, off, y) {
  const p = track.at(s, off, {});
  p.y += y;
  return p;
}

// Horizontal strip between two lateral offsets.
function ribbon(b, track, s0, s1, offA, offB, y, color, facing = UP, step = 2) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  let a0 = pt(track, s0, offA, y), b0 = pt(track, s0, offB, y);
  for (let i = 1; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const a1 = pt(track, s, offA, y), b1 = pt(track, s, offB, y);
    b.quad(a0, b0, b1, a1, color, facing);
    a0 = a1;
    b0 = b1;
  }
}

// Vertical strip at a lateral offset; face = +1 faces right, −1 faces left.
function wall(b, track, s0, s1, off, y0, y1, color, face, step = 2) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const h = track.at(sa, 0, _t).h;
    b.quad(pt(track, sa, off, y0), pt(track, sb, off, y0), pt(track, sb, off, y1), pt(track, sa, off, y1), color,
      { x: Math.cos(h) * face, y: 0, z: Math.sin(h) * face });
  }
}

// Box in the track frame: sx across the track, sy up, sz along it.
function tbox(b, track, s, off, y, sx, sy, sz, color) {
  const p = track.at(s, off, _t);
  b.box(sx, sy, sz, color, [p.x, p.y + y, p.z], [0, -p.h, 0]);
}

function vcyl(b, track, s, off, y, r0, r1, h, seg, color) {
  const p = track.at(s, off, _t);
  b.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1), color, [p.x, p.y + y, p.z]);
}

function street(b, track, s0, s1) {
  const R = CITY.roadHalf, F = CITY.facade, g = CITY.gauge / 2;
  ribbon(b, track, s0, s1, -R, R, 0, COL.asphalt);
  ribbon(b, track, s0, s1, -1.25, 1.25, 0.004, COL.trackbed);
  for (const r of [-g, g]) ribbon(b, track, s0, s1, r - 0.035, r + 0.035, 0.012, COL.rail);
  // lane dashes – they also give a sense of speed
  for (let s = Math.ceil(s0 / 9) * 9; s < s1; s += 9) {
    const e = Math.min(s + 4.5, s1);
    for (const o of [-4.1, 4.1]) ribbon(b, track, s, e, o - 0.07, o + 0.07, 0.006, COL.dash);
  }
  ribbon(b, track, s0, s1, R, F, 0.15, COL.sidewalk);
  ribbon(b, track, s0, s1, -F, -R, 0.15, COL.sidewalk);
  wall(b, track, s0, s1, R, 0, 0.15, COL.curb, -1);
  wall(b, track, s0, s1, -R, 0, 0.15, COL.curb, 1);
  // contact wire above the track
  ribbon(b, track, s0, s1, -0.03, 0.03, 5.6, COL.wire, DOWN);
}

function poles(b, track, s0, s1) {
  const o = CITY.roadHalf + 0.5;
  for (let s = Math.ceil(s0 / CITY.poleSpacing) * CITY.poleSpacing; s < s1; s += CITY.poleSpacing) {
    for (const side of [-1, 1]) vcyl(b, track, s, side * o, 3.6, 0.09, 0.12, 7.2, 6, COL.pole);
    tbox(b, track, s, 0, 6.4, 2 * o, 0.03, 0.03, COL.wire);
  }
}

function trees(b, track, rnd, s0, s1) {
  for (const side of [-1, 1]) {
    if (rnd() < 0.5) continue;
    const o = side * (CITY.facade - 1.5);
    for (let s = Math.ceil(s0 / CITY.poleSpacing) * CITY.poleSpacing + 15; s < s1; s += CITY.poleSpacing) {
      vcyl(b, track, s, o, 1.3, 0.12, 0.16, 2.6, 5, COL.trunk);
      const p = track.at(s, o, _t);
      const r = 1.6 + rnd() * 0.8;
      b.add(new THREE.IcosahedronGeometry(r, 0), pick(rnd, COL.leaves), [p.x, p.y + 3.2 + r * 0.6, p.z],
        [rnd(), rnd() * 6, 0], [1, 1.2, 1]);
    }
  }
}

function buildings(b, track, rnd, s0, s1, side) {
  const F = CITY.facade;
  let s = s0 + rnd() * 3;
  while (s < s1) {
    if (rnd() < 0.1) {
      // side street: a gap with a strip of asphalt leading away
      tbox(b, track, s + 7, side * (F + 20), 0.005, 40, 0.01, 12, COL.asphalt);
      s += 14;
      continue;
    }
    const w = 8 + rnd() * 10, depth = 10 + rnd() * 8;
    if (s + w > track.length) break;
    const floors = 3 + Math.floor(rnd() * 4);
    const h = 4.2 + floors * 3.1 + 0.6;
    const mid = s + w / 2;
    tbox(b, track, mid, side * (F + depth / 2), h / 2, depth, h, w, pick(rnd, CITY.palette));
    tbox(b, track, mid, side * (F + depth / 2 - 0.3), h + 0.15, depth + 0.6, 0.3, w + 0.3, COL.cornice);
    // shop front and window bands on the street facade
    const face = side * (F - 0.05);
    tbox(b, track, mid, face, 1.9, 0.12, 2.6, w * 0.9, pick(rnd, SHOPS));
    for (let f = 0; f < floors; f++) tbox(b, track, mid, face, 5.7 + f * 3.1, 0.1, 1.3, w * 0.86, COL.window);
    // taller blocks further back fill the skyline
    if (rnd() < 0.35) {
      const bh = 18 + rnd() * 16;
      tbox(b, track, mid, side * (F + depth + 8 + rnd() * 10), bh / 2, 12, bh, w, pick(rnd, CITY.palette));
    }
    s += w;
  }
}

function platform(b, track, st) {
  const E = STOPS.platformEdge, W = STOPS.platformWidth, H = STOPS.platformHeight;
  const mid = E + W / 2;
  for (let s = st.start; s < st.end - 0.01; s += 5) {
    const len = Math.min(5, st.end - s);
    tbox(b, track, s + len / 2, mid, H / 2, W, H, len + 0.02, COL.platform);
  }
  ribbon(b, track, st.start, st.end, E + 0.15, E + 0.45, H + 0.003, COL.tactile);

  // stop marker (GDD §6.1): a white line and an "H" board where the tram front should stop
  tbox(b, track, st.s, mid, H + 0.004, W, 0.01, 0.18, COL.white);
  const mo = E + 0.35;
  tbox(b, track, st.s, mo, 1.2, 0.08, 2.4, 0.08, COL.pole);
  tbox(b, track, st.s, mo, 2.35, 0.7, 0.7, 0.05, COL.white);
  for (const x of [-0.17, 0.17]) tbox(b, track, st.s - 0.03, mo + x, 2.35, 0.08, 0.46, 0.02, COL.black);
  tbox(b, track, st.s - 0.03, mo, 2.35, 0.34, 0.08, 0.02, COL.black);

  // stop flag at the entry end of the platform
  const fs = st.start + 1.5;
  tbox(b, track, fs, E + 0.4, 1.4, 0.08, 2.8, 0.08, COL.pole);
  const p = track.at(fs, E + 0.4, _t);
  b.cylZ(0.32, 0.32, 0.04, 14, COL.stopSign, [p.x, p.y + 2.75, p.z], [0, -p.h, 0]);

  // shelter
  const sm = (st.start + st.end) / 2 - 3;
  tbox(b, track, sm, E + W - 0.3, 1.45, 0.05, 2.2, 6, COL.glass);
  tbox(b, track, sm, E + W - 1, 2.65, 1.8, 0.12, 6.4, COL.shelter);
  for (const ds of [-2.9, 2.9]) tbox(b, track, sm + ds, E + W - 0.3, 1.45, 0.1, 2.5, 0.1, COL.shelter);
  tbox(b, track, sm, E + W - 0.6, 0.7, 0.4, 0.08, 4, COL.shelter);
}

export function createCity(track, stops, seed) {
  const group = new THREE.Group();
  const chunks = [];
  const L = CITY.chunk;
  for (let c = 0; c * L < track.length; c++) {
    const s0 = c * L, s1 = Math.min(track.length, s0 + L);
    const rnd = mulberry32(seed * 1000 + c);
    const b = new MeshBuilder();
    street(b, track, s0, s1);
    poles(b, track, s0, s1);
    trees(b, track, rnd, s0, s1);
    for (const side of [-1, 1]) buildings(b, track, rnd, s0, s1, side);
    for (const st of stops) if (st.s >= s0 && st.s < s1) platform(b, track, st);
    if (s1 >= track.length) {
      // buffer stop at the end of the line
      tbox(b, track, track.length - 1, 0, 0.6, 2.6, 1.2, 0.8, COL.buffer);
      tbox(b, track, track.length - 1.3, 0, 0.9, 2.62, 0.25, 0.2, COL.white);
    }
    const mesh = new THREE.Mesh(b.build(), flatMaterial);
    mesh.userData = { s0, s1 };
    chunks.push(mesh);
    group.add(mesh);
  }

  return {
    group,
    // Hide chunks behind the tram and beyond the fog.
    update(s) {
      for (const m of chunks) m.visible = m.userData.s1 > s - CITY.drawBehind && m.userData.s0 < s + CITY.drawAhead;
    },
  };
}
