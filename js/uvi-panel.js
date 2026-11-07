// SMILE UVI panel and the minutes-scale aurora window.
// The window scrubs frames on their own clock. It does not move the orchestra playhead.
import { UVI_CONFIG } from './uvi-config.js';
import {
  FEED_OFF, NO_COVERAGE, CITATIONS, CREDIT, QUALITY,
  offCatalog, describe, normalizeCatalog, fmtAge, iso, latestAt,
} from './uvi.mjs';
import { createUviVoice, uviSample } from './uvi-audio.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function citeBlock() {
  return [CITATIONS.mission, CITATIONS.uvi].map((c) =>
    `<p><b>${esc(c.authors)}</b> ${esc(c.title)}. ${esc(c.venue)}. <a href="${esc(c.doi)}" target="_blank" rel="noopener">${esc(c.doi)}</a> <span class="uvi-when">${esc(c.when)}</span></p>`
  ).join('');
}

export function mountUvi(root, zoomEl, opt = {}) {
  const defaults = { ...UVI_CONFIG, ...(opt.config || {}) };
  const voice = createUviVoice();
  let catalog = offCatalog();
  let globalTime = Date.now();
  let zoomOpen = false;
  let zoomTime = null;
  let infoOpen = false;
  let message = '';
  let escArmed = false;
  const fmt = (ms) => (opt.fmtTime ? opt.fmtTime(ms) : iso(ms));

  root.innerHTML = `
    <div class="uvi-head">
      <b>SMILE UVI</b>
      <span class="uvi-qual">${QUALITY}</span>
      <div class="uvi-acts">
        <button type="button" data-uvi="info" aria-expanded="false">Citations</button>
        <button type="button" data-uvi="zoom">Aurora window</button>
      </div>
    </div>
    <p class="uvi-credit">${CREDIT} · QuickLook</p>
    <p class="uvi-cite-short">Wang et al. 2025, Space Sci Rev 221, 9. Zhang et al. 2025, Space Sci Rev 221, 31.</p>
    <div class="uvi-stage" data-uvi-stage>
      <img alt="" hidden>
      <p class="uvi-ph" data-uvi-ph></p>
    </div>
    <p class="uvi-status" data-uvi-status></p>
    <p class="uvi-times" data-uvi-times></p>
    <p class="uvi-latest" data-uvi-latest></p>
    <p class="uvi-msg" data-uvi-msg hidden></p>
    <details class="uvi-cite">
      <summary>Citations</summary>
      ${citeBlock()}
      <p class="uvi-when">Direct auroral image: observation time is used as-is, with no L1 or solar-wind delay. Retrieval time is when the product was fetched, and it is not the observation.</p>
    </details>
    <details class="uvi-opt">
      <summary>Load a catalog</summary>
      <button type="button" data-uvi="synthetic">Synthetic demo</button>
      <button type="button" data-uvi="local">Local catalog</button>
      <button type="button" data-uvi="clear">Turn off</button>
      <label class="uvi-url">Catalog URL, this session only
        <span><input type="url" data-uvi-url placeholder="https://…" autocomplete="off" spellcheck="false"><button type="button" data-uvi="url">Load</button></span>
      </label>
      <p class="uvi-hint">Not saved. The page does not request ESA unless you load a catalog.</p>
      <label class="uvi-voice"><input type="checkbox" data-uvi-voice disabled> UVI sound (off, not mapped)</label>
    </details>`;

  zoomEl.innerHTML = `
    <div class="uvi-zoom-h">
      <div><b>Aurora window</b> <span>minutes · native UVI cadence</span></div>
      <button type="button" data-uvi="zoom-close" aria-label="Close aurora window">×</button>
    </div>
    <p class="uvi-zoom-note" data-uvi-slot></p>
    <div class="uvi-stage uvi-stage-lg">
      <img alt="" hidden>
      <p class="uvi-ph" data-uvi-ph></p>
    </div>
    <p class="uvi-status" data-uvi-status></p>
    <p class="uvi-times" data-uvi-times></p>
    <p class="uvi-latest" data-uvi-latest></p>
    <input type="range" data-uvi-range min="0" max="1" step="1000" value="0" aria-label="Scrub UVI frames by observation time">
    <div class="uvi-zoom-nav">
      <button type="button" data-uvi="prev">Previous frame</button>
      <button type="button" data-uvi="next">Next frame</button>
      <span data-uvi-range-label></span>
    </div>
    <p class="uvi-hint">Scrubbing this window does not move the playhead or the 45-minute musical steps.</p>
    <details class="uvi-cite" open>
      <summary>Citations</summary>
      ${citeBlock()}
    </details>`;

  const stageOf = (el) => ({
    img: el.querySelector('img'),
    ph: el.querySelector('[data-uvi-ph]'),
    status: el.querySelector('[data-uvi-status]'),
    times: el.querySelector('[data-uvi-times]'),
    latest: el.querySelector('[data-uvi-latest]'),
  });
  const panel = stageOf(root);
  const zoom = stageOf(zoomEl);

  function viewTime() {
    return zoomOpen && zoomTime != null ? zoomTime : globalTime;
  }
  function nowMs() { return Date.now(); }
  // Synthetic catalogs are anchored to the scene clock (the same UTC instant the
  // other feeds are showing), which is not always the wall clock.
  function sceneNow() {
    try { return opt.clock ? opt.clock() : nowMs(); } catch (_e) { return nowMs(); }
  }
  function coverage(t = viewTime()) { return describe(catalog, t, nowMs()); }

  function paint(el, parts, t, allowAhead, fullTime) {
    const stamp = fullTime ? fmt : iso;
    const d = describe(catalog, t, nowMs());
    const ahead = d.state === 'frame' && d.showingFuture;
    el.dataset.uviState = ahead && !allowAhead ? 'gap' : d.state;
    const img = parts.img;
    // The side panel follows the global clock and never paints a future observation.
    // The aurora window may show that frame while naming it as ahead of now.
    const showImg = d.state === 'frame' && d.frame && d.frame.image && (allowAhead || !ahead);
    if (showImg) {
      if (img.getAttribute('src') !== d.frame.image) img.src = d.frame.image;
      img.hidden = false;
      img.alt = d.frame.synthetic ? 'Synthetic diagram, not an ESA SMILE image' : 'SMILE UVI QuickLook, preliminary and uncalibrated';
      parts.ph.hidden = true;
      parts.ph.textContent = '';
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      img.alt = '';
      parts.ph.hidden = false;
      parts.ph.textContent = d.state === 'off' ? FEED_OFF : ahead ? 'Ahead of now · not current' : NO_COVERAGE;
    }
    if (d.state === 'off') {
      parts.status.textContent = FEED_OFF;
      parts.times.textContent = catalog.reason && catalog.reason !== FEED_OFF ? catalog.reason : 'The globe is the Kp model, not a SMILE image.';
    } else if (showImg && ahead) {
      parts.status.textContent = 'Ahead of now · not current';
      const f = d.frame;
      parts.times.textContent = `observation ${stamp(f.obsTime)} · valid ${iso(f.validFrom)} – ${iso(f.validTo)}`;
    } else if (showImg) {
      const f = d.frame;
      const sceneLatest = latestAt(catalog.frames, globalTime);
      const isLatest = sceneLatest && f.id === sceneLatest.id;
      const ageBit = d.age ? `latest available, age ${d.age}` : 'latest available';
      const tag = f.synthetic ? 'SYNTHETIC · not ESA data' : QUALITY;
      parts.status.textContent = isLatest ? `${tag} · ${ageBit}` : `${tag} · not the latest frame`;
      const ret = Number.isFinite(f.retrievedAt) ? iso(f.retrievedAt) : '—';
      parts.times.textContent = `observation ${stamp(f.obsTime)} · retrieved ${ret} · valid ${iso(f.validFrom)} – ${iso(f.validTo)}`;
    } else if (ahead) {
      parts.status.textContent = 'Ahead of now · not current';
      parts.times.textContent = `observation ${iso(d.frame.obsTime)} is after ${iso(nowMs())}`;
    } else {
      parts.status.textContent = NO_COVERAGE;
      parts.times.textContent = d.prior && d.prior.obsTime < t
        ? `Last observation ${iso(d.prior.obsTime)} (${fmtAge(t - d.prior.obsTime) || '0 s'} before this time), not held.`
        : 'No earlier frame.';
    }
    parts.latest.textContent = d.state === 'off' ? '' : (d.age ? `latest available, age ${d.age}` : 'latest available, age —');
  }

  function paintAll() {
    // Side panel stays on the global clock, including while the aurora window is open.
    paint(root, panel, globalTime, false, false);
    const heard = describe(catalog, globalTime, nowMs());
    const sample = uviSample(voice, heard.state === 'frame' && !heard.showingFuture ? heard : { state: 'gap' });
    root.dataset.uviAudio = sample ? 'note' : 'silent';
    if (zoomOpen) {
      paint(zoomEl, zoom, zoomTime ?? globalTime, true, true);
      const slot = zoomEl.querySelector('[data-uvi-slot]');
      if (slot) slot.textContent = opt.slotLabel ? opt.slotLabel() : 'The global timeline is unchanged.';
      syncRange();
    }
    const msg = root.querySelector('[data-uvi-msg]');
    if (msg) {
      msg.hidden = !message;
      msg.textContent = message;
    }
  }

  function rangeBounds() {
    const frames = catalog.frames || [];
    if (!frames.length) return null;
    const a = frames[0].validFrom;
    const b = frames[frames.length - 1].validTo;
    if (!(b > a)) return null;
    return [a, b];
  }
  function syncRange() {
    const range = zoomEl.querySelector('[data-uvi-range]');
    const lab = zoomEl.querySelector('[data-uvi-range-label]');
    const bounds = rangeBounds();
    if (!range || !bounds) {
      if (lab) lab.textContent = 'No frames in this session.';
      return;
    }
    range.min = String(bounds[0]);
    range.max = String(bounds[1]);
    range.step = '1000';
    const t = Math.min(bounds[1], Math.max(bounds[0], zoomTime ?? globalTime));
    if (document.activeElement !== range) range.value = String(t);
    if (lab) lab.textContent = iso(t);
  }

  function openZoom() {
    if (!catalog.enabled) {
      message = 'The aurora window opens once a catalog is loaded. The feed is still off.';
      paintAll();
      return;
    }
    zoomOpen = true;
    const bounds = rangeBounds();
    zoomTime = bounds ? Math.min(bounds[1] - 1, Math.max(bounds[0], globalTime)) : globalTime;
    if (typeof zoomEl.showModal === 'function' && !zoomEl.open) zoomEl.showModal();
    else zoomEl.hidden = false;
    paintAll();
  }
  function closeZoom() {
    zoomOpen = false;
    zoomTime = null;
    if (typeof zoomEl.close === 'function' && zoomEl.open) zoomEl.close();
    else zoomEl.hidden = true;
    paintAll();
  }
  function seek(t) {
    if (!Number.isFinite(t)) return;
    zoomOpen = true;
    if (typeof zoomEl.showModal === 'function' && !zoomEl.open) zoomEl.showModal();
    zoomTime = t;
    paintAll();
  }

  async function loadUrl(url, kind) {
    message = '';
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    const raw = await r.json();
    const base = new URL(url, location.href).href;
    catalog = normalizeCatalog(raw, base, sceneNow(), defaults);
    if (kind === 'synthetic') catalog.synthetic = true;
    message = catalog.synthetic
      ? 'Synthetic diagrams only. These are not ESA images.'
      : 'Catalog loaded for this session. It is not saved, and it is not called live.';
    paintAll();
    if (opt.onChange) opt.onChange();
  }

  async function applySearch(params) {
    const q = (params.get('uvi') || '').toLowerCase();
    try {
      if (q === 'synthetic') { await loadUrl(defaults.syntheticCatalog, 'synthetic'); return; }
      if (q === 'local' || (q !== '0' && q !== 'off' && defaults.loadLocalCatalog)) {
        await loadUrl(defaults.localCatalog, 'local'); return;
      }
    } catch (e) {
      catalog = offCatalog(FEED_OFF);
      message = q === 'local' || defaults.loadLocalCatalog
        ? 'Local catalog not found. ' + FEED_OFF
        : (e.message || String(e));
    }
    paintAll();
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.uvi;
    if (act === 'info') {
      infoOpen = !infoOpen;
      const det = root.querySelector('.uvi-cite');
      if (det) det.open = infoOpen;
      b.setAttribute('aria-expanded', infoOpen ? 'true' : 'false');
    } else if (act === 'zoom') openZoom();
    else if (act === 'synthetic') { try { await loadUrl(defaults.syntheticCatalog, 'synthetic'); } catch (err) { message = err.message || String(err); paintAll(); } }
    else if (act === 'local') { try { await loadUrl(defaults.localCatalog, 'local'); } catch (err) { catalog = offCatalog(FEED_OFF); message = 'Local catalog not found. ' + FEED_OFF; paintAll(); } }
    else if (act === 'clear') { catalog = offCatalog(); message = ''; paintAll(); if (opt.onChange) opt.onChange(); }
    else if (act === 'url') {
      const input = root.querySelector('[data-uvi-url]');
      const href = safeHttp(input && input.value);
      if (!href) { message = 'Enter an http(s) catalog URL. It stays in this tab only.'; paintAll(); return; }
      try { await loadUrl(href, 'url'); } catch (err) { message = err.message || String(err); paintAll(); }
    }
  });
  zoomEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.uvi === 'zoom-close') closeZoom();
    else if (b.dataset.uvi === 'prev' || b.dataset.uvi === 'next') stepFrame(b.dataset.uvi === 'next' ? 1 : -1);
  });
  zoomEl.addEventListener('cancel', (e) => {
    e.preventDefault();
    escArmed = true;
    closeZoom();
  });
  zoomEl.addEventListener('close', () => { zoomOpen = false; zoomTime = null; paintAll(); });
  zoomEl.addEventListener('input', (e) => {
    if (!e.target.matches('[data-uvi-range]')) return;
    zoomTime = +e.target.value;
    paintAll();
  });

  function stepFrame(dir) {
    const frames = catalog.frames || [];
    if (!frames.length) return;
    const t = zoomTime ?? globalTime;
    if (dir > 0) {
      const n = frames.find((f) => f.obsTime > t);
      if (n) zoomTime = n.obsTime;
    } else {
      let prev = null;
      for (const f of frames) { if (f.obsTime < t) prev = f; else break; }
      if (!prev) return;
      if (t >= prev.validFrom && t < prev.validTo) {
        const i = frames.indexOf(prev);
        if (i > 0) zoomTime = frames[i - 1].obsTime;
      } else zoomTime = prev.obsTime;
    }
    paintAll();
  }

  function shortStatus() {
    const d = coverage(globalTime);
    if (d.state === 'off') return 'off';
    if (d.state === 'gap') return 'no coverage';
    if (d.showingFuture) return 'not current';
    return d.age ? 'age ' + d.age : 'in view';
  }

  paintAll();
  return {
    sync(t) { if (Number.isFinite(t)) globalTime = t; paintAll(); },
    applySearch,
    openZoom,
    closeZoom,
    seek,
    zoomOpen: () => zoomOpen,
    consumeEscape() { const v = escArmed; escArmed = false; return v; },
    shortStatus,
    coverage,
    voice,
    get catalog() { return catalog; },
    get viewTime() { return viewTime(); },
    get globalTime() { return globalTime; },
  };
}

function safeHttp(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  let u;
  try { u = new URL(t, location.href); } catch (_e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.href;
}
