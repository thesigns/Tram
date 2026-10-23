import * as THREE from 'three';
import { BRIDGE, CITY, LOOKS } from '../config.js';
import { MeshBuilder, flatMaterial } from '../models/builder.js';
import { mulberry32 } from '../core/utils.js';
import { block, groundLevel, ribbon, strip, tbox, vcyl, wall } from './frame.js';

// What the street leaves out (GDD §8): tunnels under the hills and the lifting bridge. Tunnel interiors
// are unlit, so they stay dark whatever the sun does, with glowing lamps; main.js darkens the fog and the
// cab inside (darkness). The bridge leaves, barriers, warning lights and the passing boat follow the
// simulation (the Bridge in js/core/street.js).

const dark = new THREE.MeshBasicMaterial({ vertexColors: true });
const glow = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
const redOn = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
const redOff = new THREE.MeshBasicMaterial({ color: 0x3a1210 });
for (const m of [dark, glow, redOn, redOff]) m.userData.shared = true;

const TUN = { wall: '#2b2c2e', ceiling: '#1f2022', floor: '#1d1d1e', bed: '#292725', rail: '#5a5e61', wire: '#0e0e0e', ledge: '#353638' };
const STONE = '#857c70', STONE_DARK = '#655e55', ROCK = '#7b7468', GRASS = '#6d8250', BRICK = '#8c4a3a', SLATE = '#4f545c';
const STEEL = '#56636e', WHITE = '#e8e4da', RED = '#c8382c', DARK = '#2a2a2a';
const DOWN = { x: 0, y: -1, z: 0 };
const _t = {};

// ---------- tunnels ----------

function tunnel(group, track, look, t, rnd) {
  const T = CITY.tunnel, H = T.height, C = 1.8, a = t.from, e = t.to, g = CITY.gauge / 2;
  const inner = new MeshBuilder(), lamps = new MeshBuilder(), outer = new MeshBuilder();
  ribbon(inner, track, a, e, -T.half, T.half, 0.002, TUN.floor);
  ribbon(inner, track, a, e, -1.25, 1.25, 0.004, TUN.bed);
  for (const r of [-g, g]) ribbon(inner, track, a, e, r - 0.035, r + 0.035, 0.012, TUN.rail);
  ribbon(inner, track, a, e, -0.03, 0.03, 5.6, TUN.wire, DOWN);
  for (const side of [-1, 1]) {
    wall(inner, track, a, e, side * T.half, 0, T.wall, TUN.wall, -side);
    strip(inner, track, a, e, side * T.half, T.wall, side * C, H, TUN.ceiling, -side, -1);
    // a walkway ledge along the walls
    const [o0, o1] = side > 0 ? [T.half - 0.7, T.half] : [-T.half, -T.half + 0.7];
    ribbon(inner, track, a, e, o0, o1, 0.8, TUN.ledge);
    wall(inner, track, a, e, side * (T.half - 0.7), 0, 0.8, TUN.ledge, -side);
  }
  ribbon(inner, track, a, e, -C, C, H, TUN.ceiling, DOWN);
  // lamps on alternating walls – they also give a sense of speed
  for (let s = a + 6, i = 0; s < e - 2; s += T.lamps, i++) {
    tbox(lamps, track, s, (i % 2 ? 1 : -1) * (T.half - 0.08), 3.9, 0.12, 0.35, 2.2, '#ffffff');
  }

  // the hill above, and a stone portal at each end
  const yAt = (s) => track.at(s, 0, _t).y;
  let top = -Infinity;
  for (let s = a; s <= e; s += 5) top = Math.max(top, yAt(s));
  top += H + 4;
  // the hill stands a little clear of the tunnel lining (no z-fighting); the portals cover the gap
  const P = T.half + 0.3, M = 64, colors = [ROCK, ROCK, GRASS, ROCK, ROCK, ROCK];
  for (let s = a; s < e; s += 8) {
    const t1 = Math.min(e, s + 8), mid = (s + t1) / 2;
    const k = Math.abs(track.at(mid, 0, _t).k), dir = Math.sign(track.at(mid, 0, _t).k);
    const rel = top + 8 * Math.sin((Math.PI * (mid - a)) / (e - a)) - yAt(mid);
    for (const side of [-1, 1]) {
      // longer boxes on the outside of a curve, so the hill has no gaps
      const len = (t1 - s) * (side === -dir ? 1 + (P + M) * k : 1) + 0.4;
      block(outer, track, look.base, mid, side * (P + M / 2), rel, M, len, colors);
    }
    tbox(outer, track, mid, 0, (H + 0.3 + rel) / 2, 2 * P, rel - H - 0.3, t1 - s + 0.4, colors);
    // a few trees on top
    for (let i = 0; i < 3; i++) {
      const o = (rnd() * 2 - 1) * (P + M - 4), p = track.at(mid + (rnd() - 0.5) * 6, o, _t);
      const y = top + 8 * Math.sin((Math.PI * (mid - a)) / (e - a));
      outer.add(new THREE.IcosahedronGeometry(1.8 + rnd(), 0), '#55703f', [p.x, y + 2, p.z], [rnd(), rnd() * 6, 0], [1, 1.3, 1]);
    }
  }
  for (const [s, dir] of [[a, -1], [e, 1]]) {
    const rel = top - yAt(s) + 0.5;
    const O = T.half;   // the opening
    for (const side of [-1, 1]) block(outer, track, look.base, s, side * (O + (P + M - O) / 2), rel, P + M - O, 1.4, STONE);
    tbox(outer, track, s, 0, (H + rel) / 2, 2 * O, rel - H, 1.4, STONE);
    // a darker arch ring around the opening
    tbox(outer, track, s + dir * 0.75, 0, H + 0.3, 2 * O + 0.8, 0.6, 0.2, STONE_DARK);
    for (const side of [-1, 1]) tbox(outer, track, s + dir * 0.75, side * (O + 0.2), H / 2, 0.4, H, 0.2, STONE_DARK);
  }
  group.add(new THREE.Mesh(inner.build(), dark), new THREE.Mesh(lamps.build(), glow), new THREE.Mesh(outer.build(), flatMaterial));
}

