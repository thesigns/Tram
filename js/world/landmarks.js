import * as THREE from 'three';
import { LOOKS } from '../config.js';
import { MeshBuilder, flatMaterial } from '../models/builder.js';
import { mulberry32, pick } from '../core/utils.js';
import { block, groundLevel, prismAcross, tbox, vcyl } from './frame.js';

// Hand-placed landmarks that give a city its identity (GDD §13), from the route's `landmarks`:
// { type: cathedral | gate | market | cranes | ship | lighthouse, s, off? (< 0 = left), side?, from?, to? }.

const STONE = '#cbb894';
const STONE_DARK = '#b3a079';
const COPPER = '#6f9c8a';
const SLATE = '#4f545c';
const DARK = '#2c2a28';
const CONTAINERS = ['#c8382c', '#2f5d8c', '#4a7a4a', '#d9a23a', '#8c3b5d', '#e8e4da', '#5a6b7a'];
const _t = {};

// A disc facing the track (rose window, clock face).
function disc(b, track, s, off, y, r, color) {
  const p = track.at(s, off, _t);
  b.add(new THREE.CylinderGeometry(r, r, 0.2, 12).rotateZ(Math.PI / 2), color, [p.x, p.y + y, p.z], [0, -p.h, 0]);
}

// A box tilted about the track direction (a crane jib): from (off0, y0) to (off1, y1), `w` thick.
function beam(b, track, s, off0, y0, off1, y1, w, color) {
  const len = Math.hypot(off1 - off0, y1 - y0);
  const p = track.at(s, (off0 + off1) / 2, _t);
  b.add(new THREE.BoxGeometry(len, w, w), color, [p.x, p.y + (y0 + y1) / 2, p.z], [0, -p.h, Math.atan2(y1 - y0, off1 - off0)]);
}

// Twin-towered cathedral with its facade towards the track; `off` is the front line.
function cathedral(b, track, base, m) {
  const side = Math.sign(m.off), f = Math.abs(m.off);
  const at = (d) => side * (f + d);
  block(b, track, base, m.s, at(21), 22, 36, 18, STONE);
  prismAcross(b, track, m.s, at(21), 22, 36, 9, 18.6, SLATE);
  for (const ds of [-6.5, 6.5]) {
    block(b, track, base, m.s + ds, at(3.5), 40, 7, 7, STONE_DARK);
    vcyl(b, track, m.s + ds, at(3.5), 47, 0, 5, 14, 4, COPPER, Math.PI / 4);
  }
  // portal and rose window between the towers
  tbox(b, track, m.s, at(2.95), 3.2, 0.12, 6.4, 4, DARK);
  disc(b, track, m.s, at(2.9), 13, 2.2, '#40506a');
  disc(b, track, m.s, at(2.85), 13, 1.2, '#c8a85a');
}

// A city gate over the street: two towers and a passage high above the catenary (GDD §8).
function gate(b, track, base, m, look) {
  const o = look.roadHalf + 3;
  for (const side of [-1, 1]) {
    block(b, track, base, m.s, side * o, 15, 6, 6, STONE_DARK);
    vcyl(b, track, m.s, side * o, 18.5, 0, 4.6, 7, 4, '#8c4a2f', Math.PI / 4);
  }
  tbox(b, track, m.s, 0, 10, 2 * o, 4, 5, STONE);
  prismAcross(b, track, m.s, 0, 12, 2 * o, 3, 5.4, '#8c4a2f');
  // a clock above the passage, facing the tram
  disc(b, track, m.s - 2.55, 0, 10.2, 1.3, '#efe8d2');
  const p = track.at(m.s - 2.68, 0, _t);
  b.box(0.08, 0.9, 0.05, DARK, [p.x, p.y + 10.55, p.z], [0, -p.h, 0]);
  b.box(0.6, 0.08, 0.05, DARK, [p.x, p.y + 10.2, p.z], [0, -p.h, 0]);
}

