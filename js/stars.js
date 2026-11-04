import * as THREE from 'three';
import { rng } from './glsl.js';

// Deep star field: points on shells at different distances (parallax), with a faint
// Milky-Way-like band, temperature-ish colors, and gentle twinkle. Procedural only.
let shared = null;
function build(count) {
  const r = rng(7);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count);
  const band = new THREE.Vector3(0.3, 0.9, 0.3).normalize();
  const tmp = new THREE.Vector3();
  const tints = [[0.65, 0.75, 1.0], [0.85, 0.9, 1.0], [1, 1, 1], [1.0, 0.93, 0.8], [1.0, 0.8, 0.6], [1.0, 0.7, 0.55]];
  for (let i = 0; i < count; i++) {
    let x, y, z;
    for (;;) {
      x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; const l = x * x + y * y + z * z;
      if (l > 1 || l < 1e-4) continue;
      tmp.set(x, y, z).normalize();
      const d = Math.abs(tmp.dot(band)); // distance from the band plane
      if (r() < 0.55 && d > 0.18 * r()) continue; // concentrate ~ half the stars near the band
      break;
    }
    const dist = 260 + Math.pow(r(), 0.6) * 700;
    pos.set([tmp.x * dist, tmp.y * dist, tmp.z * dist], i * 3);
    const t = tints[Math.floor(Math.pow(r(), 1.3) * tints.length)];
    const b = 0.45 + 0.55 * r();
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = 0.6 + Math.pow(r(), 8) * 3.2;
    ph[i] = r() * 6.283;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute float size; attribute float phase;
      uniform float uTime, uPR; varying vec3 vC; varying float vT;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.75 + 0.25*sin(uTime*(0.6+fract(phase*3.1))*1.3 + phase);
        vC = color * tw; vT = tw;
        gl_PointSize = size * uPR * 1.6;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; uniform float uFade;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float a = smoothstep(0.5, 0.0, r); a *= a;
        gl_FragColor = vec4(vC * a * uFade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return { g, m };
}

export function makeStars(count, pixelRatio) {
  if (!shared) shared = build(count);
  shared.m.uniforms.uPR.value = pixelRatio;
  const p = new THREE.Points(shared.g, shared.m);
  p.frustumCulled = false; p.renderOrder = -10;
  return p;
}
export function tickStars(t) { if (shared) shared.m.uniforms.uTime.value = t; }

// A faint nebular backdrop sphere (very low contrast) for depth.
export function makeNebula(tint = new THREE.Color(0.05, 0.06, 0.12), seed = 0) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTint: { value: tint }, uSeed: { value: seed } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vP; uniform vec3 uTint; uniform float uSeed;
      float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){ vec3 p = vP*3.0 + uSeed;
        float n = n3(p)*0.5 + n3(p*2.1)*0.3 + n3(p*4.3)*0.2;
        float bd = dot(vP, normalize(vec3(0.3,0.9,0.3)))/0.28; float band = exp(-bd*bd);
        float v = n*n*n * (0.35 + band);
        gl_FragColor = vec4(uTint * v, 1.0); }`,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), m);
  s.renderOrder = -20; s.frustumCulled = false;
  return s;
}
