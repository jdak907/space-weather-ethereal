// Unit test for js/time.js sidereal time.  Run: node tools/test_time.mjs
// References:
//  * J2000.0 (2000-01-01 12:00 UT): GMST = 18.697374558 h = 18h41m50.548s (USNO formula constant term).
//  * Meeus, Astronomical Algorithms (2nd ed.), Example 12.a: 1987-04-10 00:00 UT -> 13h10m46.3668s.
//  * Meeus Example 12.b: 1987-04-10 19:21:00 UT -> 8h34m57.0896s.
// Meeus uses the full IAU 1982 polynomial; the linear formula agrees to well under 1 s for these dates.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { gmstHours, lstHours, hms, fmt3 } = await import('../js/time.js');
const cases = [
  ['2000-01-01T12:00:00Z', 18 + 41 / 60 + 50.548 / 3600, 'J2000.0'],
  ['1987-04-10T00:00:00Z', 13 + 10 / 60 + 46.3668 / 3600, 'Meeus 12.a'],
  ['1987-04-10T19:21:00Z', 8 + 34 / 60 + 57.0896 / 3600, 'Meeus 12.b'],
];
let fail = 0;
for (const [iso, want, name] of cases) {
  const got = gmstHours(Date.parse(iso)); let d = (got - want) * 3600; d -= 86400 * Math.round(d / 86400);
  const ok = Math.abs(d) < 0.5; if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${iso} GMST ${hms(got, true)} (reference ${hms(want, true)}, diff ${d.toFixed(3)} s)`);
}
// LST = GMST + longitude/15: Fairbanks (147.72 W) is 9.848 h behind Greenwich
const t = Date.parse('2000-01-01T12:00:00Z'), l = lstHours(t, -147.72), w = (18.697374558 - 147.72 / 15 + 24) % 24;
if (Math.abs(l - w) > 1e-9) { fail++; console.log('FAIL LST'); } else console.log(`PASS LST at 147.72 W: ${hms(l, true)}`);
console.log('sample:', fmt3(Date.parse('2026-11-05T00:31:00Z')));
process.exit(fail ? 1 : 0);
