// The grey-box scene: plain shapes in the concept video's measured colours, streamed in
// chunks as the boat moves. It only reads the run's state and the world; nothing here
// may write to either (main.ts checks that under ?debug).

import * as THREE from 'three';
import { CHUNK, LIGHT_MAX, POST_R, UM, hash32, rng, type Chunk, type RunState, type World } from '../sim/index.ts';
import { frameAt, place } from './path.ts';

const M = UM;
const AHEAD = 5; // chunks kept ahead of the boat
const BEHIND = 1;

// Measured from the concept video (SPEC.md, Look).
const C = {
  skyHigh: 0x132e4b,
  skyLow: 0x43688f,
  water: 0x0c1912,
  boatLit: 0xe59352,
  hull: 0x3a2610,
  flame: 0xf7eec0,
  gateGlow: 0xfbf9e8,
  postWood: 0x5a3315,
  festoon: 0xfbcd74,
  shrineWood: 0xbb5325,
  shrineLantern: 0xfbe48f,
  stone: 0x3e2a1e,
  wallStone: 0x4a3a30,
  plaster: 0x8d8170,
  timber: 0x2d2217,
  lily: 0x56541e,
  moss: 0x58503a,
};

export interface View {
  /** Draw the run as of `alpha` of the way from the previous tick's boat to this tick's. */
  draw(st: RunState, prev: { s: number; x: number }, alpha: number, dt: number): void;
  /** Visual reactions to the rules' events. */
  react(events: RunState['events']): void;
  resize(): void;
  stats(): { calls: number; triangles: number };
  reset(world: World): void;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,236,190,0.55)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    pos.push(0, y, outline.reduce((sum, p) => sum + p.y, 0) / n * scale);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.skyHigh);
  scene.fog = new THREE.Fog(new THREE.Color(C.skyLow).multiplyScalar(0.55), 14, 75);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0x6f93c4, 0x1d2a24, 1.6));
  const moon = new THREE.DirectionalLight(0xa9c2ff, 1.4);
  moon.position.set(-6, 14, 8);
  scene.add(moon);

  const glow = glowTexture();
  const mats = {
    water: new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.12, metalness: 0.1 }),
    wall: new THREE.MeshStandardMaterial({ color: C.wallStone, roughness: 0.9 }),
    walk: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ color: C.plaster, roughness: 0.9 }),
    timber: new THREE.MeshStandardMaterial({ color: C.timber, roughness: 0.9 }),
    window: new THREE.MeshBasicMaterial({ color: C.festoon }),
    rock: new THREE.MeshStandardMaterial({ color: 0x6b6446, roughness: 1, flatShading: true }),
    post: new THREE.MeshStandardMaterial({ color: C.postWood, roughness: 0.8 }),
    lantern: new THREE.MeshBasicMaterial({ color: C.gateGlow }),
    shrine: new THREE.MeshStandardMaterial({ color: C.shrineWood, roughness: 0.7 }),
    shrineLantern: new THREE.MeshBasicMaterial({ color: C.shrineLantern }),
    aura: new THREE.MeshBasicMaterial({ color: C.shrineLantern, transparent: true, opacity: 0.12, depthWrite: false }),
    lily: new THREE.MeshStandardMaterial({ color: C.lily, roughness: 0.8 }),
    gust: new THREE.MeshBasicMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.35, depthWrite: false }),
    festoon: new THREE.MeshBasicMaterial({ color: C.festoon }),
    bridge: new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.95 }),
    sea: new THREE.MeshStandardMaterial({ color: 0x10283a, roughness: 0.2 }),
  };
  const geo = {
    rock: new THREE.IcosahedronGeometry(1, 1),
    unit: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(1, 12, 8),
    disc: new THREE.CircleGeometry(1, 40),
    pad: new THREE.CircleGeometry(1, 10),
  };

  // The boat: a pointed hull, a post at the bow and its flame, with a warm light.
  const boat = new THREE.Group();
  const outline = new THREE.Shape();
  outline.moveTo(0, -0.95);
  outline.quadraticCurveTo(0.42, -0.45, 0.4, 0.45);
  outline.lineTo(0.3, 0.75);
  outline.lineTo(-0.3, 0.75);
  outline.lineTo(-0.4, 0.45);
  outline.quadraticCurveTo(-0.42, -0.45, 0, -0.95);
  const ring = outline.getSpacedPoints(48).slice(0, -1);
  // An open hull: sloped sides from a narrow keel up to the gunwale, then an inner wall
  // down to a floor, so it reads as a boat and not a block.
  const hull = new THREE.Mesh(loft(ring, [
    [0.5, -0.1],
    [0.92, 0.16],
    [1, 0.26],
    [0.88, 0.26],
    [0.82, 0.1],
  ], true), new THREE.MeshStandardMaterial({ color: C.boatLit, roughness: 0.6, side: THREE.DoubleSide }));
  boat.add(hull);
  const seat = new THREE.Mesh(geo.unit, mats.post);
  seat.scale.set(0.62, 0.05, 0.16);
  seat.position.set(0, 0.17, 0.05);
  boat.add(seat);
  const post = new THREE.Mesh(geo.unit, mats.post);
  post.scale.set(0.06, 0.5, 0.06);
  post.position.set(0, 0.36, -0.62);
  boat.add(post);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10), new THREE.MeshBasicMaterial({ color: C.flame }));
  flame.position.set(0, 0.76, -0.62);
  boat.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: C.festoon, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.copy(flame.position);
  boat.add(halo);
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
  function placeShrineLights(s: number): void {
    const k = Math.floor(s / (CHUNK / M));
    const near: Array<{ s: number; x: number; side: number }> = [];
    for (let kk = Math.max(0, k - 1); kk <= k + 3; kk++) {
      for (const sh of world.chunk(kk).shrines) if (sh.s / M > s - 8) near.push({ s: sh.s / M, x: sh.x / M, side: sh.side });
    }
    near.sort((a, b) => a.s - b.s);
    shrineLights.forEach((l, i) => {
      const sh = near[i];
      if (!sh) {
        l.intensity = 0;
        return;
      }
      const [wx, wz] = place(sh.s, sh.x - sh.side * 0.4);
      l.position.set(wx, 2.4, wz);
      l.intensity = 7;
    });
  }

  const chunks = new Map<number, THREE.Group>();
  const gusts: THREE.Mesh[] = [];

  /** A strip of quads along s from s0 to s1, between two offsets, at heights y0 and y1. */
  function strip(s0: number, s1: number, x0: (s: number) => number, x1: (s: number) => number, y0: number, y1: number): THREE.BufferGeometry {
    const steps = Math.max(2, Math.ceil((s1 - s0) / 1));
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = s0 + ((s1 - s0) * i) / steps;
      const [ax, az] = place(s, x0(s));
      const [bx, bz] = place(s, x1(s));
      pos.push(ax, y0, az, bx, y1, bz);
      if (i > 0) {
        const a = 2 * (i - 1);
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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

  function buildChunk(c: Chunk): THREE.Group {
    const g = new THREE.Group();
    const s0 = c.s0 / M;
    const s1 = s0 + CHUNK / M;
    const hw = (s: number) => world.halfWidth(Math.round(s * M)) / M;
    const atSea = c.k > world.lastChunk;
    const water = new THREE.Mesh(strip(s0, s1 + 0.05, (s) => -hw(s) - 0.3, (s) => hw(s) + 0.3, 0, 0), atSea ? mats.sea : mats.water);
    water.geometry.computeVertexNormals();
    g.add(water);
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
        // Houses along the walkway, each a plaster block with a dark roof and lit windows.
        for (let s = s0 + rand() * 3; s < s1; s += 4.5 + rand() * 2.5) {
          const w = 3.8 + rand() * 2;
          const h = 5 + rand() * 4;
          const d = 5;
          const x = side * (hw(s) + 2.2 + d / 2);
          const house = new THREE.Group();
          const body = new THREE.Mesh(geo.unit, rand() < 0.5 ? mats.plaster : mats.timber);
          body.scale.set(d, h, w);
          body.position.y = 1.3 + h / 2;
          house.add(body);
          const roof = new THREE.Mesh(geo.unit, mats.timber);
          roof.scale.set(d + 0.6, 0.5, w + 0.3);
          roof.position.y = 1.3 + h + 0.25;
          house.add(roof);
          for (let f = 0; f < 3; f++) {
            if (rand() < 0.45) continue;
            const win = new THREE.Mesh(geo.unit, mats.window);
            win.scale.set(0.05, 0.9, 0.6);
            win.position.set(-side * (d / 2 + 0.03), 2.8 + f * 2.1, (rand() - 0.5) * (w - 1.2));
            house.add(win);
          }
          g.add(put(house, s, x, 0));
        }
        // Lily pads near the walls.
        for (let i = 0; i < 4; i++) {
          if (rand() < 0.4) continue;
          const s = s0 + rand() * (s1 - s0);
          const pad = new THREE.Mesh(geo.pad, mats.lily);
          pad.rotation.x = -Math.PI / 2;
          pad.scale.setScalar(0.25 + rand() * 0.2);
          const [wx, wz] = place(s, side * (hw(s) - 0.4 - rand() * 0.6));
          pad.position.set(wx, 0.02, wz);
          g.add(pad);
        }
      }
      // A festoon of lanterns across the canal, and a bridge every third chunk.
      if (c.k % 2 === 1) {
        const s = s0 + 6;
        for (let x = -hw(s); x <= hw(s); x += 0.9) {
          const l = new THREE.Mesh(geo.ball, mats.festoon);
          l.scale.setScalar(0.16);
          const sag = 1 - (x / hw(s)) ** 2;
          put(l, s, x, 7.2 - 0.9 * sag);
          g.add(l);
        }
      }
      if (c.k % 3 === 2) {
        const s = s0 + 3;
        const span = 2 * hw(s) + 4;
        const deck = new THREE.Mesh(geo.unit, mats.bridge);
        deck.scale.set(span, 0.7, 2.4);
        g.add(put(deck, s, 0, 3.6));
        for (const side of [-1, 1]) {
          const pier = new THREE.Mesh(geo.unit, mats.bridge);
          pier.scale.set(1.2, 2.6, 2.4);
          // On the walkway, clear of the water, since the rules have no pier to hit.
          g.add(put(pier, s, side * (hw(s) + 0.7), 2.0));
        }
      }
    } else {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, CHUNK / M + 0.1), mats.sea);
      sea.rotation.x = -Math.PI / 2;
      put(sea, (s0 + s1) / 2, 0, -0.01);
      g.add(sea);
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
        const wood = new THREE.Mesh(geo.unit, mats.post);
        wood.scale.set((2 * POST_R) / M, 1.3, (2 * POST_R) / M);
        wood.position.y = 0.65;
        p.add(wood);
        const lamp = new THREE.Mesh(geo.unit, mats.lantern);
        lamp.scale.set(0.34, 0.34, 0.34);
        lamp.position.y = 1.45;
        p.add(lamp);
        const cap = new THREE.Mesh(geo.unit, mats.post);
        cap.scale.set(0.5, 0.1, 0.5);
        cap.position.y = 1.67;
        p.add(cap);
        const h = new THREE.Sprite(halo.material);
        h.scale.setScalar(1.6);
        h.position.y = 1.45;
        p.add(h);
        g.add(put(p, gate.s / M, gate.x / M + side * off, 0));
      }
    }
    for (const sh of c.shrines) {
      const s = sh.s / M;
      const p = new THREE.Group();
      const base = new THREE.Mesh(geo.unit, mats.walk);
      base.scale.set(1.6, 1.4, 2.0);
      base.position.y = 0.7;
      p.add(base);
      const body = new THREE.Mesh(geo.unit, mats.shrine);
      body.scale.set(0.9, 1.3, 0.9);
      body.position.y = 2.05;
      p.add(body);
      const roof = new THREE.Mesh(geo.unit, mats.timber);
      roof.scale.set(1.4, 0.18, 1.4);
      roof.position.y = 2.8;
      p.add(roof);
      for (const dz of [-0.55, 0.55]) {
        const l = new THREE.Mesh(geo.ball, mats.shrineLantern);
        l.scale.setScalar(0.2);
        l.position.set(-sh.side * 0.55, 2.3, dz);
        p.add(l);
      }
      const h = new THREE.Sprite(halo.material);
      h.scale.setScalar(3.2);
      h.position.y = 2.2;
      p.add(h);
      // Fully on the walkway: the rules have no shrine to collide with in the water.
      g.add(put(p, s, sh.x / M + sh.side * 0.95, 0));
      // The aura on the water: where the shrine lends light.
      const aura = new THREE.Mesh(geo.disc, mats.aura);
      aura.rotation.x = -Math.PI / 2;
      aura.scale.setScalar(world.stage.shrines.aura / M);
      const [wx, wz] = place(s, sh.x / M);
      aura.position.set(wx, 0.03, wz);
      g.add(aura);
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
        streak.userData = { s, x, dir: c.gust.dir, phase: rand() * 10 };
        gusts.push(streak);
        g.add(streak);
      }
    }
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
  let camReady = false;

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
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
      const s = (prev.s + (st.s - prev.s) * alpha) / M;
      const x = (prev.x + (st.x - prev.x) * alpha) / M;
      stream(s);
      placeShrineLights(s);
      const f = frameAt(s);
      const [bx, bz] = place(s, x);
      boat.position.set(bx, Math.sin(time * 2.1) * 0.03, bz);
      boat.rotation.set(Math.sin(time * 1.7) * 0.03, f.yaw - (st.vx / 50_000) * 0.25, -(st.vx / 50_000) * 0.12);
      const light = st.light / LIGHT_MAX;
      const flicker = 1 + Math.sin(time * 23) * 0.04 + Math.sin(time * 37) * 0.03;
      flame.scale.setScalar(Math.max(0.05, 0.5 + light) * flicker);
      halo.scale.setScalar((0.6 + 1.8 * light) * flicker);
      boatLight.intensity = (1 + 9 * light) * flicker + flash * 6;
      boatLight.color.setHex(flash > 0.5 ? 0xff6a3a : 0xffb36b);
      flash = Math.max(0, flash - dt * 3);

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

      for (const g of gusts) {
        const u = g.userData as { s: number; x: number; dir: number; phase: number };
        const drift = ((time * 3 + u.phase) % 4) - 2;
        const [wx, wz] = place(u.s, u.x + u.dir * drift);
        g.position.set(wx, 0.08, wz);
      }
      renderer.render(scene, camera);
    },
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
  };
}
