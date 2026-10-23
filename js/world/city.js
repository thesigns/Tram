import * as THREE from 'three';
import { CITY, LOOKS, STOPS, STREET } from '../config.js';
import { MeshBuilder, flatMaterial } from '../models/builder.js';
import { mulberry32, pick } from '../core/utils.js';
import { prism, ribbon, tbox, vcyl, wall } from './frame.js';

// Placeholder city along the track (GDD §13): street, rails, sidewalks, catenary poles, facades, platforms,
// cross streets and squares, in the route's look (modern / altstadt). Everything static is merged into
// one mesh per chunk of track (one draw call each) and hidden beyond the fog. Buildings reach far below
// the street (CITY.foundation), so a line climbing a hill never shows a gap under them.

const COL = {
  rail: '#b4b9bd',
  dash: '#d8d8d0',
  pole: '#4d5650',
  wire: '#2a2a2a',
  window: '#3b4651',
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
const DOWN = { x: 0, y: -1, z: 0 };
const SQUARE = 60;        // squares reach this far from the track
const _t = {};

// Parts of [s0, s1] outside the gaps (sorted [from, to] ranges).
function outside(s0, s1, gaps) {
  const out = [];
  let a = s0;
  for (const [g0, g1] of gaps) {
    if (g1 <= a || g0 >= s1) continue;
    if (g0 > a) out.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (a < s1) out.push([a, s1]);
  return out;
}

const inGap = (s, gaps) => gaps.some(([g0, g1]) => s > g0 && s < g1);

// A block that reaches below the street: top at `top`, foundation underneath.
function block(b, track, s, off, top, sx, sz, color) {
  const h = top + CITY.foundation;
  tbox(b, track, s, off, top - h / 2, sx, h, sz, color);
}

function street(b, track, look, s0, s1, gaps) {
  const R = look.roadHalf, F = look.facade, g = CITY.gauge / 2;
  ribbon(b, track, s0, s1, -R, R, 0, look.road);
  ribbon(b, track, s0, s1, -1.25, 1.25, 0.004, look.trackbed);
  for (const r of [-g, g]) ribbon(b, track, s0, s1, r - 0.035, r + 0.035, 0.012, COL.rail);
  if (look.dashes) {
    // lane dashes – they also give a sense of speed
    for (let s = Math.ceil(s0 / 9) * 9; s < s1; s += 9) {
      const e = Math.min(s + 4.5, s1);
      for (const o of [-4.1, 4.1]) ribbon(b, track, s, e, o - 0.07, o + 0.07, 0.006, COL.dash);
    }
  }
  // sidewalks, interrupted by cross streets
  for (const [a, e] of outside(s0, s1, gaps)) {
    ribbon(b, track, a, e, R, F, 0.15, look.sidewalk);
    ribbon(b, track, a, e, -F, -R, 0.15, look.sidewalk);
    wall(b, track, a, e, R, 0, 0.15, look.curb, -1);
    wall(b, track, a, e, -R, 0, 0.15, look.curb, 1);
  }
  // contact wire above the track
  ribbon(b, track, s0, s1, -0.03, 0.03, 5.6, COL.wire, DOWN);
}

function poles(b, track, look, s0, s1, gaps) {
  const o = look.roadHalf + 0.5;
  for (let s = Math.ceil(s0 / CITY.poleSpacing) * CITY.poleSpacing; s < s1; s += CITY.poleSpacing) {
    if (inGap(s, gaps)) continue;
    for (const side of [-1, 1]) vcyl(b, track, s, side * o, 3.6, 0.09, 0.12, 7.2, 6, COL.pole);
    tbox(b, track, s, 0, 6.4, 2 * o, 0.03, 0.03, COL.wire);
  }
}

// A cross street: a street beyond the main road, a zebra crossing before it and, with a tram signal,
// the tram stop line.
function intersection(b, track, look, I) {
  const R = look.roadHalf, W = 2 * STREET.crossHalf;
  for (const side of [-1, 1]) block(b, track, I.s, side * (R + 22), 0.003, 44, W, look.road);
  const zs = I.s - STREET.crossHalf - 1.8;
  for (let o = -R + 0.6; o < R - 0.3; o += 1.1) {
    if (Math.abs(o) < 1.6) continue;
    tbox(b, track, zs, o, 0.006, 0.55, 0.01, 3, COL.white);
  }
  if (I.signal) tbox(b, track, I.s - STREET.stopLineBack, 0, 0.008, 2.6, 0.01, 0.35, COL.white);
}

function trees(b, track, look, rnd, s0, s1, gaps) {
  for (const side of [-1, 1]) {
    if (rnd() < 0.5) continue;
    const o = side * (look.facade - 1.5);
    for (let s = Math.ceil(s0 / CITY.poleSpacing) * CITY.poleSpacing + 15; s < s1; s += CITY.poleSpacing) {
      if (inGap(s, gaps)) continue;
      vcyl(b, track, s, o, 1.3, 0.12, 0.16, 2.6, 5, COL.trunk);
      const p = track.at(s, o, _t);
      const r = 1.6 + rnd() * 0.8;
      b.add(new THREE.IcosahedronGeometry(r, 0), pick(rnd, COL.leaves), [p.x, p.y + 3.2 + r * 0.6, p.z],
        [rnd(), rnd() * 6, 0], [1, 1.2, 1]);
    }
  }
}

// One house on the street: facade, shop front, window bands, a cornice or a pitched roof.
function house(b, track, look, rnd, mid, off, side, w, depth, floors) {
  const h = 4.2 + floors * 3.1 + 0.6;
  block(b, track, mid, off, h, depth, w, pick(rnd, look.palette));
  if (rnd() < look.roofs) {
    prism(b, track, mid, off, h, depth + 0.6, 3 + rnd() * 3, w, pick(rnd, look.roofColors));
  } else {
    tbox(b, track, mid, off - side * 0.3, h + 0.15, depth + 0.6, 0.3, w + 0.3, look.roofColors[0]);
  }
  const face = side * (Math.abs(off) - depth / 2 - 0.05);
  tbox(b, track, mid, face, 1.9, 0.12, 2.6, w * 0.9, pick(rnd, SHOPS));
  for (let f = 0; f < floors; f++) tbox(b, track, mid, face, 5.7 + f * 3.1, 0.1, 1.3, w * 0.86, COL.window);
}

function buildings(b, track, look, rnd, s0, s1, side, gaps) {
  const F = look.facade;
  const [f0, f1] = look.floors;
  let s = s0 + rnd() * 3;
  while (s < s1) {
    const w = 8 + rnd() * 10, depth = 10 + rnd() * 8;
    // keep cross streets and squares free, with a bit of room at the corners
    const gap = gaps.find(([g0, g1]) => s < g1 + 1 && s + w > g0 - 1);
    if (gap) {
      s = gap[1] + 1;
      continue;
    }
    if (rnd() < 0.1) {
      // side street: a gap with a strip of road leading away
      block(b, track, s + 7, side * (F + 20), 0.005, 40, 12, look.road);
      s += 14;
      continue;
    }
    if (s + w > track.length) break;
    const floors = f0 + Math.floor(rnd() * (f1 - f0 + 1));
    house(b, track, look, rnd, s + w / 2, side * (F + depth / 2), side, w, depth, floors);
    // taller blocks further back fill the skyline
    if (rnd() < 0.35) {
      const bh = 6 + f1 * 3.5 + rnd() * 12;
      block(b, track, s + w / 2, side * (F + depth + 8 + rnd() * 10), bh, 12, w, pick(rnd, look.palette));
    }
    s += w;
  }
}

// An open square on one side of the street: paving out to SQUARE, closed by a row of houses behind it.
function square(b, track, look, rnd, sq, s0, s1) {
  const a = Math.max(s0, sq.from), e = Math.min(s1, sq.to);
  if (a >= e) return;
  const side = sq.side === 'left' ? -1 : 1;
  const [o0, o1] = side > 0 ? [look.facade, SQUARE] : [-SQUARE, -look.facade];
  ribbon(b, track, a, e, o0, o1, 0.15, look.sidewalk, undefined, 4);
  for (let s = a, w; s < e - 4; s += w) {
    w = Math.min(10 + rnd() * 6, e - s);
    house(b, track, look, rnd, s + w / 2, side * (SQUARE + 7), side, w, 14, look.floors[1] + 1);
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

// Building-free ranges along the track that landmarks need (both sides).
const LANDMARK_GAPS = { gate: 6 };

export function createCity(track, stops, route) {
  const look = LOOKS[route.look ?? 'modern'];
  const intersections = route.intersections ?? [];
  const squares = route.squares ?? [];
  const group = new THREE.Group();
  const chunks = [];
  const L = CITY.chunk;
  const sort = (list) => list.sort((a, b) => a[0] - b[0]);
  const cross = sort(intersections.map((I) => [I.s - STREET.crossHalf, I.s + STREET.crossHalf]));
  const marks = (route.landmarks ?? []).filter((m) => LANDMARK_GAPS[m.type])
    .map((m) => [m.s - LANDMARK_GAPS[m.type], m.s + LANDMARK_GAPS[m.type]]);
  const both = sort([...cross, ...marks]);
  const sideGaps = (side) => sort([...both, ...squares.filter((q) => q.side === side).map((q) => [q.from, q.to])]);
  const gapsBySide = { [-1]: sideGaps('left'), 1: sideGaps('right') };

  for (let c = 0; c * L < track.length; c++) {
    const s0 = c * L, s1 = Math.min(track.length, s0 + L);
    const rnd = mulberry32(route.seed * 1000 + c);
    const b = new MeshBuilder();
    street(b, track, look, s0, s1, cross);
    poles(b, track, look, s0, s1, both);
    trees(b, track, look, rnd, s0, s1, both);
    for (const side of [-1, 1]) buildings(b, track, look, rnd, s0, s1, side, gapsBySide[side]);
    for (const sq of squares) square(b, track, look, rnd, sq, s0, s1);
    for (const st of stops) if (st.s >= s0 && st.s < s1) platform(b, track, st);
    for (const I of intersections) if (I.s >= s0 && I.s < s1) intersection(b, track, look, I);
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
    dispose() {
      for (const m of chunks) m.geometry.dispose();
    },
  };
}
