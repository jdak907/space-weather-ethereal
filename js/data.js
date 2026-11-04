// Data loading: bundled snapshot (data.json) + optional live NOAA SWPC refresh.
// Nothing here invents values: missing readings (-999 / null) are skipped.
export const MISSING = -999;
const SWPC = 'https://services.swpc.noaa.gov';
const H = 3600e3;

const ok = (v) => typeof v === 'number' && isFinite(v) && v !== MISSING;

function series(s, stepKey = 'stepH') {
  return { t0: Date.parse(s.start), step: s[stepKey] * H, v: s.v.slice() };
}

export async function loadSnapshot(url = 'data.json') {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('data.json ' + r.status);
  const d = await r.json();
  const sw = d.sw;
  return {
    snapshotAsOf: d.asOf,
    generated: d.meta && d.meta.generatedUtc ? Date.parse(d.meta.generatedUtc) : null,
    kp: series(d.kp), ap: series(d.ap), f107: series(d.f107), sn: series(d.sn),
    sw: {
      t0: Date.parse(sw.start), step: sw.stepH * H,
      speed: sw.speed.slice(), dens: sw.dens.slice(), bz: sw.bz.slice(),
      source: (sw.source || []).join(', '),
    },
    live: { kp: false, sw: false, f107: false, ssn: false },
    liveSSN: null, // SWPC sunspot number (different scale from SILSO SN), only if fetched
    errors: [],
  };
}

// latest non-missing value in a series {t0, step, v}
export function latest(s, key = 'v') {
  const a = s[key];
  for (let i = a.length - 1; i >= 0; i--) if (ok(a[i])) return { v: a[i], t: s.t0 + i * s.step, i };
  return null;
}
export function endTime(s, key = 'v') { const l = latest(s, key); return l ? l.t : s.t0; }

// value at time t (most recent at or before t, searching back up to `back` steps)
export function at(s, t, key = 'v', back = 48) {
  const a = s[key];
  let i = Math.floor((t - s.t0) / s.step);
  if (i >= a.length) i = a.length - 1;
  for (let k = 0; k < back && i >= 0; k++, i--) if (ok(a[i])) return a[i];
  return null;
}
// max over [t - span, t]
export function maxOver(s, t, span) {
  let m = null;
  const i1 = Math.min(s.v.length - 1, Math.floor((t - s.t0) / s.step));
  const i0 = Math.max(0, Math.floor((t - span - s.t0) / s.step));
  for (let i = i0; i <= i1; i++) if (ok(s.v[i]) && (m === null || s.v[i] > m)) m = s.v[i];
  return m;
}

async function getJSON(url, ms = 9000) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return await r.json();
  } finally { clearTimeout(tm); }
}
const utc = (s) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');

function putIntoSeries(s, t, v) {
  const i = Math.round((t - s.t0) / s.step);
  if (i < 0) return;
  while (s.v.length <= i) s.v.push(MISSING);
  s.v[i] = v;
}

// Try live NOAA SWPC endpoints (they send Access-Control-Allow-Origin: *).
// Each source is independent; failures leave the snapshot in place.
export async function refreshLive(D) {
  const jobs = {
    kp: async () => {
      const rows = await getJSON(`${SWPC}/products/noaa-planetary-k-index.json`);
      let n = 0;
      // Handles both formats: array of objects, or legacy array of arrays with a header row
      let hdr = null;
      for (const r of rows) {
        let tt, kp;
        if (Array.isArray(r)) {
          if (!hdr) { hdr = r; continue; }
          tt = r[hdr.indexOf('time_tag')]; kp = parseFloat(r[hdr.indexOf('Kp')]);
        } else { tt = r.time_tag; kp = +r.Kp; }
        if (!tt || !isFinite(kp) || kp < 0) continue;
        putIntoSeries(D.kp, utc(tt), Math.round(kp * 100) / 100); n++;
      }
      if (!n) throw new Error('no Kp rows');
    },
    sw: async () => {
      const [wind, mag] = await Promise.all([
        getJSON(`${SWPC}/json/rtsw/rtsw_wind_1m.json`),
        getJSON(`${SWPC}/json/rtsw/rtsw_mag_1m.json`),
      ]);
      const active = (rows) => {
        const a = rows.filter((r) => r.active);
        if (a.length) return a;
        const c = {}; rows.forEach((r) => (c[r.source] = (c[r.source] || 0) + 1));
        const src = Object.keys(c).sort((x, y) => c[y] - c[x])[0];
        return rows.filter((r) => r.source === src);
      };
      const w = active(wind), m = active(mag);
      const bins = (rows, key) => {
        const b = new Map();
        for (const r of rows) {
          const v = r[key]; if (v === null || v === undefined || !isFinite(v)) continue;
          const t = utc(r.time_tag); const k = Math.floor(t / 6e5) * 6e5;
          if (!b.has(k)) b.set(k, []); b.get(k).push(+v);
        }
        return b;
      };
      const sp = bins(w, 'proton_speed'), de = bins(w, 'proton_density'), bz = bins(m, 'bz_gsm');
      const common = [...sp.keys()].filter((k) => bz.has(k));
      if (!common.length) throw new Error('no solar wind bins');
      const last = Math.max(...common);
      const avg = (b, k, nd) => { const a = b.get(k); if (!a) return MISSING; const f = 10 ** nd; return Math.round(a.reduce((x, y) => x + y, 0) / a.length * f) / f; };
      const seq = []; for (let k = 143; k >= 0; k--) seq.push(last - k * 6e5);
      D.sw = {
        t0: seq[0], step: 6e5,
        speed: seq.map((k) => avg(sp, k, 0)), dens: seq.map((k) => avg(de, k, 2)), bz: seq.map((k) => avg(bz, k, 2)),
        source: [...new Set(w.map((r) => r.source))].join(', '),
      };
    },
    f107: async () => {
      const rows = await getJSON(`${SWPC}/json/f107_cm_flux.json`);
      // Use the newest "Noon" (local noon at Penticton) observation for its UTC day
      const noon = rows.filter((r) => isFinite(r.flux) && /noon/i.test(r.reporting_schedule || ''));
      const pick = (noon.length ? noon : rows).sort((a, b) => utc(b.time_tag) - utc(a.time_tag))[0];
      if (!pick) throw new Error('no F10.7');
      const t = utc(pick.time_tag); const day = Math.floor(t / 864e5) * 864e5;
      putIntoSeries(D.f107, day, Math.round(pick.flux * 10) / 10);
    },
    ssn: async () => {
      const rows = await getJSON(`${SWPC}/json/solar-cycle/swpc_observed_ssn.json`);
      const r = rows.filter((x) => isFinite(x.swpc_ssn) && x.swpc_ssn >= 0).pop();
      if (!r) throw new Error('no SSN');
      D.liveSSN = { v: r.swpc_ssn, t: utc(r.Obsdate) };
    },
  };
  await Promise.all(Object.entries(jobs).map(async ([k, f]) => {
    try { await f(); D.live[k] = true; } catch (e) { D.errors.push(`${k}: ${e.message || e}`); }
  }));
  return D;
}

export function anyLive(D) { return Object.values(D.live).some(Boolean); }

// Sunspot number used to drive visuals: international SN (SILSO via GFZ) if recent,
// otherwise the live SWPC count, labeled as such.
export function sunspot(D, t) {
  const sn = at(D.sn, t, 'v', 5);
  if (D.liveSSN && (sn === null || t - endTime(D.sn) > 864e5)) return { v: D.liveSSN.v, label: 'SWPC sunspot no.' };
  return { v: sn, label: 'Sunspot number (SILSO)' };
}
