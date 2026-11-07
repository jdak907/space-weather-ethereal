// SMILE UVI QuickLook timing. Observation time and retrieval time are separate.
// A frame is shown only inside its validity interval: never before it was taken,
// and never held across a coverage gap. Nothing here calls ESA.

export const PENDING = 'SMILE UVI feed pending Science Working Team agreement';
export const NO_COVERAGE = 'no SMILE coverage';

export const CITATIONS = {
  mission: {
    authors: 'Wang, C., Branduardi-Raymont, G., Escoubet, C.P. et al.',
    title: 'Solar Wind Magnetosphere Ionosphere Link Explorer (SMILE): Science and Mission Overview',
    venue: 'Space Sci Rev 221, 9 (2025)',
    doi: 'https://doi.org/10.1007/s11214-024-01126-6',
    when: 'Cite with any SMILE material.',
  },
  uvi: {
    authors: 'Zhang, XX., Wang, YM., He, F. et al.',
    title: 'Ultraviolet Imager (UVI) for the SMILE Mission',
    venue: 'Space Sci Rev 221, 31 (2025)',
    doi: 'https://doi.org/10.1007/s11214-025-01160-y',
    when: 'Cite when using UVI data.',
  },
};

export const CREDIT = 'ESA / CAS';
export const QUALITY = 'preliminary · uncalibrated';

const DAY = 864e5;

export function pendingCatalog(reason = PENDING) {
  return {
    enabled: false,
    synthetic: false,
    frames: [],
    format: 'png',
    endpoint: null,
    label: '',
    reason,
  };
}

function num(v) {
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
}

// validFrom = observation time.
// validTo = the next observation when it arrives within maxHoldMs (30 s and 60 s
// products both fall through). A longer hole ends the frame after nominalCadenceMs
// and the rest of the hole is a gap. The archive end_time (begin + 1 s on the
// products checked in November 2026) is stored and not used as this window.
export function assignValidity(frames, opt = {}) {
  const nominal = opt.nominalCadenceMs ?? 60_000;
  const maxHold = opt.maxHoldMs ?? 90_000;
  const sorted = [...frames].filter((f) => Number.isFinite(f.obsTime)).sort((a, b) => a.obsTime - b.obsTime);
  return sorted.map((f, i) => {
    const next = sorted[i + 1];
    const gap = next ? next.obsTime - f.obsTime : Infinity;
    const hold = gap <= maxHold ? gap : Math.min(nominal, maxHold);
    return { ...f, validFrom: f.obsTime, validTo: f.obsTime + hold };
  });
}

export function frameAt(frames, t) {
  if (!frames || !Number.isFinite(t)) return null;
  let hit = null;
  for (const f of frames) {
    if (t >= f.validFrom && t < f.validTo && (!hit || f.obsTime >= hit.obsTime)) hit = f;
  }
  return hit;
}

// Newest frame whose observation has already started by t. Not shown by itself.
export function latestAt(frames, t) {
  if (!frames || !Number.isFinite(t)) return null;
  let best = null;
  for (const f of frames) {
    if (f.obsTime <= t && (!best || f.obsTime > best.obsTime)) best = f;
  }
  return best;
}

export function fmtAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 90) return s + ' s';
  const m = Math.round(ms / 60_000);
  if (m < 90) return m + ' min';
  const h = ms / 3600e3;
  if (h < 48) return (Math.round(h * 10) / 10).toFixed(1) + ' h';
  return (Math.round(ms / DAY * 10) / 10).toFixed(1) + ' d';
}

// viewTime is the moment the panel is showing (the global clock, or the zoom scrubber).
// now is wall-clock UTC, used only for "latest available, age".
export function describe(catalog, viewTime, now) {
  const base = {
    pendingText: PENDING,
    gapText: NO_COVERAGE,
    newest: null,
    ageMs: null,
    age: null,
    frame: null,
    prior: null,
    showingFuture: false,
  };
  if (!catalog || !catalog.enabled) {
    return { ...base, state: 'pending', detail: catalog && catalog.reason ? catalog.reason : PENDING };
  }
  const frames = catalog.frames || [];
  const frame = frameAt(frames, viewTime);
  const prior = latestAt(frames, viewTime);
  const newest = latestAt(frames, now);
  const ageMs = newest ? Math.max(0, now - newest.obsTime) : null;
  const showingFuture = !!(frame && frame.obsTime > now);
  if (frame) {
    return {
      ...base, state: 'frame', frame, prior, newest, ageMs, age: fmtAge(ageMs), showingFuture,
      detail: '',
    };
  }
  return {
    ...base, state: 'gap', frame: null, prior, newest, ageMs, age: fmtAge(ageMs), showingFuture: false,
    detail: NO_COVERAGE,
  };
}

function resolveImage(image, catalogUrl) {
  if (!image) return null;
  if (!catalogUrl) return image;
  try { return new URL(image, catalogUrl).href; } catch (_e) { return image; }
}

// Turn a catalog JSON object into frames with absolute UTC times and validity.
// anchor "now" shifts offsetMs fields onto `now` so a demo still lines up whenever it is opened.
export function normalizeCatalog(raw, catalogUrl, now, defaults = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('UVI catalog is not an object');
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const anchor = raw.anchor === 'now' ? nowMs : (raw.anchor ? num(raw.anchor) : NaN);
  const frames = [];
  for (const f of raw.frames || []) {
    const obsTime = f.offsetMs != null && Number.isFinite(anchor) ? anchor + f.offsetMs : num(f.obsTime);
    if (!Number.isFinite(obsTime)) continue;
    const retrievedAt = f.retrievedOffsetMs != null && Number.isFinite(anchor)
      ? anchor + f.retrievedOffsetMs
      : (f.retrievedAt ? num(f.retrievedAt) : NaN);
    let obsEndMeta = NaN;
    if (f.obsEndOffsetMs != null && Number.isFinite(anchor)) obsEndMeta = anchor + f.obsEndOffsetMs;
    else if (f.obsEndMeta) obsEndMeta = num(f.obsEndMeta);
    frames.push({
      id: String(f.id || f.filename || obsTime),
      obsTime,
      obsEndMeta: Number.isFinite(obsEndMeta) ? obsEndMeta : null,
      retrievedAt: Number.isFinite(retrievedAt) ? retrievedAt : null,
      image: resolveImage(f.image || null, catalogUrl),
      synthetic: !!(raw.synthetic || f.synthetic),
      label: f.label || raw.label || '',
      filename: f.filename || null,
    });
  }
  return {
    enabled: true,
    synthetic: !!raw.synthetic,
    format: raw.format || defaults.format || 'png',
    endpoint: raw.endpoint || defaults.endpoint || null,
    nominalCadenceMs: raw.nominalCadenceMs ?? defaults.nominalCadenceMs ?? 60_000,
    maxHoldMs: raw.maxHoldMs ?? defaults.maxHoldMs ?? 90_000,
    label: raw.label || '',
    reason: '',
    frames: assignValidity(frames, {
      nominalCadenceMs: raw.nominalCadenceMs ?? defaults.nominalCadenceMs ?? 60_000,
      maxHoldMs: raw.maxHoldMs ?? defaults.maxHoldMs ?? 90_000,
    }),
  };
}

export function iso(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}