// Market stalls with striped awnings on a square or a quay; `rows`: their distances from the track.
function market(b, track, m) {
  const side = m.side === 'left' ? -1 : 1;
  const rnd = mulberry32(Math.round(m.from) * 31 + 7);
  const stripes = [['#c8382c', '#f2ead3'], ['#2f5d8c', '#f2ead3'], ['#4a7a4a', '#f2ead3'], ['#d9a23a', '#6d3b2f']];
  for (let s = m.from + 4; s < m.to - 4; s += 7 + rnd() * 3) {
    const rows = m.rows ? m.rows.map((r) => r + rnd() * 1.5) : [14 + rnd() * 4, 28 + rnd() * 6];
    for (const off of rows) {
      const o = side * off;
      tbox(b, track, s, o, 0.6, 2.4, 0.9, 3.4, '#8a6a48');
      for (const [ds, dx] of [[-1.6, -1.1], [-1.6, 1.1], [1.6, -1.1], [1.6, 1.1]]) tbox(b, track, s + ds, o + dx, 1.25, 0.08, 2.2, 0.08, DARK);
      const [c1, c2] = pick(rnd, stripes);
      for (let k = 0; k < 6; k++) tbox(b, track, s - 1.75 + k * 0.6 + 0.3, o, 2.45, 2.8, 0.1, 0.6, k % 2 ? c2 : c1);
    }
  }
}

// Gantry cranes on a quay (GDD §13): legs on the crane rails, the machine house, a jib out over the water,
// and containers stacked between them.
function cranes(b, track, m, look) {
  const side = m.side === 'left' ? -1 : 1, F = look.facade;
  const rnd = mulberry32(Math.round(m.from) * 17 + 5);
  const inner = F + 2, outer = (m.edge ?? 22) - 2.5, mid = (inner + outer) / 2;
  for (let s = m.from + 20; s < m.to - 8; s += 55) {
    const color = pick(rnd, ['#c8572c', '#d9a23a']);
    for (const o of [inner, outer]) {
      for (const ds of [-4, 4]) tbox(b, track, s + ds, side * o, 7, 0.7, 14, 0.7, color);
      tbox(b, track, s, side * o, 1, 0.9, 0.9, 9.5, color);
    }
    for (const ds of [-4, 4]) tbox(b, track, s + ds, side * mid, 13.6, outer - inner + 0.7, 0.8, 0.8, color);
    tbox(b, track, s, side * mid, 16, 7, 4, 7, color);
    tbox(b, track, s, side * (mid - 1.5), 16.5, 2.5, 2, 2.5, '#2b3238');
    // the jib out over the water, the counter-jib with its weight, the A-frame and the hook
    const lift = 0.1 + rnd() * 0.5;
    const tipO = mid + 34 * Math.cos(lift), tipY = 17 + 34 * Math.sin(lift);
    beam(b, track, s, side * mid, 17, side * tipO, tipY, 1.1, color);
    beam(b, track, s, side * mid, 17.5, side * (mid - 12), 18.5, 1, color);
    tbox(b, track, s, side * (mid - 11), 17.3, 2.6, 2.4, 3, '#4a4d50');
    beam(b, track, s, side * mid, 24, side * (mid + 18), 17 + 18 * Math.sin(lift), 0.25, DARK);
    beam(b, track, s, side * mid, 24, side * (mid - 11), 18.5, 0.25, DARK);
    tbox(b, track, s, side * mid, 21, 0.6, 7, 0.6, color);
    tbox(b, track, s, side * (tipO - 2), (tipY + 7) / 2, 0.06, tipY - 7, 0.06, DARK);
    tbox(b, track, s, side * (tipO - 2), 6.6, 0.8, 0.8, 0.8, '#d9a23a');
  }
  // container stacks between the cranes
  for (let s = m.from + 40; s < m.to - 20; s += 55) {
    for (let k = 0; k < 3; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let h = 0; h < n; h++) tbox(b, track, s + k * 6.4 - 6.4, side * (mid + 0.5), 1.45 + h * 2.6, 2.45, 2.6, 6.1, pick(rnd, CONTAINERS));
    }
  }
}

