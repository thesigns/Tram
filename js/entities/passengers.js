import * as THREE from 'three';
import { STOPS } from '../config.js';
import { mulberry32, pick } from '../core/utils.js';

const COATS = ['#3b5b8c', '#8c3b3b', '#4a7a4a', '#a07a3a', '#555a60', '#6a4a7a', '#c8b48a', '#2f6f73'];
const SKIN = ['#e3b98f', '#c99a6e', '#8d5e3c', '#f0cfae'];
const WALK = 1.6;   // boarding pace [m/s]
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _t = {};
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// People waiting on the platforms: two instanced meshes (bodies, heads) for the whole line.
// Boarding: each walks to the nearest door and disappears inside.
export class Passengers {
  constructor(scene, track, stops, seed) {
    this.track = track;
    this.scene = scene;
    const total = stops.reduce((n, st) => n + st.baseWaiting, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 1.2, 0.3), mat, Math.max(1, total));
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.27, 0.25), mat, Math.max(1, total));
    this.bodies.count = this.heads.count = total;
    this.people = [];             // { s, off, scale, yaw, y }
    this.index = stops.map(() => []);
    this.walkers = [];            // { i, s0, o0, s1, o1, t, d }

    const rnd = mulberry32(seed * 7 + 3);
    const top = STOPS.platformHeight;
    let i = 0;
    stops.forEach((st, si) => {
      for (let k = 0; k < st.baseWaiting; k++, i++) {
        const s = st.start + 4 + rnd() * (STOPS.platformLength - 10);
        const off = STOPS.platformEdge + 0.7 + rnd() * 1.6;
        const p = track.at(s, off, _t);
        // facing the track, with a little variety
        this.people.push({ s, off, y: p.y + top, scale: 0.92 + rnd() * 0.16, yaw: -p.h - Math.PI / 2 + (rnd() - 0.5) * 0.8 });
        this.bodies.setColorAt(i, _c.set(pick(rnd, COATS)));
        this.heads.setColorAt(i, _c.set(pick(rnd, SKIN)));
        this.index[si].push(i);
      }
    });
    this.reset(stops);
    scene.add(this.bodies, this.heads);
  }

  place(i, s, off, yaw) {
    const person = this.people[i];
    const p = this.track.at(s, off, _t);
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    _s.setScalar(person.scale);
    this.bodies.setMatrixAt(i, _m.compose(_p.set(p.x, person.y + 0.6 * person.scale, p.z), _q, _s));
    this.heads.setMatrixAt(i, _m.compose(_p.set(p.x, person.y + 1.35 * person.scale, p.z), _q, _s));
  }

  // Show the people actually waiting in this run (stops[i].waiting of the ones built).
  reset(stops) {
    this.walkers = [];
    this.index.forEach((list, si) => list.forEach((i, k) => {
      const pp = this.people[i];
      if (k < stops[si].waiting) this.place(i, pp.s, pp.off, pp.yaw);
      else this.hide(i);
    }));
    this.flush();
  }

  hide(i) {
    this.bodies.setMatrixAt(i, HIDDEN);
    this.heads.setMatrixAt(i, HIDDEN);
  }

  // Passenger k of a stop boards through the nearest door (doors: positions along the track).
  board(stop, k, doors) {
    const i = this.index[stop]?.[k];
    if (i === undefined) return;
    const pp = this.people[i];
    const door = doors.reduce((a, d) => (Math.abs(d - pp.s) < Math.abs(a - pp.s) ? d : a));
    const o1 = STOPS.platformEdge + 0.2;
    this.walkers.push({ i, s0: pp.s, o0: pp.off, s1: door, o1, t: 0, d: Math.hypot(door - pp.s, o1 - pp.off) / WALK });
  }

  update(dt) {
    if (!this.walkers.length) return;
    for (const w of this.walkers) {
      w.t += dt;
      const f = Math.min(1, w.t / Math.max(w.d, 0.01));
      if (f >= 1) { this.hide(w.i); continue; }
      const p = this.track.at(w.s0, 0, _t);
      // heading in the track frame, turned into a world yaw (models face −Z)
      const ds = w.s1 - w.s0, doff = w.o1 - w.o0;
      const dx = ds * Math.sin(p.h) + doff * Math.cos(p.h), dz = -ds * Math.cos(p.h) + doff * Math.sin(p.h);
      this.place(w.i, w.s0 + ds * f, w.o0 + doff * f, Math.atan2(-dx, -dz));
    }
    this.walkers = this.walkers.filter((w) => w.t < w.d);
    this.flush();
  }

  flush() {
    for (const m of [this.bodies, this.heads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  dispose() {
    this.scene.remove(this.bodies, this.heads);
    for (const m of [this.bodies, this.heads]) m.geometry.dispose();
    this.bodies.material.dispose();
  }
}
