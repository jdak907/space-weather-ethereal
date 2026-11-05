// Schumann resonance MODEL (no open live numeric Schumann feed exists; see README).
// Everything here is a clearly labeled stand-in built from published physics:
//  * Intensity: global lightning by time of day. Thunderstorms peak in the late afternoon (local
//    time) over tropical land, so as Earth turns the world total peaks three times a day (UTC):
//    SE Asia ~08-09 UT, Africa ~14-15 UT (strongest), the Americas ~20-21 UT ("three chimneys").
//    We compute it from a real 1-degree land mask (Natural Earth) x a local-time storm curve.
//  * Space weather: solar X-ray flares raise the 1st mode ~0.2 Hz (Roldugin et al. 2004,
//    doi:10.1029/2003JA010019); solar proton events lower it ~0.15-0.4 Hz (Roldugin et al. 2001,
//    doi:10.1029/2000JA900118), driven here by live NOAA GOES X-ray and >=10 MeV proton flux.
//  * Kp: a small, illustrative broadening (damping) of the peaks; storm effects are uncertain
//    (Salinas et al. 2016, doi:10.1002/2016JA023253).
import { LAND_W, LAND_H, LAND_B64 } from './landmask.js';
import { at, endTime, MISSING } from './data.js';

export const SR_F0 = [7.83, 14.3, 20.8, 27.3, 33.8];     // typical observed mode frequencies, Hz
export const SR_A0 = [1, 0.72, 0.52, 0.36, 0.25];         // typical relative amplitudes (illustrative)
export const SR_Q0 = [4.5, 5.2, 5.8, 6.3, 6.8];           // typical Q factors (cavity Q ~4-6)
export const SR_DFX = [1, 1.75, 2.2, 2.6, 3.0];           // relative flare shift per mode (mode 2 ~0.35 Hz per Roldugin 2004; 3-5 extrapolated)
export const SR_TRANSPOSE = 16;                           // audio: x16 = 4 octaves up (7.83 Hz -> 125.3 Hz)
export const REGIONS = [
  { id: 'asia', label: 'SE Asia + Maritime Continent', w: 1.15 },
  { id: 'africa', label: 'Africa', w: 1.2 },
  { id: 'americas', label: 'The Americas', w: 1.3 },
];
const regionOf = (lon) => (lon >= -130 && lon < -25 ? 2 : lon >= -25 && lon < 60 ? 1 : 0);

// ---- land mask -> tropical storm cells
let CELLS = null;
export const land = (() => {
  const bin = atob(LAND_B64), b = new Uint8Array(LAND_W * LAND_H);
  for (let i = 0; i < LAND_W * LAND_H; i++) b[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return b;
})();
function cells(doy) {
  if (CELLS && CELLS.doy === doy) return CELLS;
  // the storm belt follows the Sun north and south through the year (about +/- 8 degrees)
  const shift = 8 * Math.sin((2 * Math.PI * (doy - 80)) / 365.25);
  const list = [];
  for (let y = 0; y < LAND_H; y++) {
    const lat = 89.5 - y; if (Math.abs(lat) > 38) continue;
    const latW = Math.cos((lat * Math.PI) / 180) * Math.exp(-0.5 * ((lat - shift) / 13) ** 2);
    for (let x = 0; x < LAND_W; x += 1) {
      const lon = -179.5 + x, isLand = land[y * LAND_W + x];
      if (!isLand && (x % 3 || y % 3)) continue; // sparse ocean cells, weighted for the skipped ones
      const r = regionOf(lon);
      list.push({ lat, lon, r, w: latW * (isLand ? REGIONS[r].w : 0.1 * 9) });
    }
  }
  CELLS = { doy, list };
  return CELLS;
}
// thunderstorms by local solar time: a late-afternoon peak (~16 h) over a small round-the-clock floor
const stormLT = (lt) => { let d = lt - 16; d -= 24 * Math.round(d / 24); return 0.08 + Math.exp(-0.5 * (d / 2.2) ** 2); };
const doyOf = (ms) => Math.floor((ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 0)) / 864e5);

