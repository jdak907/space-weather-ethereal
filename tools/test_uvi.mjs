// Timing rules for the SMILE UVI panel. No network and no ESA files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FEED_OFF, NO_COVERAGE, assignValidity, frameAt, latestAt, describe, normalizeCatalog, fmtAge, offCatalog,
} from '../js/uvi.mjs';
import { createUviVoice, uviSample } from '../js/uvi-audio.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const NOW = Date.parse('2026-11-07T00:20:00Z');

function framesFrom(starts, stepHoldCheck) {
  return assignValidity(starts.map((obsTime, i) => ({ id: 'f' + i, obsTime, retrievedAt: obsTime + 3_600_000 })), {
    nominalCadenceMs: 60_000, maxHoldMs: 90_000,
  });
}

// 30 s then 60 s, then a 114 s hole that must not be filled.
const t0 = Date.parse('2026-11-03T00:00:00Z');
const spans = framesFrom([t0, t0 + 30_000, t0 + 90_000, t0 + 204_000]);
assert.deepEqual(spans.map((f) => f.validTo - f.validFrom), [30_000, 60_000, 60_000, 60_000]);
assert.equal(frameAt(spans, t0), spans[0]);
assert.equal(frameAt(spans, t0 + 30_000), spans[1]);
assert.equal(frameAt(spans, t0 + 90_000 + 60_000), null, 'nominal hold ends before the next frame');
assert.equal(frameAt(spans, t0 + 150_000), null);
assert.equal(frameAt(spans, t0 - 1), null, 'no frame before the first observation');
assert.equal(frameAt(spans, spans[3].validTo), null, 'validity is half-open');
assert.equal(frameAt(spans, spans[3].obsTime), spans[3]);
assert.ok(spans[0].retrievedAt !== spans[0].obsTime);

// A multi-minute hole, like the 789 s gap measured on 2026-11-04, stays blank.
const gap = assignValidity([
  { id: 'a', obsTime: t0 },
  { id: 'b', obsTime: t0 + 789_000 },
], { nominalCadenceMs: 60_000, maxHoldMs: 90_000 });
assert.equal(frameAt(gap, t0 + 61_000), null);
assert.equal(frameAt(gap, t0 + 788_000), null);
assert.equal(frameAt(gap, t0 + 789_000).id, 'b');
const mid = describe({ enabled: true, frames: gap }, t0 + 120_000, t0 + 800_000);
assert.equal(mid.state, 'gap');
assert.equal(mid.detail, NO_COVERAGE);
assert.equal(mid.frame, null);
assert.equal(mid.prior.id, 'a');
assert.equal(mid.newest.id, 'b');

// A future frame is not current.
const future = assignValidity([
  { id: 'past', obsTime: NOW - 30_000, retrievedAt: NOW },
  { id: 'ahead', obsTime: NOW + 300_000, retrievedAt: NOW },
], { nominalCadenceMs: 60_000, maxHoldMs: 90_000 });
const cur = describe({ enabled: true, frames: future }, NOW, NOW);
assert.equal(cur.state, 'frame');
assert.equal(cur.frame.id, 'past');
assert.equal(cur.showingFuture, false);
assert.equal(frameAt(future, NOW).id, 'past');
assert.equal(latestAt(future, NOW).id, 'past');
const ahead = describe({ enabled: true, frames: future }, NOW + 300_000, NOW);
assert.equal(ahead.frame.id, 'ahead');
assert.equal(ahead.showingFuture, true);

const off = describe(offCatalog(), NOW, NOW);
assert.equal(off.state, 'off');
assert.equal(off.detail, FEED_OFF);
assert.equal(fmtAge(12_000), '12 s');
assert.equal(fmtAge(5 * 60_000), '5 min');
assert.equal(fmtAge(3 * 3600e3), '3.0 h');

const raw = JSON.parse(readFileSync(join(root, 'data/uvi-synthetic/catalog.json'), 'utf8'));
assert.equal(raw.synthetic, true);
assert.equal(raw.anchor, 'now');
const cat = normalizeCatalog(raw, 'http://localhost/data/uvi-synthetic/catalog.json', NOW, {
  nominalCadenceMs: 60_000, maxHoldMs: 90_000, format: 'png',
});
assert.equal(cat.enabled, true);
assert.ok(cat.frames.every((f) => f.synthetic));
assert.ok(cat.frames.every((f) => f.image.includes('/data/uvi-synthetic/frames/syn-')));
const atNow = describe(cat, NOW, NOW);
assert.equal(atNow.state, 'frame', 'a synthetic frame covers the anchor');
assert.equal(atNow.showingFuture, false);
assert.ok(atNow.frame.obsTime <= NOW && NOW < atNow.frame.validTo);
const hole = NOW - 18 * 60_000;
const atHole = describe(cat, hole, NOW);
assert.equal(atHole.state, 'gap');
assert.equal(atHole.frame, null);
assert.ok(atNow.frame.retrievedAt !== atNow.frame.obsTime || atNow.frame.obsTime === NOW);
// Archive-like +1 s metadata must not be the display window.
assert.equal(atNow.frame.validTo - atNow.frame.validFrom, 60_000);

const voice = createUviVoice();
assert.equal(voice.enabled, false);
assert.equal(uviSample(voice, atNow), null);
voice.enabled = true;
assert.equal(uviSample(voice, atNow), null, 'no pitch mapping yet');
assert.equal(uviSample({ enabled: true, mapped: true }, atHole), null, 'a gap stays silent');

const gi = readFileSync(join(root, '.gitignore'), 'utf8');
assert.match(gi, /local\/uvi\//);
assert.match(gi, /SMILE_UVI_QL/);

console.log('test_uvi: ok', cat.frames.length, 'synthetic frames');
