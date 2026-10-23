import * as THREE from 'three';

// Building blocks in the track frame: s along the track, `off` to the right of it, `y` above the rail top.
// Shared by the city and the landmarks; everything goes into a MeshBuilder.

const UP = { x: 0, y: 1, z: 0 };
const _t = {};

export function pt(track, s, off, y) {
  const p = track.at(s, off, {});
  p.y += y;
  return p;
}

// Horizontal strip between two lateral offsets.
export function ribbon(b, track, s0, s1, offA, offB, y, color, facing = UP, step = 2) {
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
export function wall(b, track, s0, s1, off, y0, y1, color, face, step = 2) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const h = track.at(sa, 0, _t).h;
    b.quad(pt(track, sa, off, y0), pt(track, sb, off, y0), pt(track, sb, off, y1), pt(track, sa, off, y1), color,
      { x: Math.cos(h) * face, y: 0, z: Math.sin(h) * face });
  }
}

// Box: sx across the track, sy up, sz along it; y is its centre.
export function tbox(b, track, s, off, y, sx, sy, sz, color) {
  const p = track.at(s, off, _t);
  b.box(sx, sy, sz, color, [p.x, p.y + y, p.z], [0, -p.h, 0]);
}

// Vertical cylinder (or cone, or pyramid with seg = 4); y is its centre.
export function vcyl(b, track, s, off, y, r0, r1, h, seg, color, turn = 0) {
  const p = track.at(s, off, _t);
  b.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1), color, [p.x, p.y + y, p.z], [0, -p.h + turn, 0]);
}

// Pitched roof: a triangular prism with its ridge along the track; y0 is the eaves height.
export function prism(b, track, s, off, y0, sx, sy, sz, color) {
  const p = track.at(s, off, _t);
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2);   // apex up, axis along z
  b.add(g, color, [p.x, p.y + y0 + sy / 3, p.z], [0, -p.h, 0], [sx / Math.sqrt(3), sy / 1.5, sz]);
}

// Ridge across the track instead (for a facade facing it).
export function prismAcross(b, track, s, off, y0, sx, sy, sz, color) {
  const p = track.at(s, off, _t);
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  b.add(g, color, [p.x, p.y + y0 + sy / 3, p.z], [0, -p.h, 0], [sx, sy / 1.5, sz / Math.sqrt(3)]);
}
