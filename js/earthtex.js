import * as THREE from 'three';

// Real Earth imagery shared by every globe (magnetosphere, solar wind, Schumann, UV oval).
// NASA Earth Observatory, public domain (see assets/README.md):
//   day   - Blue Marble Next Generation with topography and bathymetry, September 2004
//   aux R - water mask (from the Blue Marble base map): ocean glint and coastlines
//   aux G - Black Marble 2016 night lights
// Equirectangular, x = 0 at 180° W, top row = 90° N. On a three.js SphereGeometry the default uv
// already matches that (u = 0.5 at +x = 0° longitude, +z = 90° W, v = 1 at +y = north), which is the
// same lon/lat convention the Schumann scene and its land mask use. Until the images arrive, the
// shaders fall back to their procedural surface (uEarthOn = 0).
const base = new URL('../assets/', import.meta.url).href;
let started = false, low = false;
const blank = (rgb) => { const t = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1); t.needsUpdate = true; return t; };
export const EARTH_U = {
  uEarthDay: { value: blank([6, 20, 50]) },
  uEarthAux: { value: blank([255, 0, 0]) },
  uEarthOn: { value: 0 },
};
const state = { day: null, aux: null, loaded: 0, errors: [], anis: 1, ms: 0 };
export function loadEarth(opts = {}) {
  if (started) return EARTH_U; started = true; low = !!opts.low;
  const t0 = performance.now(), L = new THREE.TextureLoader();
  const done = () => { if (state.loaded === 2) { EARTH_U.uEarthOn.value = 1; state.ms = Math.round(performance.now() - t0); } };
  const prep = (t) => { t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = state.anis; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; };
  state.day = (low ? 'earth_day_2048.jpg' : 'earth_day_4096.jpg'); state.aux = 'earth_aux_2048.jpg';
  L.load(base + state.day, (t) => { EARTH_U.uEarthDay.value = prep(t); state.loaded++; done(); }, undefined, (e) => state.errors.push('day: ' + (e && e.message || e)));
  L.load(base + state.aux, (t) => { EARTH_U.uEarthAux.value = prep(t); state.loaded++; done(); }, undefined, (e) => state.errors.push('aux: ' + (e && e.message || e)));
  return EARTH_U;
}
export function setEarthAnisotropy(n) { state.anis = Math.min(8, n || 1); for (const k of ['uEarthDay', 'uEarthAux']) { const t = EARTH_U[k].value; if (t && t.isTexture && !t.isDataTexture) { t.anisotropy = state.anis; t.needsUpdate = true; } } }
export function earthStatus() { return { on: EARTH_U.uEarthOn.value, files: [state.day, state.aux], loaded: state.loaded, ms: state.ms, errors: state.errors, anisotropy: state.anis }; }

// GLSL: sample the real Earth at a sphere uv (u shifted by -spin/2pi when the globe spins under a fixed Sun)
export const EARTH_GLSL = /* glsl */`
  uniform sampler2D uEarthDay, uEarthAux; uniform float uEarthOn;
  vec3 earthDay(vec2 uv){ return texture2D(uEarthDay, uv).rgb; }
  vec2 earthAux(vec2 uv){ return texture2D(uEarthAux, uv).rg; }   // x = water (1 = ocean), y = night lights
  // lit real-Earth color: day side imagery, ocean glint toward the Sun, city lights on the night side
  vec3 earthLit(vec2 uv, vec3 N, vec3 L, vec3 V, float dayAmt, float ambient){
    vec3 day = earthDay(uv); vec2 ax = earthAux(uv);
    float d = dot(N, L);
    float lit = smoothstep(-0.10, 0.30, d);
    vec3 col = day * (ambient + 0.95*lit*dayAmt);
    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.92, 0.8) * ax.x * pow(max(dot(N, H), 0.0), 90.0) * 0.32 * lit * dayAmt;  // sun glint on water
    col += vec3(1.0, 0.72, 0.38) * pow(ax.y, 1.6) * 0.9 * (1.0 - smoothstep(-0.18, 0.06, d)); // night lights
    return col;
  }`;
