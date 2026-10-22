import * as THREE from 'three';

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

// Builds a low-poly model from primitives into a single geometry with vertex colors (one draw call).
// Per-triangle normals → flat shading. (Carried over from Jasta, plus quads for ribbons along the track.)
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.colors = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  // colors: a single color or an array of colors per geometry group (BoxGeometry: +x,-x,+y,-y,+z,-z)
  add(geometry, colors, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = geo.attributes.position;
    this._m.compose(
      this._v.set(pos[0], pos[1], pos[2]),
      this._q.setFromEuler(this._e.set(rot[0], rot[1], rot[2])),
      this._s.set(scale[0], scale[1], scale[2]),
    );
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: p.count, materialIndex: 0 }];
    const v = new THREE.Vector3();
    for (const g of groups) {
      const col = Array.isArray(colors) ? colors[g.materialIndex % colors.length] : colors;
      this._c.set(col);
      for (let i = g.start; i < g.start + g.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(this._m);
        this.positions.push(v.x, v.y, v.z);
        this.colors.push(this._c.r, this._c.g, this._c.b);
      }
    }
    geometry.dispose();
    if (geo !== geometry) geo.dispose();
    return this;
  }

  box(w, h, d, colors, pos, rot) { return this.add(new THREE.BoxGeometry(w, h, d), colors, pos, rot); }

  // Cylinder along the Z axis.
  cylZ(rTop, rBottom, len, seg, color, pos, rot = [0, 0, 0]) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1);
    g.rotateX(Math.PI / 2);
    return this.add(g, color, pos, rot);
  }

  // Quad a-b-c-d (points as {x, y, z}). `facing` ({x, y, z}) flips the winding so the face points along it.
  quad(a, b, c, d, color, facing) {
    _e1.set(b.x - a.x, b.y - a.y, b.z - a.z);
    _e2.set(c.x - a.x, c.y - a.y, c.z - a.z);
    _e1.cross(_e2);
    const flip = facing && _e1.x * facing.x + _e1.y * facing.y + _e1.z * facing.z < 0;
    const pts = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    this._c.set(color);
    for (const p of pts) {
      this.positions.push(p.x, p.y, p.z);
      this.colors.push(this._c.r, this._c.g, this._c.b);
    }
    return this;
  }

  get empty() { return this.positions.length === 0; }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

export const flatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