// ---------- the lifting bridge ----------

// One bascule leaf in its own frame: the pivot at the origin, the leaf along −Z (dir −1) or +Z (dir +1).
function leafGeometry(look, len, dir) {
  const b = new MeshBuilder(), R = look.roadHalf, F = look.facade, z = (dir * len) / 2, g = CITY.gauge / 2;
  b.box(2 * F, 0.9, len, STEEL, [0, -0.47, z]);
  b.box(2 * R, 0.02, len, look.road, [0, -0.01, z]);
  b.box(2.5, 0.02, len, look.trackbed, [0, 0.005, z]);
  for (const r of [-g, g]) b.box(0.07, 0.03, len, '#b4b9bd', [r, 0.015, z]);
  for (const side of [-1, 1]) {
    b.box(F - R, 0.17, len, look.sidewalk, [(side * (R + F)) / 2, 0.065, z]);
    b.box(0.08, 0.08, len, WHITE, [side * (F - 0.15), 1.1, z]);
    for (let k = 0.75; k < len; k += 1.5) b.box(0.06, 1.1, 0.06, WHITE, [side * (F - 0.15), 0.6, dir * k]);
    // a catenary mast at the tip: the wire lifts with the leaf
    b.box(0.16, 6.4, 0.16, '#4d5650', [side * (R + 0.5), 3.2, dir * (len - 0.5)]);
  }
  b.box(2 * R + 1, 0.05, 0.05, DARK, [0, 6.4, dir * (len - 0.5)]);
  b.box(0.06, 0.03, len, DARK, [0, 5.6, z]);
  return b.build();
}

// A sailing ship with a tall mast – the reason the bridge lifts. Bow along −Z.
function boatGeometry() {
  const b = new MeshBuilder();
  b.box(4.6, 1.8, 13, '#2f4a5d', [0, 0.5, 0.5]);
  b.box(4.62, 0.3, 13.02, '#f2ead3', [0, 1.3, 0.5]);
  b.add(new THREE.CylinderGeometry(2.66, 2.66, 1.8, 3), '#2f4a5d', [0, 0.5, -6], [0, Math.PI, 0], [1, 1, 1.4]);
  b.box(2.6, 1.2, 4, '#c9b48a', [0, 2, 2.5]);
  b.add(new THREE.CylinderGeometry(0.12, 0.18, 19, 6), '#6b5a44', [0, 10.5, -1]);
  b.add(new THREE.CylinderGeometry(0.1, 0.12, 13, 6), '#6b5a44', [0, 7.5, 4.5]);
  b.add(new THREE.CylinderGeometry(0.35, 0.35, 6, 6).rotateX(Math.PI / 2), '#efe8d6', [0, 3.2, 1.8]);
  b.box(0.05, 0.6, 1, RED, [0, 19.6, -0.4]);
  return b.build();
}

