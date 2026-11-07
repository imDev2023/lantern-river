// The festival night: a starry sky with a moon, fireworks over the canal ahead, and embers
// rising from the boat's flame. Visual only; nothing here reads or writes the rules.

import * as THREE from 'three';

/** A sky dome that follows the camera: indigo above, haze at the horizon, stars and a moon. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x04102a) },
      horizon: { value: new THREE.Color(0x1d3b63) },
      moonDir: { value: new THREE.Vector3(-0.35, 0.42, -0.84).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 moonDir;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
        // Stars on a grid of cells, each lit or not by its hash, fading into the haze.
        vec3 q = d * 220.0;
        vec3 cell = floor(q);
        float r = hash(cell);
        float star = step(0.9972, r) * smoothstep(0.42, 0.0, length(fract(q) - 0.5));
        col += star * (0.6 + 1.6 * hash(cell + 3.1)) * smoothstep(0.08, 0.35, h);
        // The moon and its halo, bright enough to bloom.
        float m = dot(d, moonDir);
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9996, m) * 3.0;
        col += vec3(0.45, 0.55, 0.75) * pow(max(m, 0.0), 180.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** The render layer fireworks draw on, left out of the water's reflection. */
export const FIREWORK_LAYER = 1;

const BURST = 90;
const LIFE = 2.6;

export interface Fireworks {
  readonly group: THREE.Group;
  /** Advance; `ahead` is a world point down the canal where new bursts open above. */
  update(dt: number, ahead: THREE.Vector3): void;
}

/** A small pool of bursts, each a set of points flying out from one origin under gravity. */
export function createFireworks(): Fireworks {
  const group = new THREE.Group();
  const palette = [0xff6a8a, 0xffd27a, 0x8ad8ff, 0xc89bff, 0xff9a4a, 0xb8ff9a];
  const bursts = Array.from({ length: 4 }, () => {
    const dirs = new Float32Array(BURST * 3);
    for (let i = 0; i < BURST; i++) {
      // Even directions on a sphere, with a little spread in speed.
      const y = 1 - (2 * (i + 0.5)) / BURST;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      const v = 0.85 + Math.random() * 0.3;
      dirs.set([Math.cos(a) * r * v, y * v, Math.sin(a) * r * v], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST * 3), 3));
    geo.setAttribute('dir', new THREE.BufferAttribute(dirs, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        origin: { value: new THREE.Vector3() },
        t: { value: LIFE },
        radius: { value: 9 },
        color: { value: new THREE.Color() },
        scale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 dir;
        uniform vec3 origin;
        uniform float t;
        uniform float radius;
        uniform float scale;
        varying float vFade;
        void main() {
          float out_ = 1.0 - exp(-t * 3.0);
          vec3 p = origin + dir * radius * out_ + vec3(0.0, -1.6 * t * t, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vFade = clamp(1.0 - t / ${LIFE.toFixed(1)}, 0.0, 1.0);
          gl_PointSize = scale * (3.0 + 7.0 * vFade) * 90.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(color * (0.9 + 1.8 * vFade * vFade) * a * vFade, 1.0);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    // Bursts open almost overhead, so their mirror image would land beside the boat as a blob.
    points.layers.set(FIREWORK_LAYER);
    group.add(points);
    return { points, mat };
  });
  let wait = 0.6;
  return {
    group,
    update(dt, ahead) {
      wait -= dt;
      for (const b of bursts) {
        if (!b.points.visible) continue;
        b.mat.uniforms.t!.value += dt;
        if (b.mat.uniforms.t!.value >= LIFE) b.points.visible = false;
      }
      if (wait > 0) return;
      wait = 0.9 + Math.random() * 1.8;
      const free = bursts.find((b) => !b.points.visible);
      if (!free) return;
      free.mat.uniforms.origin!.value.set(ahead.x + (Math.random() - 0.5) * 30, 26 + Math.random() * 14, ahead.z + (Math.random() - 0.5) * 20);
      free.mat.uniforms.t!.value = 0;
      free.mat.uniforms.radius!.value = 6 + Math.random() * 6;
      free.mat.uniforms.color!.value.setHex(palette[Math.floor(Math.random() * palette.length)]!);
      free.points.visible = true;
    },
  };
}

const EMBERS = 40;

export interface Embers {
  readonly points: THREE.Points;
  /** Advance; embers rise from `source` (the flame), as many as `strength` (0 to 1) allows. */
  update(dt: number, source: THREE.Vector3, strength: number): void;
}

export function createEmbers(): Embers {
  const pos = new Float32Array(EMBERS * 3);
  const life = new Float32Array(EMBERS);
  const vel = new Float32Array(EMBERS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { scale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float life;
      uniform float scale;
      varying float vLife;
      void main() {
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = scale * 5.0 * life * 10.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * 3.0 * a * vLife, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let spawn = 0;
  return {
    points,
    update(dt, source, strength) {
      spawn += dt * 14 * strength;
      for (let i = 0; i < EMBERS; i++) {
        if (life[i]! > 0) {
          life[i] = Math.max(0, life[i]! - dt * 0.7);
          vel[i * 3 + 1] = vel[i * 3 + 1]! + dt * 0.3;
          for (let a = 0; a < 3; a++) pos[i * 3 + a] = pos[i * 3 + a]! + vel[i * 3 + a]! * dt;
        } else if (spawn >= 1) {
          spawn -= 1;
          life[i] = 0.6 + Math.random() * 0.4;
          pos.set([source.x + (Math.random() - 0.5) * 0.1, source.y, source.z + (Math.random() - 0.5) * 0.1], i * 3);
          vel.set([(Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5 + 1.2], i * 3);
        }
      }
      spawn = Math.min(spawn, 1);
      geo.attributes.position!.needsUpdate = true;
      geo.attributes.life!.needsUpdate = true;
    },
  };
}
