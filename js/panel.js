import { autoMode } from './spatial.js';
import { ORDER, SET_INFO, PRESETS, INSTS, LENS, METERS, SCALES, DELAYS, MODES, OCTS, SHIFTS, VOLS, PANS, BPMS, REV_MIX, REV_LEN, FBS, DMIX, noteColor, noteName } from './orchestra.js';

// The collapsible "Orchestra" panel: transport, presets, rhythm, effects, and a mixer row per data set.
const pct = (n) => Math.round(n * 100) + '%';
const sel = (key, opts0, val, title) => {
  // a preset may use a value that isn't in the menu (for example 55% reverb); show it anyway
  const opts = opts0.some(([v]) => String(v) === String(val)) ? opts0 : [...opts0, [val, typeof val === 'number' && val <= 1 && val > 0 && key !== 'pan' ? pct(val) : String(val)]];
  return `<label class="f"><span>${title}</span><select data-k="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
};

const fmtDur = (ms) => { const m = ms / 60e3; return m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h'; };
const tsel = (key, opts, val, title) => `<label class="f"><span>${title}</span><select data-tl="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
export function buildPanel(root, orch, opts) {
  const o = orch;
  let testLabel = '';
  const OUT = [['auto', 'Auto'], ['stereo', 'Stereo'], ['hrtf', 'Headphones 3D'], ['5.1', '5.1 surround'], ['7.1', '7.1 surround']];
  const MODE_NAME = { stereo: 'Stereo', hrtf: 'Headphones 3D (HRTF)', '5.1': '5.1 surround (VBAP)', '7.1': '7.1 surround (VBAP)' };
  function outSection() {
    const info = o.outputInfo(), av = info.available, known = info.maxCh !== null;
    const opt = ([v, l]) => {
      const dis = (v === '5.1' || v === '7.1') && !av[v];
      const lab = v === 'auto' && known ? `Auto (${MODE_NAME[autoMode(info.maxCh)]})` : l + (dis ? (known ? ' (not available)' : ' (start sound to detect)') : '');
      return `<option value="${v}"${info.want === v ? ' selected' : ''}${dis ? ' disabled' : ''}>${lab}</option>`;
    };
    const now = info.mode ? `${MODE_NAME[info.mode]} · ${info.channels} ch (${info.order})` : 'starts with the sound';
    return `<div class="o-tl o-out" id="o-out">
        <div class="o-tl-h">Output <small>${known ? `this device reports ${info.maxCh} output channel${info.maxCh === 1 ? '' : 's'}` : 'channels are detected when sound starts'}</small></div>
        <div class="o-row">
          <label class="f"><span>Output</span><select data-out="1" id="o-out-sel">${OUT.map(opt).join('')}</select></label>
          <button data-act="sptest" id="o-sptest">${o.testing ? '■ Stop test' : '♪ Speaker test'}</button>
          <span class="o-sptest-l" id="o-sptest-l">${testLabel}</span>
        </div>
        <div class="o-tl-s">Now: ${now}. ${info.mode === 'hrtf' ? 'Use headphones: sounds sit where their data lives in the scene and move as you orbit and zoom.' : info.mode === '5.1' || info.mode === '7.1' ? 'Each voice is panned to the speakers from its place in the scene; the Schumann drone also feeds the subwoofer.' : 'Pan knobs set each voice. Pick Headphones 3D for spatial sound.'}</div>
      </div>`;
  }
  function render() {
    const solo = o.anySolo();
    root.innerHTML = `
      <div class="o-head"><b>Orchestra</b><span class="o-sub">the Sonifier, playing the data you see</span><button class="o-x" data-act="close" aria-label="Close panel">×</button></div>
      <div class="o-row">
        <button class="o-play ${o.playing ? 'on' : ''}" data-act="play">${o.playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button data-act="stop">■ Stop</button>
        <span class="o-pos" id="o-pos"></span>
      </div>
      <div class="o-row o-presets">${Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}" class="${o.preset === k ? 'on' : ''}">${p.label}</button>`).join('')}${o.preset === '' ? '<span class="o-custom">Custom</span>' : ''}</div>
      <div class="o-grid">
        ${sel('bpm', BPMS.map((b) => [b, b + ' BPM']), o.bpm, 'Tempo')}
        ${sel('len', Object.entries(LENS).map(([k, v]) => [k, v.label]), o.len, 'Note length')}
        ${sel('meter', Object.entries(METERS).map(([k, v]) => [k, v.label]), o.meter, 'Grouping')}
        ${sel('scale', Object.entries(SCALES).map(([k, v]) => [k, v.label]), o.scale, 'Scale')}
        ${sel('revMix', REV_MIX.map((n) => [n, pct(n)]), o.fx.revMix, 'Reverb mix')}
        ${sel('revLen', REV_LEN.map((n) => [n, n + ' s']), o.fx.revLen, 'Reverb length')}
        ${sel('dly', Object.entries(DELAYS).map(([k, v]) => [k, v.label]), o.fx.dly, 'Delay time')}
        ${sel('fb', FBS.map((n) => [n, pct(n)]), o.fx.fb, 'Delay repeats')}
        ${sel('dmix', DMIX.map((n) => [n, pct(n)]), o.fx.dmix, 'Delay mix')}
        ${sel('strip', ORDER.map((id) => [id, SET_INFO[id].short]), opts.stripSet(), 'Strip shows')}
      </div>
      <div class="o-tl">
        <div class="o-tl-h">Timeline <small>one UTC clock for every data set · solar wind shifted from L1 to Earth arrival</small></div>
        <div class="o-grid">
          ${tsel('window', [['1d', 'Last 24 hours'], ['3d', 'Last 3 days'], ['7d', 'Last 7 days'], ['27d', 'Last 27 days'], ['all', 'Everything (~135 days)']], o.tl.window, 'Window')}
          ${tsel('barsPerDay', [[1, '1 day = 1 bar'], [2, '1 day = 2 bars'], [4, '1 day = 4 bars'], [8, '1 day = 8 bars'], [16, '1 day = 16 bars'], [32, '1 day = 32 bars']], o.tl.barsPerDay, 'Compression')}
        </div>
        <div class="o-row o-toggles">
          <label title="Speed through quiet stretches (3x) and slow down near flares, proton events, southward Bz and storms (8x slower)"><input type="checkbox" data-tlc="eventMode" ${o.tl.eventMode ? 'checked' : ''}> Event mode</label>
          <label title="An illustrative textbook storm sequence. Not real data."><input type="checkbox" data-tlc="demo" ${opts.demo() ? 'checked' : ''}> Typical storm demo <em>(not real data)</em></label>
        </div>
        <div class="o-tl-s">${o.N} steps · one step ≈ ${fmtDur(o.slotMs)} of real time${o.tl.eventMode ? ' (stretched near events)' : ''} · ${o.chains ? o.chains.length : 0} events on the timeline</div>
      </div>
      ${outSection()}
      <div class="o-row o-toggles">
        <label><input type="checkbox" data-t="loop" ${o.loop ? 'checked' : ''}> Loop</label>
        <label><input type="checkbox" data-t="marker" ${o.marker ? 'checked' : ''}> Rotation marker</label>
        <label><input type="checkbox" data-t="follow" ${opts.get('follow') ? 'checked' : ''}> Scenes follow playhead</label>
        <label><input type="checkbox" data-t="tourSolo" ${opts.get('tourSolo') ? 'checked' : ''}> Tour follows solo</label>
        <label><input type="checkbox" data-t="strip" ${opts.get('strip') ? 'checked' : ''}> Bartels strip</label>
      </div>
      <div class="o-mixer">
        ${ORDER.map((id) => {
          const c = o.ch[id], ln = o.lastNote[id];
          const status = !c.on ? 'Off' : c.mute ? 'Muted' : solo && !c.solo ? 'Silent (solo elsewhere)' : c.solo ? 'Solo' : 'On';
          return `<div class="o-ch ${c.on ? '' : 'off'}" data-id="${id}">
            <div class="o-name"><span class="o-sw" id="sw-${id}" style="background:${ln ? noteColor(ln.midi) : 'rgba(255,255,255,.15)'}"></span><span>${SET_INFO[id].short}</span><small id="nn-${id}">${ln ? noteName(ln.midi) : ''}</small><em>${SET_INFO[id].domain} · ${status}</em></div>
            <div class="o-btns">
              <button data-ch="on" class="${c.on ? 'on' : ''}">On</button>
              <button data-ch="solo" class="${c.solo ? 'on solo' : ''}">Solo</button>
              <button data-ch="mute" class="${c.mute ? 'on mute' : ''}">Mute</button>
            </div>
            <div class="o-sels">
              ${sel('inst', INSTS, c.inst, 'Voice')}
              ${sel('mode', MODES, c.mode, 'Plays')}
              ${sel('oct', OCTS, c.oct, 'Octave')}
              ${sel('trans', SHIFTS, c.trans, 'Shift')}
              ${sel('vol', VOLS.map((v) => [v, pct(v)]), c.vol, 'Volume')}
              ${sel('pan', PANS, c.pan, 'Pan')}
            </div>
          </div>`;
        }).join('')}
      </div>
      <p class="o-note">Every set is read at the playhead's UTC time and held only over its own cadence (Kp 3-hourly, Ap/F10.7/sunspots daily, wind 10-min means, X-rays 10-min maxima); silent where a set has no reading. Pitch: each reading snapped to the scale over 3 octaves from A2. Schumann (modeled): its five mode frequencies × 16 (4 octaves up: 125, 229, 333, 437, 541 Hz) as one drone; more lightning = more modes ring. Color: hue = pitch class × 30° (C = red), darker = lower octave.</p>`;
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'play') { if (o.playing) o.pause(); else await opts.play(); }
    else if (b.dataset.act === 'stop') o.stop();
    else if (b.dataset.act === 'close') { opts.close(); return; }
    else if (b.dataset.act === 'sptest') {
      if (o.testing) { o.testing = false; return; }
      o.speakerTest((name, i, n) => {
        testLabel = name ? `${i + 1}/${n}: <b>${name}</b>` : 'done';
        const l = root.querySelector('#o-sptest-l'); if (l) l.innerHTML = testLabel;
        const bt = root.querySelector('#o-sptest'); if (bt) bt.textContent = name ? '■ Stop test' : '♪ Speaker test';
      });
      render(); return;
    }
    else if (b.dataset.preset) { o.applyPreset(b.dataset.preset); opts.changed(); }
    else if (b.dataset.ch) {
      const id = b.closest('.o-ch').dataset.id, k = b.dataset.ch; o.ch[id][k] = !o.ch[id][k];
      if (k === 'solo' && o.ch[id].solo) o.ch[id].on = true;
      if ((k === 'solo' || k === 'on') && o.ch[id].on && opts.jumpTo) opts.jumpTo(id); // short records (solar wind ~24 h): jump to where the set has data
      o.preset = ''; o.refresh(); opts.changed();
    }
    render();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.out) { o.setOutput(t.value); render(); return; }
    if (t.dataset.tl) { orch.tl[t.dataset.tl] = t.dataset.tl === 'barsPerDay' ? +t.value : t.value; orch.retime(); opts.changed(); render(); return; }
    if (t.dataset.tlc) { if (t.dataset.tlc === 'demo') opts.setDemo(t.checked); else { orch.tl.eventMode = t.checked; orch.retime(); opts.changed(); } render(); return; }
    if (t.dataset.t) { const k = t.dataset.t; if (k === 'loop' || k === 'marker') o[k] = t.checked; else opts.set(k, t.checked); return; }
    const k = t.dataset.k; if (!k) return;
    const chEl = t.closest('.o-ch');
    const num = (x) => (isNaN(Number(x)) ? x : Number(x));
    if (chEl) { o.ch[chEl.dataset.id][k] = num(t.value); o.preset = ''; }
    else if (k === 'strip') { opts.setStrip(t.value); return; }
    else if (['revMix', 'revLen', 'dly', 'fb', 'dmix'].includes(k)) { o.fx[k] = num(t.value); o.preset = ''; }
    else { o[k] = k === 'meter' ? t.value : num(t.value); o.preset = ''; }
    o.refresh(); opts.changed(); render();
  });
  render();
  return { render };
}
