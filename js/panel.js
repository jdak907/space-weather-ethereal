import { ORDER, SET_INFO, PRESETS, INSTS, LENS, METERS, SCALES, DELAYS, MODES, OCTS, SHIFTS, VOLS, PANS, BPMS, REV_MIX, REV_LEN, FBS, DMIX, noteColor, noteName } from './orchestra.js';

// The collapsible "Orchestra" panel: transport, presets, rhythm, effects, and a mixer row per data set.
const pct = (n) => Math.round(n * 100) + '%';
const sel = (key, opts0, val, title) => {
  // a preset may use a value that isn't in the menu (for example 55% reverb); show it anyway
  const opts = opts0.some(([v]) => String(v) === String(val)) ? opts0 : [...opts0, [val, typeof val === 'number' && val <= 1 && val > 0 && key !== 'pan' ? pct(val) : String(val)]];
  return `<label class="f"><span>${title}</span><select data-k="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
};

export function buildPanel(root, orch, opts) {
  const o = orch;
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
      <p class="o-note">One step = one 3-hour Kp reading. Daily sets hold for 8 steps; the 24-hour solar wind sets loop. Pitch: each reading snapped to the scale over 3 octaves from A2. Color: hue = pitch class × 30° (C = red), darker = lower octave.</p>`;
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'play') { if (o.playing) o.pause(); else await opts.play(); }
    else if (b.dataset.act === 'stop') o.stop();
    else if (b.dataset.act === 'close') { opts.close(); return; }
    else if (b.dataset.preset) { o.applyPreset(b.dataset.preset); opts.changed(); }
    else if (b.dataset.ch) {
      const id = b.closest('.o-ch').dataset.id, k = b.dataset.ch; o.ch[id][k] = !o.ch[id][k];
      if (k === 'solo' && o.ch[id].solo) o.ch[id].on = true;
      o.preset = ''; o.refresh(); opts.changed();
    }
    render();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
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
