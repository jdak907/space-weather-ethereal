// One shared UTC timeline for every data set, with physical propagation delays, detected events,
// cause -> effect chains, and the mapping from real time to musical time.
//
// Conventions (see README "Timeline and delays"):
//  * The playhead is a UTC time T "as experienced at Earth".
//  * Data measured at Earth (Kp, Ap, GOES X-rays and protons in geostationary orbit, F10.7, sunspots)
//    are already at Earth time; each value is held only over its own cadence interval.
//  * Solar wind measured at L1 is shifted to its arrival at Earth's bow shock:
//    delay = (1.5 million km L1 distance - ~90,000 km bow-shock standoff) / measured speed.
//  * The Sun scene shows the Sun at emission time: T - 8.3 min (light travel time).
import { MISSING } from './data.js';
import { srAt } from './schumann.js';

const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
export const DELAYS = {
  lightMin: 8.3,               // Sun -> Earth light time, minutes (1 AU / c = 499 s)
  l1Km: 1.5e6,                 // L1 distance from Earth, km (spacecraft orbit about L1; actual 1.4-1.6 million km [VERIFY per spacecraft])
  bowShockKm: 9e4,             // bow shock nose ~14 Earth radii upstream [VERIFY; varies 10-20 RE with pressure]
  oval: [30, 180],             // southward Bz at the magnetosphere -> auroral/Kp response, minutes (substorm growth ~30-60 min; Kp 0-3 h)
  curtainMin: 90,              // illustrative: substorm onset brightening of curtains after arrival
  sepMin: [20, 600],           // flare -> first >=10 MeV protons at GEO: tens of minutes to hours (magnetic connection dependent)
  cmeHours: [24, 96],          // CME Sun -> Earth transit: 1-4 days (fast ~15-18 h extreme cases)
};
export const l1DelayMin = (speedKmS) => (DELAYS.l1Km - DELAYS.bowShockKm) / Math.max(200, speedKmS) / 60;
const ok = (v) => typeof v === 'number' && isFinite(v) && v > MISSING;

// ---- solar wind: L1 measurement time -> Earth (bow shock) arrival time, on a 10-min grid
export function shiftWind(sw) {
  const n = sw.speed.length, arr = [];
  for (let i = 0; i < n; i++) {
    const t = sw.t0 + i * sw.step, v = sw.speed[i];
    if (!ok(v)) continue;
    arr.push({ ta: t + l1DelayMin(v) * MIN, tl1: t, speed: v, dens: sw.dens[i], bz: sw.bz[i], lag: l1DelayMin(v) });
  }
  arr.sort((a, b) => a.ta - b.ta);
  if (!arr.length) return { ...sw, lag: [], shifted: true };
  const step = sw.step, t0 = Math.ceil(arr[0].ta / step) * step, t1 = arr[arr.length - 1].ta;
  const out = { t0, step, speed: [], dens: [], bz: [], lag: [], tl1: [], source: sw.source, shifted: true };
  let j = 0;
  for (let t = t0; t <= t1; t += step) {
    while (j + 1 < arr.length && arr[j + 1].ta <= t) j++;
    const a = arr[j], fresh = a.ta <= t && t - a.ta <= 3 * step; // hold a reading at most 30 min
    out.speed.push(fresh ? a.speed : MISSING); out.dens.push(fresh && ok(a.dens) ? a.dens : MISSING);
    out.bz.push(fresh && ok(a.bz) ? a.bz : MISSING); out.lag.push(fresh ? a.lag : MISSING); out.tl1.push(fresh ? a.tl1 : MISSING);
  }
  return out;
}

// value of a regular series {t0, step, v|key} at time T, held over its own cadence only
export function holdAt(s, T, key = 'v') {
  const a = s && s[key]; if (!a || !a.length) return MISSING;
  const i = Math.floor((T - s.t0) / s.step);
  return i >= 0 && i < a.length && ok(a[i]) ? a[i] : MISSING;
}
export function maxIn(s, Ta, Tb) {
  if (!s || !s.v || !s.v.length) return MISSING;
  let m = MISSING;
  const i0 = Math.max(0, Math.floor((Ta - s.t0) / s.step)), i1 = Math.min(s.v.length - 1, Math.floor((Tb - s.t0) / s.step));
  for (let i = i0; i <= i1; i++) if (ok(s.v[i]) && s.v[i] > m) m = s.v[i];
  return m;
}
const endOf = (s, key = 'v') => { const a = s && s[key]; if (!a) return -Infinity; for (let i = a.length - 1; i >= 0; i--) if (ok(a[i])) return s.t0 + (i + 1) * s.step; return -Infinity; };

