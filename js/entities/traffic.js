import * as THREE from 'three';
import { MeshBuilder, flatMaterial } from '../models/builder.js';

const CAR_COLORS = ['#c8382c', '#2f5d8c', '#e8e4da', '#3a3d40', '#7a8a3a', '#d9a23a', '#5a6b7a', '#8c3b5d'];
const COATS = ['#3b5b8c', '#8c3b3b', '#4a7a4a', '#a07a3a', '#555a60', '#6a4a7a', '#c8b48a', '#2f6f73'];
const GLASS = '#2b3238', TYRE = '#1b1b1b', SKIN = '#e0b48c', DARK = '#2a2a2e';
const _p = {};
const _v = new THREE.Vector3();
const WATCH = {
  car: ['approach', 'wait', 'turn'],
  ped: ['wait', 'walk', 'back'],
  van: ['parked', 'driver'],
  bike: ['wait', 'ride'],
};

// Models face −Z (forward), like the camera.
function carParts() {
  const d = new MeshBuilder();
  d.box(1.62, 0.55, 2.1, GLASS, [0, 1.2, 0.25]);
  for (const x of [-0.82, 0.82]) for (const z of [-1.35, 1.35]) d.cylZ(0.33, 0.33, 0.22, 10, TYRE, [x, 0.33, z], [0, Math.PI / 2, 0]);
  for (const x of [-0.6, 0.6]) {
    d.box(0.35, 0.14, 0.05, '#f4f1e0', [x, 0.75, -2.16]);
    d.box(0.35, 0.14, 0.05, '#b02020', [x, 0.75, 2.16]);
  }
  return { body: new THREE.BoxGeometry(1.8, 0.75, 4.3).translate(0, 0.6, 0), details: d.build(), len: 4.3, wid: 1.8, lightY: 0.75 };
}

function vanParts() {
  const d = new MeshBuilder();
  d.box(1.9, 0.7, 0.05, GLASS, [0, 1.75, -2.72]);
  for (const x of [-0.95, 0.95]) for (const z of [-1.7, 1.7]) d.cylZ(0.38, 0.38, 0.24, 10, TYRE, [x, 0.38, z], [0, Math.PI / 2, 0]);
  for (const x of [-0.75, 0.75]) {
    d.box(0.3, 0.15, 0.05, '#f4f1e0', [x, 0.8, -2.72]);
    d.box(0.3, 0.2, 0.05, '#b02020', [x, 0.9, 2.72]);
  }
  d.box(2.12, 0.25, 5.2, '#c8382c', [0, 1.1, 0.1]);   // a stripe of livery
  return { body: new THREE.BoxGeometry(2.1, 2.2, 5.4).translate(0, 1.35, 0), details: d.build(), len: 5.4, wid: 2.1, lightY: 0.85 };
}

function pedParts() {
  const d = new MeshBuilder();
  d.box(0.26, 0.28, 0.26, SKIN, [0, 1.6, 0]);
  for (const x of [-0.11, 0.11]) d.box(0.16, 0.8, 0.18, DARK, [x, 0.4, 0]);
  return { body: new THREE.BoxGeometry(0.46, 0.65, 0.3).translate(0, 1.13, 0), details: d.build() };
}

function bikeParts() {
  const d = new MeshBuilder();
  for (const z of [-0.55, 0.55]) d.cylZ(0.34, 0.34, 0.05, 12, TYRE, [0, 0.34, z], [0, Math.PI / 2, 0]);
  d.box(0.06, 0.06, 1.0, '#9aa0a6', [0, 0.62, 0]);
  d.box(0.24, 0.26, 0.24, SKIN, [0, 1.72, -0.1]);
  for (const x of [-0.1, 0.1]) d.box(0.13, 0.6, 0.14, DARK, [x, 0.75, 0.05]);
  return { body: new THREE.BoxGeometry(0.44, 0.62, 0.3).translate(0, 1.32, 0.05).rotateX(-0.3), details: d.build() };
}

// Blinkers: one mesh per side (front + rear lamp merged).
function blinkerGeo(len, wid, y, side) {
  const b = new MeshBuilder();
  for (const z of [-len / 2 - 0.02, len / 2 + 0.02]) b.box(0.18, 0.12, 0.05, '#ffffff', [side * (wid / 2 - 0.12), y, z]);
  return b.build();
}

const blinkMat = new THREE.MeshBasicMaterial({ color: 0xffa020 });
blinkMat.userData.shared = true;

