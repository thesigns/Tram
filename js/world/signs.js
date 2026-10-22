import * as THREE from 'three';
import { MeshBuilder, flatMaterial } from '../models/builder.js';

const OFFSET = 2.3;     // right of the track centreline
const HEIGHT = 2.6;     // plate centre above the rail top
const RADIUS = 0.4;     // a little larger than real signs, so they read on a phone
const _p = {};

// Speed limit plate: white disc, red ring, black number.
function plateTexture(kmh) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8382c';
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f6f4ee';
  g.beginPath();
  g.arc(64, 64, 47, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#151515';
  g.font = 'bold 58px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(kmh), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Lineside speed limit signs (GDD §11): poles and backs merged into one mesh, one textured plate per sign.
export function createSigns(track, limits) {
  const group = new THREE.Group();
  const b = new MeshBuilder();
  const materials = new Map();
  const plateGeo = new THREE.CircleGeometry(RADIUS, 24);
  for (const sg of limits.signs) {
    const p = track.at(sg.s, OFFSET, _p);
    b.add(new THREE.CylinderGeometry(0.04, 0.04, HEIGHT, 6), '#6b716d', [p.x, p.y + HEIGHT / 2, p.z]);
    // grey back, then the plate facing the oncoming tram (towards lower s)
    b.cylZ(RADIUS + 0.02, RADIUS + 0.02, 0.03, 16, '#8a8f8c', [p.x, p.y + HEIGHT, p.z], [0, -p.h, 0]);
    if (!materials.has(sg.kmh)) materials.set(sg.kmh, new THREE.MeshLambertMaterial({ map: plateTexture(sg.kmh) }));
    const plate = new THREE.Mesh(plateGeo, materials.get(sg.kmh));
    // just in front of the back, towards the tram: −forward = (−sin h, 0, cos h)
    plate.position.set(p.x - Math.sin(p.h) * 0.035, p.y + HEIGHT, p.z + Math.cos(p.h) * 0.035);
    plate.rotation.y = -p.h;
    group.add(plate);
  }
  group.add(new THREE.Mesh(b.build(), flatMaterial));
  return group;
}