// diurnal table for a day of year: 96 quarter-hour bins of total + per-region shares
const TABLES = new Map();
export function diurnal(doy) {
  if (TABLES.has(doy)) return TABLES.get(doy);
  const { list } = cells(doy), N = 96, tot = new Float32Array(N), reg = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let k = 0; k < N; k++) {
    const ut = k / 4;
    for (const c of list) { const v = c.w * stormLT(ut + c.lon / 15); tot[k] += v; reg[c.r][k] += v; }
  }
  let mx = 0; for (const v of tot) mx = Math.max(mx, v);
  const t = { tot, reg, mx }; TABLES.set(doy, t);
  if (TABLES.size > 8) TABLES.delete(TABLES.keys().next().value);
  return t;
}
// pick a random storm location for a time (weighted by the model) -> {lat, lon, r}
export function sampleStorm(ms, rnd = Math.random) {
  const { list } = cells(doyOf(ms)), ut = ((ms / 3600e3) % 24 + 24) % 24;
  for (let tries = 0; tries < 40; tries++) {
    const c = list[Math.floor(rnd() * list.length)];
    if (rnd() * 1.4 < (c.w / 1.3) * stormLT(ut + c.lon / 15)) return { lat: c.lat + (rnd() - 0.5), lon: c.lon + (rnd() - 0.5), r: c.r };
  }
  return null;
}

// GOES X-ray class label from 0.1-0.8 nm flux (W/m^2)
export function xClass(f) {
  if (!(f > 0)) return '—';
  const L = [['A', 1e-8], ['B', 1e-7], ['C', 1e-6], ['M', 1e-5], ['X', 1e-4]];
  let k = 0; while (k < 4 && f >= L[k + 1][1]) k++;
  return L[k][0] + (f / L[k][1]).toFixed(1);
}
const val = (s, t) => {
  if (!s || !s.v || !s.v.length) return null;
  const e = endTime(s); if (t > e) t = e;          // past the newest reading: hold the latest one
  const v = at(s, t, 'v', 18); return v === null || v <= MISSING ? null : v;
};

// The modeled state at time ms. kp only broadens the peaks a little (illustrative).
export function srAt(D, ms, kp = 2) {
  const tb = diurnal(doyOf(ms)), ut = ((ms / 3600e3) % 24 + 24) % 24;
  const k0 = Math.floor(ut * 4) % 96, k1 = (k0 + 1) % 96, u = ut * 4 - Math.floor(ut * 4);
  const lerp = (a) => a[k0] + (a[k1] - a[k0]) * u;
  const I = lerp(tb.tot) / tb.mx;
  const shares = tb.reg.map((r) => lerp(r) / Math.max(1e-6, lerp(tb.tot)));
  const lead = shares.indexOf(Math.max(...shares));
  const xr = D ? val(D.xr, ms) : null, p10 = D ? val(D.p10, ms) : null;
  const dfX = xr ? 0.2 * Math.min(1, Math.max(0, (Math.log10(xr) + 6) / 2)) : 0;            // C1 -> 0, M1 -> +0.1, X1+ -> +0.2 Hz
  const dfP = p10 !== null && p10 >= 10 ? -(0.15 + 0.25 * Math.min(1, Math.log10(p10 / 10) / 2)) : 0; // S1 -> -0.15, S3+ -> -0.4 Hz
  const f = SR_F0.map((f0, n) => f0 + (dfX + dfP) * SR_DFX[n]);
  const Q = SR_Q0.map((q) => q * (1 - 0.02 * Math.min(9, Math.max(0, kp))));
  const A = SR_A0.map((a) => a * Math.sqrt(I));
  return { I, ut, f, Q, A, dfX, dfP, df1: dfX + dfP, xr, p10, xcls: xClass(xr), shares, lead, leadLabel: REGIONS[lead].label };
}
// modeled spectrum (sum of Lorentzian peaks) at frequency fHz
export function srSpectrum(s, fHz, boost = null) {
  let y = 0;
  for (let n = 0; n < 5; n++) {
    const w = s.f[n] / (2 * s.Q[n]), d = (fHz - s.f[n]) / w;
    y += (s.A[n] * s.A[n] * (boost ? 1 + boost[n] : 1)) / (1 + d * d);
  }
  return y;
}
// series for the orchestra on the Kp master clock (one value per 3-hour step, mid-step time)
export function srSeries(D) {
  const n = D.kp.v.length, v = new Array(n), df = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = D.kp.t0 + (i + 0.5) * D.kp.step, kp = D.kp.v[i] > MISSING ? D.kp.v[i] : 2;
    const s = srAt(D, t, kp);
    v[i] = Math.round(s.I * 100) / 100; df[i] = Math.round(s.df1 * 1000) / 1000;
  }
  return { t0: D.kp.t0, step: D.kp.step, v, df };
}
// geographic -> unit vector (y = north pole; lon 0 on +x, east toward -z)
export function geo(lat, lon, r = 1) {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)];
}
// subsolar point (approximate declination; no equation of time)
export function subsolar(ms) {
  const doy = doyOf(ms), ut = ((ms / 3600e3) % 24 + 24) % 24;
  return { lat: 23.44 * Math.sin((2 * Math.PI * (doy - 81)) / 365.25), lon: (12 - ut) * 15 };
}
