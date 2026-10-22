import * as THREE from 'three';
import { WORLD } from '../config.js';

// Gradient sky dome that follows the camera (from Jasta).
export function createSky() {
  const R = 900;
  const geo = new THREE.SphereGeometry(R, 24, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(WORLD.skyTop);
  const horizon = new THREE.Color(WORLD.fogColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / R);
    c.copy(horizon).lerp(top, Math.pow(t, 0.55));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -10;
  return dome;
}
