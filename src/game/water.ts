// The canal's water: a real mirror of the scene, rippled and stretched into the long
// light streaks of the concept video, with warm pools of light under the boat's flame
// and the shrines. One plane follows the camera; the walls hide it beyond the banks.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/** Most pools of light the water draws at once: the boat and the nearest shrines. */
export const POOLS = 3;

/** A tileable normal map of soft ripples, drawn once on a canvas. */
function rippleNormals(size = 256): THREE.Texture {
  const h = new Float32Array(size * size);
  const waves: Array<[number, number, number, number]> = [];
  // Integer frequencies keep the pattern seamless when it tiles.
  for (let i = 0; i < 14; i++) waves.push([1 + (i * 7) % 9, 1 + (i * 5) % 11, 0.6 / (1 + i * 0.35), i * 1.7]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [fx, fy, a, ph] of waves) v += a * Math.sin(((fx * x + fy * y * (fx % 2 ? 1 : -1)) / size) * Math.PI * 2 + ph);
      h[y * size + x] = v;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const shader = {
  name: 'CanalWater',
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      tNormal: { value: null },
      time: { value: 0 },
      deep: { value: new THREE.Color(0x0c1912) },
      poolColor: { value: new THREE.Color(0xffa25a) },
      pools: { value: Array.from({ length: POOLS }, () => new THREE.Vector4()) },
    },
  ]),
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vec4 mvPosition = viewMatrix * world;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform float time;
    uniform vec3 deep;
    uniform vec3 poolColor;
    uniform vec4 pools[${POOLS}];
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <fog_pars_fragment>
    void main() {
      vec2 p = vWorld.xz;
      vec3 n1 = texture2D(tNormal, p * 0.09 + vec2(time * 0.011, time * 0.023)).rgb * 2.0 - 1.0;
      vec3 n2 = texture2D(tNormal, p * 0.21 - vec2(time * 0.019, -time * 0.009)).rgb * 2.0 - 1.0;
      vec2 ripple = (n1.xy + n2.xy) * 0.5;
      vec4 uv = vUv;
      uv.xy += ripple * vec2(0.012, 0.03) * uv.w;
      // Average taps along the screen's vertical: lights stretch into streaks, as on real water.
      // Nine taps, jittered by the ripples so no tap shows as a separate copy of a light.
      vec3 refl = vec3(0.0);
      float total = 0.0;
      for (int i = -4; i <= 4; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 8.0);
        float dy = (fi + ripple.y * 0.8) * 0.0075;
        refl += texture2DProj(tDiffuse, uv + vec4(0.0, dy, 0.0, 0.0) * uv.w).rgb * w;
        total += w;
      }
      refl /= total;
      vec3 view = normalize(cameraPosition - vWorld);
      float fresnel = pow(1.0 - clamp(view.y, 0.0, 1.0), 2.0);
      // Looking steeply down, water mostly shows its depth; at a glancing angle it is a mirror.
      vec3 col = deep + refl * (0.07 + 0.5 * fresnel);
      // Warm pools of light under flames, shimmering with the ripples.
      // pools[i] is (x, aura radius, z, intensity); a shrine's aura shows as a soft ring of light.
      for (int i = 0; i < ${POOLS}; i++) {
        vec4 pl = pools[i];
        if (pl.w <= 0.0) continue;
        float d = length(p - pl.xz);
        col += poolColor * pl.w * exp(-d * d / 2.2) * (0.75 + 0.5 * ripple.x);
        if (pl.y > 0.0) {
          float ring = smoothstep(pl.y - 0.7, pl.y - 0.15, d) * smoothstep(pl.y + 0.1, pl.y - 0.15, d);
          col += poolColor * (0.09 * ring + 0.025 * smoothstep(pl.y, 0.0, d)) * (0.8 + 0.4 * ripple.x);
        }
      }
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }
  `,
};

export interface Water {
  readonly mesh: THREE.Mesh;
  /** Move under the camera and animate; `pools` are world [x, z, intensity, aura radius] lights. */
  update(camera: THREE.Camera, time: number, pools: Array<[number, number, number, number]>): void;
  resize(width: number, height: number): void;
  /** Leave a render layer out of the reflection seen from `camera`. */
  hideLayer(camera: THREE.Camera, layer: number): void;
}

export function createWater(): Water {
  const mesh = new Reflector(new THREE.PlaneGeometry(160, 160), {
    shader,
    textureWidth: 512,
    textureHeight: 512,
    clipBias: 0.003,
    multisample: 0,
  });
  mesh.rotation.x = -Math.PI / 2;
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.fog = true;
  mat.uniforms.tNormal!.value = rippleNormals();
  const pools = mat.uniforms.pools!.value as THREE.Vector4[];
  return {
    mesh,
    update(camera, time, lights) {
      mesh.position.set(Math.round(camera.position.x / 8) * 8, 0, Math.round(camera.position.z / 8) * 8);
      mat.uniforms.time!.value = time;
      pools.forEach((v, i) => {
        const l = lights[i];
        if (l) v.set(l[0], l[3], l[1], l[2]);
        else v.set(0, 0, 0, 0);
      });
    },
    hideLayer(camera, layer) {
      // The reflection camera is cloned from the main one on first use; it keeps its own layers.
      mesh.getReflectionCamera(camera).layers.disable(layer);
    },
    resize(width, height) {
      // Half the screen's resolution: the ripples hide the softness and phones keep their frame rate.
      mesh.getRenderTarget().setSize(Math.max(256, Math.round(width / 2)), Math.max(256, Math.round(height / 2)));
    },
  };
}
