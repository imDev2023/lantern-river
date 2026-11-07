// The scene: a festival-night canal streamed in chunks as the boat moves. The models are
// still simple shapes until the art pass; the light is the concept video's: glowing
// lanterns and windows, a mirror of them on the water, haze, stars and fireworks.
// It only reads the run's state and the world; nothing here may write to either
// (main.ts checks that under ?debug).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CHUNK, LIGHT_MAX, POST_R, UM, hash32, rng, type Chunk, type RunState, type World } from '../sim/index.ts';
import { bake } from './bake.ts';
import { FIREWORK_LAYER, createEmbers, createFireworks, createSky } from './fx.ts';
import { frameAt, place } from './path.ts';
import { createWater } from './water.ts';

const M = UM;
const AHEAD = 5; // chunks kept ahead of the boat
const BEHIND = 1;

// Measured from the concept video (SPEC.md, Look); glows are scaled above 1 so they bloom.
const C = {
  haze: 0x132a45,
  boatLit: 0xe59352,
  flame: 0xf7eec0,
  gateGlow: 0xfbf9e8,
  postWood: 0x5a3315,
  festoon: 0xfbcd74,
  shrineWood: 0xbb5325,
  shrineLantern: 0xfbe48f,
  stone: 0x4a3828,
  wallStone: 0x52443a,
  plaster: [0xa49680, 0x9c8a76, 0x8e8a86],
  timber: 0x2d2217,
  roof: 0x3a2a24,
  lily: 0x56541e,
};

export interface View {
  /** Draw the run as of `alpha` of the way from the previous tick's boat to this tick's. */
  draw(st: RunState, prev: { s: number; x: number }, alpha: number, dt: number): void;
  /** Visual reactions to the rules' events. */
  react(events: RunState['events']): void;
  resize(): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  reset(world: World): void;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,236,190,0.5)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A material that glows: its colour is pushed above 1 so the bloom picks it up. */
function glow(hex: number, strength: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: hex });
  m.color.multiplyScalar(strength);
  return m;
}

/**
 * A surface through rings of `outline` scaled and raised by each [scale, y] in `rings`,
 * outline points given as (x, -z); `cap` closes the last ring as a floor.
 */
