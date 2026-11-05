// Every time shown in the app comes out of here, in three parts, in this order:
//   1) the viewer's local time with its zone abbreviation (browser Intl.DateTimeFormat)
//   2) UTC
//   3) Greenwich Mean Sidereal Time (GMST), and Local Sidereal Time only if the viewer typed a longitude
// GMST (hours) = 18.697374558 + 24.06570982441908 * D, D = days since J2000.0 (2000-01-01 12:00 UT).
// This is the standard low-precision IAU expression (USNO); it uses UTC in place of UT1 (|UT1-UTC| < 0.9 s),
// good to about 0.1 s over this century.
export const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
export function gmstHours(ms) {
  const D = (ms - J2000) / 864e5;
  return (((18.697374558 + 24.06570982441908 * D) % 24) + 24) % 24;
}
export const lstHours = (ms, lonDeg) => (((gmstHours(ms) + lonDeg / 15) % 24) + 24) % 24;
export function hms(h, sec = false) {
  const t = Math.round(h * (sec ? 36000 : 60)) / (sec ? 36000 : 60);
  const H = Math.floor(t) % 24, M = Math.floor((t * 60) % 60), S = (t * 3600) % 60;
  const p = (x) => String(x).padStart(2, '0');
  return sec ? `${p(H)}h${p(M)}m${S.toFixed(1).padStart(4, '0')}s` : `${p(H)}:${p(M)}`;
}

// optional longitude for Local Sidereal Time (never asks the browser for location)
const KEY = 'swe.lon';
export function getLon() {
  try { const v = localStorage.getItem(KEY); if (v === null || v === '') return null; const x = +v; return isFinite(x) && x >= -180 && x <= 360 ? x : null; } catch (_e) { return null; }
}
export function setLon(v) { try { if (v === null || v === '' || !isFinite(+v)) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(+v)); } catch (_e) { /* private mode */ } }

let small = false;
export function setCompact(on) { small = !!on; }
const fLocal = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fLocalY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fLocalShort = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fUtcDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const utcHM = (ms) => new Date(ms).toISOString().slice(11, 16);

// 'Nov 4, 4:31 PM PST · 00:31 UTC · GMST 20:28' (phones: '11/4, 4:31 PM PST · 00:31Z · GMST 20:28')
export function fmt3(ms, opt = {}) {
  if (!isFinite(ms)) return '—';
  const lon = getLon(), compact = opt.compact ?? small;
  const local = (compact ? fLocalShort : opt.year ? fLocalY : fLocal).format(new Date(ms));
  const d = new Date(ms), sameDay = new Date(ms + 0).getUTCDate();
  const localDay = new Date(ms).getDate();
  const utc = utcHM(ms) + (compact ? 'Z' : ' UTC') + (sameDay !== localDay && !compact ? ' ' + fUtcDay.format(d) : '');
  const sid = `GMST ${hms(gmstHours(ms))}` + (lon !== null ? ` · LST ${hms(lstHours(ms, lon))}` : '');
  return `${local} · ${utc} · ${sid}`;
}
// same, as separate parts (for layouts that stack them)
export function parts3(ms) { const lon = getLon(); return { local: fLocal.format(new Date(ms)), utc: utcHM(ms) + ' UTC', gmst: 'GMST ' + hms(gmstHours(ms)), lst: lon !== null ? 'LST ' + hms(lstHours(ms, lon)) : null }; }