// Signal lamp symbols: stop = horizontal bar, prepare = dot, go = vertical bar (white on black).
function lampTexture(symbol, lit) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0d0d';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = lit ? '#fffbe8' : '#2c2c2c';
  if (symbol === 'stop') g.fillRect(8, 26, 48, 12);
  else if (symbol === 'go') g.fillRect(26, 8, 12, 48);
  else { g.beginPath(); g.arc(32, 32, 11, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Meshes for everything on the street (js/core/street.js), synced every frame.
export class TrafficView {
  constructor(scene, track, street) {
    this.track = track;
    this.street = street;
    this.group = new THREE.Group();
    scene.add(this.group);
    const parts = { car: carParts(), van: vanParts(), ped: pedParts(), bike: bikeParts() };
    this.views = street.agents.map((a) => {
      const p = parts[a.kind];
      const root = new THREE.Group();
      const palette = a.kind === 'ped' || a.kind === 'bike' ? COATS : CAR_COLORS;
      const color = a.kind === 'van' ? '#eeeae0' : palette[a.color % palette.length];
      const body = new THREE.Mesh(p.body, new THREE.MeshLambertMaterial({ color }));
      root.add(body, new THREE.Mesh(p.details, flatMaterial));
      let blink = null;
      if (p.lightY) {
        blink = [-1, 1].map((side) => new THREE.Mesh(blinkerGeo(p.len, p.wid, p.lightY, side), blinkMat));
        root.add(...blink);
      }
      root.visible = false;
      this.group.add(root);
      return { a, root, body, blink, colorIndex: a.color };
    });

    // tram signals: pole and head merged, three lamps per signal
    const symbols = ['stop', 'prepare', 'go'];
    this.lampMats = Object.fromEntries(symbols.map((s) => [s, [false, true].map((lit) => new THREE.MeshBasicMaterial({ map: lampTexture(s, lit) }))]));
    const lampGeo = new THREE.PlaneGeometry(0.3, 0.3);
    const b = new MeshBuilder();
    this.signals = street.signals.map((sg) => {
      const s = sg.line + 0.5, off = 2.1;
      const p = track.at(s, off, _p);
      b.add(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), '#3a3f3c', [p.x, p.y + 1.8, p.z]);
      b.box(0.42, 1.12, 0.2, '#151515', [p.x + Math.sin(p.h) * 0.1, p.y + 3.2, p.z - Math.cos(p.h) * 0.1], [0, -p.h, 0]);
      const lamps = symbols.map((sym, i) => {
        const m = new THREE.Mesh(lampGeo, this.lampMats[sym][0]);
        // in front of the head, towards the tram: −forward = (−sin h, 0, cos h)
        m.position.set(p.x - Math.sin(p.h) * 0.01, p.y + 3.55 - i * 0.35, p.z + Math.cos(p.h) * 0.01);
        m.rotation.y = -p.h;
        this.group.add(m);
        return { sym, m };
      });
      return { sg, lamps };
    });
    this.group.add(new THREE.Mesh(b.build(), flatMaterial));
  }

  // Lamp materials are swapped, so not all of them are in the scene graph when the world is disposed.
  dispose() {
    for (const pair of Object.values(this.lampMats)) for (const m of pair) { m.map.dispose(); m.dispose(); }
  }

  // Screen positions above hazards worth watching (GDD §7 telegraphing): people at the kerb, a car
  // waiting to turn, a van on the rails, a cyclist between them. On a phone they are only a few pixels
  // tall at the distance where a driver has to read them, so the HUD marks them.
  markers(camera, w, h, tramS) {
    const out = [];
    for (const hz of this.street.hazards) {
      const a = hz.agent;
      const d = a.s - tramS;
      if (!a.visible || d < 3 || d > 170 || !WATCH[a.kind]?.includes(a.state)) continue;
      if (a.kind === 'bike' && a.state === 'ride' && Math.abs(a.off) > 2) continue;   // moved aside
      const p = this.track.at(a.s, a.off, _p);
      _v.set(p.x, p.y + (a.kind === 'van' ? 2.9 : 2.3), p.z).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) continue;
      out.push({ x: ((_v.x + 1) / 2) * w, y: ((1 - _v.y) / 2) * h, dist: d });
    }
    return out;
  }

  update(time) {
    const track = this.track;
    const blinkOn = Math.floor(time / 0.4) % 2 === 0;
    for (const v of this.views) {
      const a = v.a;
      v.root.visible = a.visible;
      if (!a.visible) continue;
      if (a.color !== v.colorIndex) {
        // agents are reused (cross traffic): repaint
        const palette = a.kind === 'ped' || a.kind === 'bike' ? COATS : CAR_COLORS;
        if (a.kind !== 'van') v.body.material.color.set(palette[a.color % palette.length]);
        v.colorIndex = a.color;
      }
      const p = track.at(a.s, a.off, _p);
      const c = Math.cos(a.dir), s = Math.sin(a.dir);
      const dx = c * Math.sin(p.h) + s * Math.cos(p.h);
      const dz = -c * Math.cos(p.h) + s * Math.sin(p.h);
      v.root.position.set(p.x, p.y + (a.kind === 'ped' || a.kind === 'bike' ? Math.abs(Math.sin(a.step * 3)) * 0.04 : 0), p.z);
      v.root.rotation.y = Math.atan2(-dx, -dz);
      if (v.blink) {
        // left = −X in the model
        v.blink[0].visible = blinkOn && (a.blink === 'left' || a.blink === 'hazard');
        v.blink[1].visible = blinkOn && (a.blink === 'right' || a.blink === 'hazard');
      }
    }
    for (const { sg, lamps } of this.signals) {
      const aspect = sg.aspect(this.street.time);
      // "prepare" blinks, like a warning
      for (const { sym, m } of lamps) m.material = this.lampMats[sym][sym === aspect && (sym !== 'prepare' || blinkOn) ? 1 : 0];
    }
  }
}
