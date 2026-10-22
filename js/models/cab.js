import * as THREE from 'three';
import { MeshBuilder, flatMaterial } from './builder.js';

// Driver's cab of a classic high-floor tram. Driver's eye = (0, 0, 0), forward = −Z.
// Rendered as a separate scene after clearing the depth buffer, so it never clips into the street.
const PAL = {
  desk: '#3f4743',
  deskDark: '#2c322f',
  frame: '#d9cfb4',
  frameDark: '#a89f88',
  rubber: '#1d1f1e',
  dial: '#ece6d4',
  bezel: '#222',
  needle: '#c8382c',
};

const DESK_SLOPE = Math.atan2(0.22, 0.67);   // the desk rises towards the windscreen
const deskY = (z) => -0.36 - 0.328 * (z + 1.0);

function lamp(color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10), new THREE.MeshBasicMaterial({ color }));
  m.userData.on = new THREE.Color(color);
  m.userData.off = new THREE.Color(color).multiplyScalar(0.18);
  return m;
}

export function createCab() {
  const root = new THREE.Group();
  const b = new MeshBuilder();

  // desk under the windscreen and the panel below its rear edge
  b.box(2.6, 0.06, 0.75, PAL.desk, [0, deskY(-0.665) - 0.03, -0.665], [DESK_SLOPE, 0, 0]);
  b.box(2.6, 1.2, 0.05, PAL.deskDark, [0, -1.18, -0.31]);
  b.box(2.6, 0.05, 0.08, PAL.deskDark, [0, deskY(-0.33) - 0.01, -0.33]);

  // windscreen frame: sill, pillars, header
  b.box(2.9, 0.1, 0.12, PAL.frame, [0, -0.36, -1.05]);
  for (const x of [-1.32, -0.66, 0.66, 1.32]) b.box(0.08, 1.12, 0.08, PAL.frame, [x, 0.17, -1.05]);
  b.box(3.0, 0.6, 0.1, PAL.frame, [0, 1.0, -1.05]);
  b.box(3.0, 0.03, 0.04, PAL.rubber, [0, 0.705, -1.03]);
  b.box(2.9, 0.03, 0.04, PAL.rubber, [0, -0.305, -1.03]);
  // resting wiper
  b.box(0.62, 0.015, 0.015, PAL.rubber, [-0.2, -0.27, -1.08], [0, 0, 0.06]);
  root.add(new THREE.Mesh(b.build(), flatMaterial));

  // speedometer, 0–80 km/h over 270°
  const dial = new THREE.Group();
  dial.position.set(-0.22, deskY(-0.78) + 0.04, -0.78);
  dial.lookAt(0, 0, 0);
  dial.scale.setScalar(0.75);
  const d = new MeshBuilder();
  d.add(new THREE.CircleGeometry(0.1, 20), PAL.bezel);
  d.add(new THREE.CircleGeometry(0.088, 20), PAL.dial, [0, 0, 0.002]);
  for (let i = 0; i <= 8; i++) {
    const a = THREE.MathUtils.degToRad(135 - i * 33.75);
    const r = 0.072;
    d.box(0.004, i % 2 ? 0.01 : 0.016, 0.002, PAL.bezel, [-Math.sin(a) * r, Math.cos(a) * r, 0.004], [0, 0, a]);
  }
  dial.add(new THREE.Mesh(d.build(), flatMaterial));
  const needleGeo = new THREE.BoxGeometry(0.006, 0.07, 0.003).translate(0, 0.028, 0.006);
  const needle = new THREE.Mesh(needleGeo, new THREE.MeshBasicMaterial({ color: PAL.needle }));
  dial.add(needle);
  root.add(dial);

  // lamps: doors closed (green), doors open (amber), no traction (red)
  const lamps = { closed: lamp('#4cd964'), open: lamp('#ffb020'), interlock: lamp('#ff3b30') };
  [lamps.closed, lamps.open, lamps.interlock].forEach((m, i) => {
    const z = -0.84;
    m.position.set(-0.04 + i * 0.055, deskY(z) + 0.006, z);
    m.rotation.x = DESK_SLOPE;
    root.add(m);
  });

  root.userData = { needle, lamps };
  return root;
}

export function setLamp(m, on) {
  m.material.color.copy(on ? m.userData.on : m.userData.off);
}

export function setSpeedo(cab, kmh) {
  cab.userData.needle.rotation.z = THREE.MathUtils.degToRad(135 - Math.min(kmh, 80) * (270 / 80));
}