function loft(outline: THREE.Vector2[], rings: Array<[number, number]>, cap: boolean): THREE.BufferGeometry {
  const n = outline.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [scale, y] of rings) for (const p of outline) pos.push(p.x * scale, y, p.y * scale);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  }
  if (cap) {
    const [scale, y] = rings[rings.length - 1]!;
    const centre = pos.length / 3;
    pos.push(0, y, (outline.reduce((sum, p) => sum + p.y, 0) / n) * scale);
    const base = (rings.length - 1) * n;
    for (let i = 0; i < n; i++) idx.push(centre, base + i, base + ((i + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createView(canvas: HTMLCanvasElement, initial: World): View {
  let world = initial;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Several passes render each frame; count draw calls for the whole frame, not the last pass.
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.haze, 16, 85);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);

  // Moonlight from the sky and a cool key from above; warm light comes from flames only.
  scene.add(new THREE.HemisphereLight(0x5f84b8, 0x14201c, 1.5));
  const moon = new THREE.DirectionalLight(0xa9c2ff, 1.2);
  moon.position.set(-6, 14, 8);
  scene.add(moon);

  const sky = createSky();
  scene.add(sky);
  const fireworks = createFireworks();
  scene.add(fireworks.group);
  const embers = createEmbers();
  scene.add(embers.points);
  const water = createWater();
  scene.add(water.mesh);
  camera.layers.enable(FIREWORK_LAYER);
  water.hideLayer(camera, FIREWORK_LAYER);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.3, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const halo = glowTexture();
  const haloMat = new THREE.SpriteMaterial({ map: halo, color: C.festoon, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: C.wallStone, roughness: 0.9 }),
    walk: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.95 }),
    plaster: C.plaster.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
    timber: new THREE.MeshStandardMaterial({ color: C.timber, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: C.roof, roughness: 0.85, flatShading: true }),
    window: glow(0xffb35c, 1.6),
    rock: new THREE.MeshStandardMaterial({ color: 0x6b6446, roughness: 1, flatShading: true }),
    post: new THREE.MeshStandardMaterial({ color: C.postWood, roughness: 0.8 }),
    lantern: glow(C.gateGlow, 4),
    shrine: new THREE.MeshStandardMaterial({ color: C.shrineWood, roughness: 0.7 }),
    shrineLantern: glow(C.shrineLantern, 3.5),
    lily: new THREE.MeshStandardMaterial({ color: C.lily, roughness: 0.8 }),
    gust: new THREE.MeshBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.35, depthWrite: false }),
    festoon: glow(0xff7a35, 1.7),
    festoonAmber: glow(0xffc46a, 1.5),
    lamp: glow(0xffd08a, 2.4),
    bridge: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.95 }),
  };
  const geo = {
    rock: new THREE.IcosahedronGeometry(1, 1),
    unit: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 10, 6),
    pad: new THREE.CircleGeometry(1, 10),
    // A gable: a triangular prism with its ridge along Z, base at y=0, 1 wide and 1 tall.
    gable: (() => {
      const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    })(),
  };

  // The boat: an open wooden hull, a post at the bow and its flame, with a warm light.
  const boat = new THREE.Group();
  const outline = new THREE.Shape();
  outline.moveTo(0, -0.95);
  outline.quadraticCurveTo(0.42, -0.45, 0.4, 0.45);
  outline.lineTo(0.3, 0.75);
  outline.lineTo(-0.3, 0.75);
  outline.lineTo(-0.4, 0.45);
  outline.quadraticCurveTo(-0.42, -0.45, 0, -0.95);
  const ring = outline.getSpacedPoints(48).slice(0, -1);
  boat.add(new THREE.Mesh(loft(ring, [[0.5, -0.1], [0.92, 0.16], [1, 0.26], [0.88, 0.26], [0.82, 0.1]], true),
    new THREE.MeshStandardMaterial({ color: C.boatLit, roughness: 0.6, side: THREE.DoubleSide })));
  const seat = new THREE.Mesh(geo.unit, mats.post);
  seat.scale.set(0.62, 0.05, 0.16);
  seat.position.set(0, 0.17, 0.05);
  boat.add(seat);
  const post = new THREE.Mesh(geo.unit, mats.post);
  post.scale.set(0.06, 0.5, 0.06);
  post.position.set(0, 0.36, -0.62);
  boat.add(post);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), glow(C.flame, 5));
  flame.position.set(0, 0.76, -0.62);
  boat.add(flame);
  const flameHalo = new THREE.Sprite(haloMat);
  flameHalo.position.copy(flame.position);
  boat.add(flameHalo);
  const boatLight = new THREE.PointLight(0xffb36b, 6, 10, 1.6);
  boatLight.position.set(0, 1.0, -0.4);
  boat.add(boatLight);
  scene.add(boat);

  // A fixed pool of shrine lights moved to the nearest shrines: changing the number of
  // lights in a scene makes Three.js recompile every material, which stutters on phones.
  const shrineLights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xffcf7a, 0, 10, 1.6);
    scene.add(l);
    return l;
  });
  function nearShrines(s: number): Array<{ s: number; x: number; side: number }> {
    const k = Math.floor(s / (CHUNK / M));
    const near: Array<{ s: number; x: number; side: number }> = [];
    for (let kk = Math.max(0, k - 1); kk <= k + 3; kk++) {
      for (const sh of world.chunk(kk).shrines) if (sh.s / M > s - 8) near.push({ s: sh.s / M, x: sh.x / M, side: sh.side });
    }
    return near.sort((a, b) => a.s - b.s).slice(0, shrineLights.length);
  }

  const chunks = new Map<number, THREE.Group>();
  const gusts: THREE.Mesh[] = [];

  /** A strip of quads along s from s0 to s1, between two offsets, at heights y0 and y1. */
  function strip(s0: number, s1: number, x0: (s: number) => number, x1: (s: number) => number, y0: number, y1: number): THREE.BufferGeometry {
    const steps = Math.max(2, Math.ceil(s1 - s0));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const [ax, az] = place(s, x0(s));
      const [bx, bz] = place(s, x1(s));
      pos.push(ax, y0, az, bx, y1, bz);
      uv.push(s, 0, s, 1);
      if (i > 0) {
        const a = 2 * (i - 1);
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function put(obj: THREE.Object3D, s: number, x: number, y: number): THREE.Object3D {
    const [wx, wz] = place(s, x);
    obj.position.set(wx, y, wz);
    obj.rotation.y = frameAt(s).yaw;
    return obj;
  }

  function box(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(geo.unit, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    return m;
  }

  /** A lantern: a glowing body `size` across at (x, y, z) in its parent; the bloom draws its glow. */
  function lantern(parent: THREE.Object3D, mat: THREE.Material, size: number, x: number, y: number, z: number): void {
    const l = new THREE.Mesh(geo.ball, mat);
    l.scale.set(size, size * 1.15, size);
    l.position.set(x, y, z);
    parent.add(l);
  }

  function buildChunk(c: Chunk): THREE.Group {
    const g = new THREE.Group();
    const s0 = c.s0 / M;
    const s1 = s0 + CHUNK / M;
    const hw = (s: number) => world.halfWidth(Math.round(s * M)) / M;
    const atSea = c.k > world.lastChunk;
    // Visual detail is seeded by the chunk so it never changes between visits.
    const next = rng(hash32(world.seed, c.k, 0x51ce));
    const rand = () => next() / 4294967296;
    if (!atSea) {
      for (const side of [-1, 1] as const) {
        const edge = (s: number) => side * hw(s);
        const back = (s: number) => side * (hw(s) + 16);
        // The wall faces the river: its winding flips with the side, or it would be culled.
        g.add(new THREE.Mesh(side > 0 ? strip(s0, s1, edge, edge, -0.3, 1.3) : strip(s0, s1, edge, edge, 1.3, -0.3), mats.wall));
        g.add(new THREE.Mesh(strip(s0, s1, side < 0 ? back : edge, side < 0 ? edge : back, 1.3, 1.3), mats.walk));
        // Houses along the walkway: plaster or timber, a gable roof, lit windows on two or three floors.
        for (let s = s0 + rand() * 3; s < s1; s += 4.6 + rand() * 2.2) {
          const w = 3.8 + rand() * 1.8;
          const floors = 2 + Math.floor(rand() * 2);
          const h = 1.0 + floors * 2.4;
          const d = 5;
          const house = new THREE.Group();
          const plaster = mats.plaster[Math.floor(rand() * mats.plaster.length)]!;
          house.add(box(plaster, d, h, w, 0, 1.3 + h / 2, 0));
          // Timber beams on the river face, and a band between floors.
          const face = -side * (d / 2 + 0.03);
          for (let f = 1; f <= floors; f++) house.add(box(mats.timber, 0.08, 0.18, w + 0.02, face, 1.3 + f * 2.4, 0));
          for (const z of [-w / 2 + 0.1, w / 2 - 0.1]) house.add(box(mats.timber, 0.08, h, 0.2, face, 1.3 + h / 2, z));
          const roof = new THREE.Mesh(geo.gable, mats.roof);
          roof.scale.set(d + 0.7, 1.6 + rand() * 0.9, w + 0.35);
          roof.position.y = 1.3 + h;
          house.add(roof);
          for (let f = 0; f < floors; f++) {
            for (const z of [-w / 4, w / 4]) {
              if (rand() < 0.35) continue;
              house.add(box(mats.window, 0.06, 1.0, 0.65, face, 2.6 + f * 2.4, z + (rand() - 0.5) * 0.4));
            }
          }
          g.add(put(house, s, side * (hw(s) + 2.2 + d / 2), 0));
        }
        // Street lamps on the walkway, every so often.
        if (rand() < 0.6) {
          const s = s0 + 4 + rand() * (s1 - s0 - 8);
          const lamp = new THREE.Group();
          lamp.add(box(mats.timber, 0.1, 2.6, 0.1, 0, 1.3 + 1.3, 0));
          lantern(lamp, mats.lamp, 0.16, 0, 4.0, 0);
          g.add(put(lamp, s, side * (hw(s) + 0.5), 0));
        }
        // Lily pads near the walls.
        for (let i = 0; i < 5; i++) {
          if (rand() < 0.4) continue;
          const s = s0 + rand() * (s1 - s0);
          const pad = new THREE.Mesh(geo.pad, mats.lily);
          pad.rotation.x = -Math.PI / 2;
          pad.scale.setScalar(0.22 + rand() * 0.2);
          const [wx, wz] = place(s, side * (hw(s) - 0.35 - rand() * 0.7));
          pad.position.set(wx, 0.02, wz);
          g.add(pad);
        }
      }
      // A festoon of lanterns across the canal on every other chunk, and a bridge every third.
      if (c.k % 2 === 1) {
        const s = s0 + 7;
        let n = 0;
        for (let x = -hw(s) - 1; x <= hw(s) + 1; x += 0.85) {
          const sag = 1 - (x / (hw(s) + 1)) ** 2;
          const l = new THREE.Group();
          lantern(l, n++ % 3 === 1 ? mats.festoonAmber : mats.festoon, 0.17, 0, 0, 0);
          g.add(put(l, s, x, 9.2 - 1.0 * sag));
        }
      }
      if (c.k % 3 === 2) {
        const s = s0 + 3;
        // A stone arch from wall to wall, its springing on the walkways, clear of the water.
        const half = hw(s) + 0.2;
        const span = 2 * half + 3;
        const face = new THREE.Shape();
        face.moveTo(-span / 2, 1.3);
        face.lineTo(-half, 1.3);
        face.absarc(0, 1.3, half, Math.PI, 0, true);
        face.lineTo(span / 2, 1.3);
        face.lineTo(span / 2, 1.3 + half + 0.9);
        face.lineTo(-span / 2, 1.3 + half + 0.9);
        face.closePath();
        const arch = new THREE.ExtrudeGeometry(face, { depth: 2.4, bevelEnabled: false, curveSegments: 20 });
        arch.translate(0, 0, -1.2);
        const bridge = new THREE.Mesh(arch, mats.bridge);
        g.add(put(bridge, s, 0, 0));
        for (const z of [-1.1, 1.1]) g.add(put(box(mats.bridge, span, 0.45, 0.22, 0, 1.3 + half + 1.12, z), s, 0, 0));
      }
    }

    for (const r of c.rocks) {
      const rock = new THREE.Mesh(geo.rock, mats.rock);
      const rad = r.r / M;
      rock.scale.set(rad, rad * 0.7, rad);
      rock.rotation.y = (r.id % 7) * 0.9;
      const [wx, wz] = place(r.s / M, r.x / M);
      rock.position.set(wx, rad * 0.15, wz);
      g.add(rock);
    }
    for (const gate of c.gates) {
      const off = (gate.gap / 2 + POST_R) / M;
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        p.add(box(mats.post, (2 * POST_R) / M, 1.3, (2 * POST_R) / M, 0, 0.65, 0));
        p.add(box(mats.lantern, 0.32, 0.32, 0.32, 0, 1.45, 0));
        p.add(box(mats.post, 0.5, 0.1, 0.5, 0, 1.67, 0));
        g.add(put(p, gate.s / M, gate.x / M + side * off, 0));
      }
    }
    for (const sh of c.shrines) {
      const s = sh.s / M;
      const p = new THREE.Group();
      p.add(box(mats.walk, 1.6, 1.4, 2.0, 0, 0.7, 0));
      p.add(box(mats.shrine, 0.9, 1.3, 0.9, 0, 2.05, 0));
      const roof = new THREE.Mesh(geo.gable, mats.roof);
      roof.scale.set(1.5, 0.6, 1.5);
      roof.position.y = 2.7;
      p.add(roof);
      for (const dz of [-0.55, 0.55]) lantern(p, mats.shrineLantern, 0.2, -sh.side * 0.55, 2.3, dz);
      // Fully on the walkway: the rules have no shrine to collide with in the water.
      g.add(put(p, s, sh.x / M + sh.side * 0.95, 0));
      // Its aura, where it lends light, is drawn by the water as a ring (water.ts).
    }
    if (c.gust) {
      const gs0 = c.gust.s0 / M;
      const gs1 = c.gust.s1 / M;
      for (let i = 0; i < 9; i++) {
        const s = gs0 + ((gs1 - gs0) * (i + 0.5)) / 9;
        const streak = new THREE.Mesh(geo.unit, mats.gust);
        streak.scale.set(1.6, 0.01, 0.05);
        const x = (rand() - 0.5) * 2 * (hw(s) - 1);
        put(streak, s, x, 0.08);
        streak.userData = { keep: true, s, x, dir: c.gust.dir, phase: rand() * 10 };
        gusts.push(streak);
        g.add(streak);
      }
    }
    bake(g);
    return g;
  }

  function disposeChunk(g: THREE.Group): void {
    const shared = new Set<THREE.BufferGeometry>(Object.values(geo));
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && !shared.has(o.geometry)) o.geometry.dispose();
    });
    for (let i = gusts.length - 1; i >= 0; i--) if (gusts[i]!.parent === g) gusts.splice(i, 1);
    scene.remove(g);
  }

  function stream(s: number): void {
    const k = Math.floor(s / (CHUNK / M));
    for (const [kk, g] of chunks) {
      if (kk < k - BEHIND || kk > k + AHEAD) {
        disposeChunk(g);
        chunks.delete(kk);
      }
    }
    // From one chunk before the start, so the camera never looks past the river's end.
    for (let kk = Math.max(-1, k - BEHIND); kk <= k + AHEAD; kk++) {
      if (!chunks.has(kk)) {
        const g = buildChunk(world.chunk(kk));
        chunks.set(kk, g);
        scene.add(g);
      }
    }
  }

  let time = 0;
  let shake = 0;
  let flash = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const flameWorld = new THREE.Vector3();
  const aheadWorld = new THREE.Vector3();
  let camReady = false;
  // Adaptive resolution: if frames run slow for a while, draw fewer pixels.
  let slowFrames = 0;

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    water.resize(w * pixelRatio, h * pixelRatio);
    camera.aspect = w / h;
    // Portrait gets the video's tall, wide lens; landscape a narrower one with the same width of canal.
    camera.fov = w < h ? 72 : 55;
    camera.updateProjectionMatrix();
  }

  return {
    resize,
    reset(next: World) {
      for (const g of chunks.values()) disposeChunk(g);
      chunks.clear();
      world = next;
      camReady = false;
    },
    react(events) {
      for (const e of events) {
        if (e.type === 'hit') {
          shake = 0.35;
          flash = 1;
        } else if (e.type === 'scrape') shake = Math.max(shake, 0.15);
      }
    },
    draw(st, prev, alpha, dt) {
      time += dt;
      if (dt > 1 / 40) slowFrames += 1;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.5);
        slowFrames = 0;
        resize();
      }
      renderer.info.reset();
      const s = (prev.s + (st.s - prev.s) * alpha) / M;
      const x = (prev.x + (st.x - prev.x) * alpha) / M;
      stream(s);
      const f = frameAt(s);
      const [bx, bz] = place(s, x);
      boat.position.set(bx, Math.sin(time * 2.1) * 0.03, bz);
      boat.rotation.set(Math.sin(time * 1.7) * 0.03, f.yaw - (st.vx / 50_000) * 0.25, -(st.vx / 50_000) * 0.12);
      const light = st.light / LIGHT_MAX;
      const flicker = 1 + Math.sin(time * 23) * 0.04 + Math.sin(time * 37) * 0.03;
      flame.scale.setScalar(Math.max(0.05, 0.5 + light) * flicker);
      flameHalo.scale.setScalar((0.2 + 0.6 * light) * flicker);
      boatLight.intensity = (1 + 9 * light) * flicker + flash * 6;
      boatLight.color.setHex(flash > 0.5 ? 0xff6a3a : 0xffb36b);
      flash = Math.max(0, flash - dt * 3);

      // Shrine lights and the pools of light they and the flame cast on the water.
      const shrines = nearShrines(s);
      const pools: Array<[number, number, number, number]> = [[bx, bz, 0.06 + 0.22 * light * flicker, 0]];
      shrineLights.forEach((l, i) => {
        const sh = shrines[i];
        if (!sh) {
          l.intensity = 0;
          return;
        }
        const [wx, wz] = place(sh.s, sh.x - sh.side * 0.4);
        l.position.set(wx, 2.4, wz);
        l.intensity = 7;
        const [ax, az] = place(sh.s, sh.x);
        pools.push([ax, az, 0.16, world.stage.shrines.aura / M]);
      });

      // Chase camera: low behind the boat, looking down the canal, easing after its sideways moves.
      const behind = place(s - 4.0, x * 0.85);
      const ahead = place(s + 9, x * 0.6);
      const want = new THREE.Vector3(behind[0], 1.9, behind[1]);
      const look = new THREE.Vector3(ahead[0], 0.2, ahead[1]);
      const k = camReady ? 1 - Math.exp(-dt * 6) : 1;
      camPos.lerp(want, k);
      camLook.lerp(look, k);
      camReady = true;
      camera.position.copy(camPos);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.4;
        camera.position.y += (Math.random() - 0.5) * shake * 0.3;
        shake = Math.max(0, shake - dt * 1.5);
      }
      camera.lookAt(camLook);
      sky.position.copy(camera.position);

      for (const g of gusts) {
        const u = g.userData as { s: number; x: number; dir: number; phase: number };
        const drift = ((time * 3 + u.phase) % 4) - 2;
        const [wx, wz] = place(u.s, u.x + u.dir * drift);
        g.position.set(wx, 0.08, wz);
      }
      const far = place(s + 55, 0);
      aheadWorld.set(far[0], 0, far[1]);
      fireworks.update(dt, aheadWorld);
      flame.getWorldPosition(flameWorld);
      embers.update(dt, flameWorld, light);
      water.update(camera, time, pools);
      composer.render(dt);
    },
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio };
    },
  };
}