// ---- events
export function findEvents(D) {
  const ev = [];
  const runs = (s, key, test, minLen, mk) => {
    const a = s && s[key]; if (!a) return;
    let i0 = -1, best = null;
    for (let i = 0; i <= a.length; i++) {
      const hit = i < a.length && ok(a[i]) && test(a[i]);
      if (hit) { if (i0 < 0) { i0 = i; best = i; } else if (mk.better && mk.better(a[i], a[best])) best = i; }
      else if (i0 >= 0) { if (i - i0 >= minLen) ev.push(mk(s.t0 + i0 * s.step, s.t0 + i * s.step, best, a)); i0 = -1; }
    }
  };
  // flares: GOES 0.1-0.8 nm >= M1 (1e-5 W/m^2); time = peak as seen at Earth
  const fl = (ta, tb, ib, a) => ({ type: 'flare', t: D.xr.t0 + ib * D.xr.step, tEnd: tb, peak: a[ib] });
  fl.better = (x, y) => x > y; runs(D.xr, 'v', (v) => v >= 1e-5, 1, fl);
  // solar proton events: >=10 MeV >= 10 pfu (NOAA S1 threshold)
  const sp = (ta, tb, ib, a) => ({ type: 'sep', t: ta, tEnd: tb, peak: a[ib] });
  sp.better = (x, y) => x > y; runs(D.p10, 'v', (v) => v >= 10, 2, sp);
  // southward IMF at Earth arrival: Bz <= -5 nT for >= 30 min
  if (D.swE) {
    const bz = (ta, tb, ib, a) => ({ type: 'bzs', t: ta, tEnd: tb, peak: a[ib], lag: D.swE.lag[Math.round((ta - D.swE.t0) / D.swE.step)] });
    bz.better = (x, y) => x < y; runs(D.swE, 'bz', (v) => v <= -5, 3, bz);
  }
  // geomagnetic storm: Kp >= 5 (NOAA G1)
  const kp = (ta, tb, ib, a) => ({ type: 'kp5', t: ta, tEnd: tb, peak: a[ib] });
  kp.better = (x, y) => x > y; runs(D.kp, 'v', (v) => v >= 4.67, 1, kp);
  for (const c of D.cmes || []) ev.push({ type: 'cme', t: c.launch, tEnd: c.arrival, arrival: c.arrival, demo: !!D.demo });
  ev.sort((a, b) => a.t - b.t);
  // link proton events and CMEs to a preceding flare
  for (const e of ev) if (e.type === 'sep' || e.type === 'cme') {
    const f = ev.filter((x) => x.type === 'flare' && x.t <= e.t + 30 * MIN && e.t - x.t < 24 * HOUR).pop();
    if (f) e.flare = f;
  }
  return ev;
}
const fmtLag = (ms) => { const m = Math.round(ms / MIN); return m < 90 ? `${m} min` : m < 48 * 60 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`; };
export function xcls(f) { const L = 'ABCMX'; let k = Math.max(0, Math.min(4, Math.floor(Math.log10(f) + 8))); return L[k] + (f / 10 ** (k - 8)).toFixed(1); }

// cause -> effect stages for an event; times are UTC at the place each scene shows
export function chainFor(e) {
  const L = DELAYS.lightMin * MIN, S = [];
  if (e.type === 'flare') {
    S.push({ t: e.t - L, scene: 'sun', fx: 'flare', label: `${xcls(e.peak)} flare on the Sun` });
    S.push({ t: e.t, scene: 'schumann', fx: 'sid', label: `X-rays reach Earth ${DELAYS.lightMin} min later: dayside ionosphere ionizes, Schumann frequencies rise` });
  } else if (e.type === 'sep') {
    S.push({ t: e.t, scene: 'oval', fx: 'pca', label: `Protons ≥10 MeV reach Earth${e.flare ? ' ' + fmtLag(e.t - e.flare.t + L) + ' after the flare' : ''} (peak ${Math.round(e.peak)} pfu)` });
    S.push({ t: e.t + 10 * MIN, scene: 'schumann', fx: 'sep', label: 'Protons ionize the low D region: Schumann frequencies drop' });
  } else if (e.type === 'cme') {
    S.push({ t: e.t, scene: 'sun', fx: 'cme', label: 'Coronal mass ejection leaves the Sun' });
    S.push({ t: e.t + (e.arrival - e.t) * 0.5, scene: 'wind', fx: 'cme', label: `CME crosses the inner solar system (transit ${fmtLag(e.arrival - e.t)})` });
    S.push({ t: e.arrival, scene: 'magneto', fx: 'shock', label: 'CME shock hits the magnetosphere: magnetopause pushed in' });
  } else if (e.type === 'bzs') {
    const lag = ok(e.lag) ? e.lag : 45;
    S.push({ t: e.t - lag * MIN, scene: 'wind', fx: 'bz', label: `Southward Bz (${e.peak.toFixed(0)} nT) measured at L1` });
    S.push({ t: e.t, scene: 'magneto', fx: 'reconnect', label: `Reaches Earth ${Math.round(lag)} min later (1.41 million km ÷ wind speed): dayside reconnection` });
    S.push({ t: e.t + 45 * MIN, scene: 'oval', fx: 'expand', label: 'Energy loads the magnetotail; the auroral oval grows (~30 min to 3 h)' });
    S.push({ t: e.t + DELAYS.curtainMin * MIN, scene: 'curtain', fx: 'substorm', label: 'Substorm: curtains brighten' });
  } else if (e.type === 'kp5') {
    S.push({ t: e.t, scene: 'oval', fx: 'storm', label: `Geomagnetic storm, Kp ${e.peak.toFixed(1)}: oval moves toward mid-latitudes` });
    S.push({ t: e.t + 30 * MIN, scene: 'curtain', fx: 'storm', label: 'Bright, high-reaching aurora' });
    S.push({ t: e.t + 60 * MIN, scene: 'schumann', fx: 'storm', label: 'Ionosphere disturbed (Schumann storm effects are small and uncertain)' });
  }
  return S;
}

// ---- real time -> musical time
// slotMs: real time per note slot = 1 day / (bars per day x slots per bar).
// Event mode: quiet stretches go 3x faster, the hours around events 8x slower (at least 2 min per step).
export function buildSlots(D, opt, events) {
  const ends = [endOf(D.kp), endOf(D.swE, 'speed'), endOf(D.xr), endOf(D.p10)].filter(isFinite);
  const tEnd = Math.max(...ends);
  const span = opt.window === 'all' ? tEnd - D.kp.t0 : { '1d': 1, '3d': 3, '7d': 7, '27d': 27 }[opt.window || '7d'] * DAY;
  const t0 = Math.max(D.kp.t0, tEnd - span);
  const slotMs = DAY / (opt.barsPerDay * opt.slotsPerBar);
  const near = (T) => events.some((e) => T >= e.t - 3 * HOUR && T <= (e.tEnd || e.t) + 4 * HOUR);
  const T = [];
  for (let t = t0; t <= tEnd && T.length < 20000; ) {
    T.push(t);
    t += opt.eventMode ? (near(t) ? Math.max(2 * MIN, slotMs / 8) : slotMs * 3) : slotMs;
  }
  return { T, slotMs, t0, tEnd };
}

// per-slot values for every orchestra set (time-aligned at the playhead)
export function resample(D, T, sets) {
  const R = {}, n = T.length;
  for (const id of sets) R[id] = new Array(n).fill(MISSING);
  const sr = { v: new Array(n), df: new Array(n) };
  for (let k = 0; k < n; k++) {
    const t = T[k], tPrev = k ? T[k - 1] : t - 10 * MIN;
    R.kp[k] = holdAt(D.kp, t); R.ap[k] = holdAt(D.ap, t); R.f107[k] = holdAt(D.f107, t); R.sn[k] = holdAt(D.sn, t);
    R.speed[k] = holdAt(D.swE, t, 'speed'); R.dens[k] = holdAt(D.swE, t, 'dens'); R.bz[k] = holdAt(D.swE, t, 'bz');
    const xr = maxIn(D.xr, tPrev, t); // flares are short: take the slot's maximum so none is skipped
    R.xr[k] = ok(xr) && xr > 0 ? Math.round(Math.log10(xr) * 4) / 4 : MISSING;
    const s = srAt(D, t, ok(R.kp[k]) ? R.kp[k] : 2);
    R.sr[k] = Math.round(s.I * 100) / 100; sr.df[k] = Math.round(s.df1 * 1000) / 1000;
  }
  R.srDf = sr.df;
  return R;
}

// ---- "Typical storm" demo: an illustrative textbook sequence, NOT real data
export function demoData(real) {
  const day0 = Math.floor(Date.now() / DAY) * DAY - 4 * DAY;
  const reg = (step, hours, f) => { const v = []; for (let t = 0; t < hours * HOUR; t += step) v.push(f(t / HOUR)); return { t0: day0, step, v }; };
  const flareH = 6.2, shockL1 = 2 * 24 + 5.3; // flare at day 0 06:12 UTC; CME shock at L1 day 2 05:18
  const kpAt = (h) => { const x = h - (shockL1 + 0.6); if (x < 0) return 2 - (h % 24 > 12 ? 0.33 : 0); const prof = [4, 5.67, 7, 7, 6.33, 5.33, 4.67, 4, 3.33, 3, 3, 2.67]; return prof[Math.min(prof.length - 1, Math.floor(x / 3))]; };
  const kp = reg(3 * HOUR, 4.5 * 24, (h) => kpAt(h + 1.5));
  const daily = (f) => reg(DAY, 5 * 24, f);
  const xr = reg(10 * MIN, 4.5 * 24, (h) => { const b = 3e-7 * (1 + 0.3 * Math.sin(h)); const d = h - flareH; return d < -0.2 ? b : d < 0.15 ? b + 2.2e-4 * Math.max(0, (d + 0.2) / 0.35) : b + 2.2e-4 * Math.exp(-(d - 0.15) / 0.6); });
  const p10 = reg(10 * MIN, 4.5 * 24, (h) => { const d = h - (flareH + 0.8); let p = 0.3; if (d > 0) p += 320 * (1 - Math.exp(-d / 3)) * Math.exp(-d / 30); const e = h - shockL1; if (e > -6 && e < 6) p += 250 * Math.exp(-(e * e) / 4); return Math.round(p * 100) / 100; });
  const sw = { t0: day0, step: 10 * MIN, speed: [], dens: [], bz: [], source: 'DEMO (illustrative)' };
  for (let t = 0; t < 4.5 * DAY; t += 10 * MIN) {
    const h = t / HOUR, x = h - shockL1;
    let sp = 380 + 10 * Math.sin(h / 5), de = 5 + Math.sin(h / 3), bz = 1.5 * Math.sin(h / 2.3);
    if (x >= 0) { sp = 720 - 170 * (1 - Math.exp(-x / 20)); de = x < 2 ? 26 : x < 7 ? 14 : 3.5; bz = x < 6 ? 9 * Math.sin(x * 2.7) : x < 20 ? -18 * Math.sin(Math.PI * (x - 6) / 14) - 2 : 3 * Math.exp(-(x - 20) / 6); }
    sw.speed.push(Math.round(sp)); sw.dens.push(Math.round(de * 10) / 10); sw.bz.push(Math.round(bz * 10) / 10);
  }
  const D = {
    demo: true, snapshotAsOf: 'DEMO', generated: null,
    kp, ap: daily((h) => (h > 48 ? (h > 72 ? 25 : 90) : 7)), f107: daily(() => 185), sn: daily(() => 130),
    sw, xr, p10, live: {}, errors: [], liveSSN: null,
    cmes: [{ launch: day0 + flareH * HOUR, arrival: day0 + (shockL1 + 0.55) * HOUR }],
  };
  D.swE = shiftWind(D.sw);
  void real;
  return D;
}
