import * as THREE from 'three';
import { STOPS } from '../config.js';
import { mulberry32, pick } from '../core/utils.js';

const COATS = ['#3b5b8c', '#8c3b3b', '#4a7a4a', '#a07a3a', '#555a60', '#6a4a7a', '#c8b48a', '#2f6f73'];
const SKIN = ['#e3b98f', '#c99a6e', '#8d5e3c', '#f0cfae'];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _t = {};
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// People waiting on the platforms: two instanced meshes (bodies, heads) for the whole line.
// Boarding hides them one by one (simple placeholder for the boarding animation).
export class Passengers {
  constructor(scene, track, stops, seed) {
    const total = stops.reduce((n, st) => n + st.waiting, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 1.2, 0.3), mat, Math.max(1, total));
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.27, 0.25), mat, Math.max(1, total));
    this.bodies.count = this.heads.count = total;
    this.matrices = [];
    this.index = stops.map(() => []);

    const rnd = mulberry32(seed * 7 + 3);
    const top = STOPS.platformHeight;
    let i = 0;
    stops.forEach((st, si) => {
      for (let k = 0; k < st.waiting; k++, i++) {
        const s = st.start + 4 + rnd() * (STOPS.platformLength - 10);
        const off = STOPS.platformEdge + 0.7 + rnd() * 1.6;
        const p = track.at(s, off, _t);
        // facing the track, with a little variety
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -p.h - Math.PI / 2 + (rnd() - 0.5) * 0.8);
        const scale = 0.92 + rnd() * 0.16;
        _s.setScalar(scale);
        const body = new THREE.Matrix4().compose(_p.set(p.x, p.y + top + 0.6 * scale, p.z), _q, _s);
        const head = new THREE.Matrix4().compose(_p.set(p.x, p.y + top + 1.35 * scale, p.z), _q, _s);
        this.matrices.push([body, head]);
        this.bodies.setColorAt(i, _c.set(pick(rnd, COATS)));
        this.heads.setColorAt(i, _c.set(pick(rnd, SKIN)));
        this.index[si].push(i);
      }
    });
    this.reset();
    scene.add(this.bodies, this.heads);
  }

  reset() {
    this.matrices.forEach(([body, head], i) => {
      this.bodies.setMatrixAt(i, body);
      this.heads.setMatrixAt(i, head);
    });
    this.flush();
  }

  board(stop, k) {
    const i = this.index[stop]?.[k];
    if (i === undefined) return;
    this.bodies.setMatrixAt(i, HIDDEN);
    this.heads.setMatrixAt(i, HIDDEN);
    this.flush();
  }

  flush() {
    for (const m of [this.bodies, this.heads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }
}
