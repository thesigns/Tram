import * as THREE from 'three';
import { CITY, LOOKS } from '../config.js';
import { MeshBuilder, flatMaterial } from '../models/builder.js';
import { mulberry32, pick } from '../core/utils.js';
import { prismAcross, tbox, vcyl } from './frame.js';

// Hand-placed landmarks that give a city its identity (GDD §13), from the route's `landmarks`:
// { type: cathedral | gate | market, s, off? (cathedral: front line, < 0 = left), side?, from?, to? }.

const STONE = '#cbb894';
const STONE_DARK = '#b3a079';
const COPPER = '#6f9c8a';
const SLATE = '#4f545c';
const DARK = '#2c2a28';
const _t = {};

function foundation(b, track, s, off, top, sx, sz, color) {
  const h = top + CITY.foundation;
  tbox(b, track, s, off, top - h / 2, sx, h, sz, color);
}

// A disc facing the track (rose window, clock face).
function disc(b, track, s, off, y, r, color) {
  const p = track.at(s, off, _t);
  b.add(new THREE.CylinderGeometry(r, r, 0.2, 12).rotateZ(Math.PI / 2), color, [p.x, p.y + y, p.z], [0, -p.h, 0]);
}

// Twin-towered cathedral with its facade towards the track; `off` is the front line.
function cathedral(b, track, m) {
  const side = Math.sign(m.off), f = Math.abs(m.off);
  const at = (d) => side * (f + d);
  foundation(b, track, m.s, at(21), 22, 36, 18, STONE);
  prismAcross(b, track, m.s, at(21), 22, 36, 9, 18.6, SLATE);
  for (const ds of [-6.5, 6.5]) {
    foundation(b, track, m.s + ds, at(3.5), 40, 7, 7, STONE_DARK);
    vcyl(b, track, m.s + ds, at(3.5), 47, 0, 5, 14, 4, COPPER, Math.PI / 4);
  }
  // portal and rose window between the towers
  tbox(b, track, m.s, at(2.95), 3.2, 0.12, 6.4, 4, DARK);
  disc(b, track, m.s, at(2.9), 13, 2.2, '#40506a');
  disc(b, track, m.s, at(2.85), 13, 1.2, '#c8a85a');
}

// A city gate over the street: two towers and a passage high above the catenary (GDD §8).
function gate(b, track, m, look) {
  const o = look.roadHalf + 3;
  for (const side of [-1, 1]) {
    foundation(b, track, m.s, side * o, 15, 6, 6, STONE_DARK);
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

// Market stalls with striped awnings on a square.
function market(b, track, m) {
  const side = m.side === 'left' ? -1 : 1;
  const rnd = mulberry32(Math.round(m.from) * 31 + 7);
  const stripes = [['#c8382c', '#f2ead3'], ['#2f5d8c', '#f2ead3'], ['#4a7a4a', '#f2ead3'], ['#d9a23a', '#6d3b2f']];
  for (let s = m.from + 4; s < m.to - 4; s += 7 + rnd() * 3) {
    for (const off of [14 + rnd() * 4, 28 + rnd() * 6]) {
      const o = side * off;
      tbox(b, track, s, o, 0.6, 2.4, 0.9, 3.4, '#8a6a48');
      for (const [ds, dx] of [[-1.6, -1.1], [-1.6, 1.1], [1.6, -1.1], [1.6, 1.1]]) tbox(b, track, s + ds, o + dx, 1.25, 0.08, 2.2, 0.08, DARK);
      const [c1, c2] = pick(rnd, stripes);
      for (let k = 0; k < 6; k++) tbox(b, track, s - 1.75 + k * 0.6 + 0.3, o, 2.45, 2.8, 0.1, 0.6, k % 2 ? c2 : c1);
    }
  }
}

export function createLandmarks(track, route) {
  const look = LOOKS[route.look ?? 'modern'];
  const b = new MeshBuilder();
  for (const m of route.landmarks ?? []) {
    if (m.type === 'cathedral') cathedral(b, track, m);
    else if (m.type === 'gate') gate(b, track, m, look);
    else if (m.type === 'market') market(b, track, m);
  }
  const group = new THREE.Group();
  if (!b.empty) group.add(new THREE.Mesh(b.build(), flatMaterial));
  return { group, dispose: () => group.children.forEach((c) => c.geometry.dispose()) };
}