class BridgeView {
  constructor(group, track, look, def, sea) {
    const R = look.roadHalf, F = look.facade, half = def.length / 2;
    const s0 = def.s, s1 = def.s + def.length;
    const b = new MeshBuilder();
    // abutments – the channel walls – and the bridge keeper's towers beside the leaves
    for (const [s, dir] of [[s0, -1], [s1, 1]]) {
      block(b, track, look.base, s + dir * 2, 0, -0.03, 120, 4, STONE);
      for (const side of [-1, 1]) {
        block(b, track, look.base, s + dir * 3.5, side * (F + 1.5), 9, 5, 5, BRICK);
        tbox(b, track, s + dir * 3.5, side * (F + 1.5), 6, 5.1, 1.2, 5.1, STONE);
        vcyl(b, track, s + dir * 3.5, side * (F + 1.5), 10.5, 0, 4, 3, 4, SLATE, Math.PI / 4);
      }
    }
    // barrier posts with their warning lights, at both ends
    this.arms = [];
    this.lamps = [];
    const armLen = R - 0.3 - 1.6;
    for (const [sb, facing] of [[s0 - 6, 0], [s1 + 6, Math.PI]]) {
      for (const side of [-1, 1]) {
        const o = side * (R - 0.3);
        tbox(b, track, sb, o, 0.75, 0.22, 1.5, 0.22, WHITE);
        tbox(b, track, sb, o, 1.75, 0.55, 0.32, 0.14, DARK);
        const p = track.at(sb, o, {});
        const arm = new MeshBuilder();
        for (let i = 0; i < 4; i++) arm.box(armLen / 4, 0.1, 0.08, i % 2 ? WHITE : RED, [-side * (armLen / 4) * (i + 0.5), 0, 0]);
        const pivot = new THREE.Group();
        pivot.position.set(p.x, p.y + 1.1, p.z);
        pivot.rotation.order = 'YXZ';
        pivot.rotation.y = -p.h;
        pivot.add(new THREE.Mesh(arm.build(), flatMaterial));
        group.add(pivot);
        this.arms.push({ pivot, side });
        for (const dx of [-0.16, 0.16]) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), redOff);
          const q = track.at(sb, o + dx, {});
          const toward = facing ? -1 : 1;   // in front of the housing, towards the traffic it faces
          lamp.position.set(q.x - Math.sin(q.h) * 0.08 * toward, q.y + 1.75, q.z + Math.cos(q.h) * 0.08 * toward);
          lamp.rotation.y = -q.h + facing;
          group.add(lamp);
          this.lamps.push(lamp);
        }
      }
    }
    group.add(new THREE.Mesh(b.build(), flatMaterial));

    // the leaves turn about the abutment edges
    this.leaves = [[s0, -1], [s1, 1]].map(([s, dir]) => {
      const p = track.at(s, 0, {});
      const pivot = new THREE.Group();
      pivot.position.set(p.x, p.y, p.z);
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = -p.h;
      pivot.add(new THREE.Mesh(leafGeometry(look, half, dir), flatMaterial));
      group.add(pivot);
      return pivot;
    });

    // the boat passes along the channel, from the harbour side (left)
    this.boat = new THREE.Mesh(boatGeometry(), flatMaterial);
    this.boat.visible = false;
    group.add(this.boat);
    this.track = track;
    this.mid = (s0 + s1) / 2;
    this.sea = sea;
  }

  update(br, time) {
    const a = THREE.MathUtils.degToRad(br.lift * BRIDGE.angle);
    this.leaves[0].rotation.x = a;
    this.leaves[1].rotation.x = -a;
    for (const { pivot, side } of this.arms) pivot.rotation.z = -side * Math.PI * 0.46 * (1 - br.barriers);
    // the warning lights blink alternately from the warning until the barriers are up again
    const phase = Math.floor(time / 0.5) % 2, on = br.state !== 'down';
    this.lamps.forEach((m, i) => { m.material = on && i % 2 === phase ? redOn : redOff; });
    this.boat.visible = br.boat !== null;
    if (br.boat !== null) {
      const p = this.track.at(this.mid, -70 + 140 * br.boat, _t);
      this.boat.position.set(p.x, this.sea, p.z);
      this.boat.rotation.y = -p.h - Math.PI / 2;
    }
  }
}

export function createStructures(track, route) {
  const look = { ...LOOKS[route.look ?? 'modern'], base: groundLevel(track, route) };
  const group = new THREE.Group();
  const tunnels = route.tunnels ?? [];
  const rnd = mulberry32((route.seed ?? 1) * 7 + 3);
  for (const t of tunnels) tunnel(group, track, look, t, rnd);
  const bridge = route.bridge ? new BridgeView(group, track, look, route.bridge, route.sea ?? look.base) : null;
  const fade = CITY.tunnel.fade;
  return {
    group,
    update(street, time) {
      if (bridge && street.bridge) bridge.update(street.bridge, time);
    },
    // Does a tunnel hide something at s from a driver at from? (A portal ahead, or the far end of a
    // curving tunnel – the exit is in sight only near it.)
    hides(from, s) {
      return tunnels.some((t) => (from < t.from && s > t.from) || (from < t.to - 60 && s > t.to));
    },
    // How far into a tunnel s is: 0 outside … 1 inside (it starts a few meters before the portal).
    darkness(s) {
      let d = 0;
      for (const t of tunnels) d = Math.max(d, Math.min((s - t.from + 6) / fade, (t.to - s + 6) / fade, 1));
      return d;
    },
  };
}