// A cargo ship moored at a quay: hull, containers on deck, the superstructure at the stern.
function ship(b, track, m, sea) {
  const rnd = mulberry32(Math.round(m.from) * 13 + 1);
  const len = m.to - m.from, mid = (m.from + m.to) / 2, o = m.off, W = 13;
  const y = (s) => sea - track.at(s, o, _t).y;   // the waterline, relative to the street there
  tbox(b, track, mid, o, y(mid) + 3, W, 8, len, ['#2b3a4a', '#2b3a4a', '#6d7378', '#2b3a4a', '#2b3a4a', '#2b3a4a']);
  tbox(b, track, mid, o, y(mid) + 0.4, W + 0.04, 0.8, len + 0.04, '#8c2f26');
  // a pointed bow
  const p = track.at(m.to, o, _t);
  b.add(new THREE.CylinderGeometry(W / Math.sqrt(3), W / Math.sqrt(3), 8, 3), '#2b3a4a', [p.x, p.y + y(m.to) + 3, p.z], [0, -p.h + Math.PI, 0], [1, 1, 1.6]);
  // the superstructure at the stern, with a funnel
  const st = m.from + 9;
  tbox(b, track, st, o, y(st) + 12, W - 1, 8, 10, '#e8e4da');
  tbox(b, track, st, o, y(st) + 13.5, W - 0.9, 1, 10.1, '#3b4651');
  tbox(b, track, st, o, y(st) + 10.5, W - 0.9, 0.8, 10.1, '#3b4651');
  vcyl(b, track, st + 3, o, y(st) + 18, 1.3, 1.5, 4, 8, '#c8382c');
  vcyl(b, track, st + 3, o, y(st) + 20.3, 1.32, 1.32, 0.8, 8, DARK);
  // containers in bays across the deck
  for (let s = m.from + 18; s < m.to - 10; s += 6.6) {
    for (let k = -2; k <= 2; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let h = 0; h < n; h++) tbox(b, track, s, o + k * 2.5, y(s) + 8.3 + h * 2.6, 2.4, 2.6, 6.1, pick(rnd, CONTAINERS));
    }
  }
}

// A lighthouse on the rocks at the end of the line: banded tower, gallery, lantern, keeper's house.
function lighthouse(b, lamp, track, base, m) {
  const o = m.off;
  const rnd = mulberry32(Math.round(m.s));
  block(b, track, base, m.s, o, 0.4, 12, 12, '#8e8a82');
  for (let i = 0; i < 7; i++) {
    const p = track.at(m.s + (rnd() - 0.5) * 14, o + (rnd() - 0.5) * 14, _t);
    b.add(new THREE.IcosahedronGeometry(1.5 + rnd() * 1.5, 0), '#7a766f', [p.x, p.y + 0.2, p.z], [rnd(), rnd(), rnd()]);
  }
  for (let i = 0; i < 6; i++) {
    const r0 = 2.6 - i * 0.14, r1 = 2.6 - (i + 1) * 0.14;
    vcyl(b, track, m.s, o, 0.4 + i * 3.4 + 1.7, r1, r0, 3.4, 12, i % 2 ? '#c8382c' : '#f2f0ea');
  }
  vcyl(b, track, m.s, o, 21.2, 2.7, 2.7, 0.4, 12, DARK);
  vcyl(b, track, m.s, o, 22.1, 2.6, 2.6, 0.9, 12, '#2c3a40');
  vcyl(lamp, track, m.s, o, 23.6, 1.3, 1.3, 2.2, 10, '#ffffff');
  vcyl(b, track, m.s, o, 25.4, 0, 1.6, 1.4, 10, '#c8382c');
  // the keeper's house
  const ho = o + (o < 0 ? 5 : -5);
  tbox(b, track, m.s - 5, ho, 1.9, 4, 3, 6, '#f2f0ea');
  prismAcross(b, track, m.s - 5, ho, 3.4, 4.6, 2, 6.4, '#4f545c');
}

export function createLandmarks(track, route) {
  const look = LOOKS[route.look ?? 'modern'];
  const base = groundLevel(track, route);
  const b = new MeshBuilder(), lamp = new MeshBuilder();
  for (const m of route.landmarks ?? []) {
    if (m.type === 'cathedral') cathedral(b, track, base, m);
    else if (m.type === 'gate') gate(b, track, base, m, look);
    else if (m.type === 'market') market(b, track, m);
    else if (m.type === 'cranes') cranes(b, track, m, look);
    else if (m.type === 'ship') ship(b, track, m, route.sea ?? base);
    else if (m.type === 'lighthouse') lighthouse(b, lamp, track, base, m);
  }
  const group = new THREE.Group();
  if (!b.empty) group.add(new THREE.Mesh(b.build(), flatMaterial));
  if (!lamp.empty) group.add(new THREE.Mesh(lamp.build(), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })));
  return { group };
}
