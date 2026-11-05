// Spatial audio for the orchestra: one output stage with four modes.
//   stereo : the original StereoPanner per voice (the fallback; always works)
//   hrtf   : headphones 3D. Each voice is a PannerNode (HRTF, inverse distance) at the place in the
//            current scene where its data "lives"; the AudioListener follows the Three.js camera.
//   5.1/7.1: discrete multichannel. Each voice is panned with 2D VBAP (Pulkki 1997) onto ITU speaker
//            angles; elevation spreads energy over all speakers; the Schumann drone also feeds LFE.
// Reverb and delay stay shared sends (they are fed before the spatial stage), returned to the
// fronts in stereo/3D and to fronts + surrounds in 5.1/7.1.
//
// Channel order. Web Audio defines 6 channels as L R C LFE SL SR (spec, "speakers" up/down-mix).
// For 8 channels Chrome's CHANNEL_LAYOUT_7_1 is L R C LFE BL BR SL SR (media/base/channel_layout.cc,
// the WAVE/WAVEFORMATEXTENSIBLE order: back pair before side pair). Whether the OS, driver and AV
// receiver put those on the right physical speakers is [VERIFY] per system: use the Speaker test.
import * as THREE from 'three';

const D2R = Math.PI / 180;
// azimuth in degrees, positive = to the listener's left (ITU-R BS.775 convention), null = LFE
export const LAYOUTS = {
  '5.1': { n: 6, lfe: 3, names: ['Front left', 'Front right', 'Center', 'LFE (subwoofer)', 'Surround left', 'Surround right'],
    short: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'], az: [30, -30, 0, null, 110, -110] },
  '7.1': { n: 8, lfe: 3, names: ['Front left', 'Front right', 'Center', 'LFE (subwoofer)', 'Rear left', 'Rear right', 'Side left', 'Side right'],
    short: ['L', 'R', 'C', 'LFE', 'Lb', 'Rb', 'Ls', 'Rs'], az: [30, -30, 0, null, 135, -135, 90, -90] },
};
// which output modes a device offers, from AudioContext.destination.maxChannelCount
export function availableModes(maxCh) {
  return { stereo: true, hrtf: true, '5.1': maxCh >= 6, '7.1': maxCh >= 8 };
}
// Auto: surround when the device reports it, otherwise plain stereo (browsers cannot tell
// headphones from speakers, so 3D is never forced on loudspeakers or phone speakers)
export function autoMode(maxCh) { return maxCh >= 8 ? '7.1' : maxCh >= 6 ? '5.1' : 'stereo'; }
export function resolveMode(want, maxCh) {
  const av = availableModes(maxCh);
  if (want === 'auto' || !want) return autoMode(maxCh);
  return av[want] ? want : 'stereo';
}

// 2D VBAP over the layout's full-range speakers; returns one gain per channel (LFE = 0), unit power
export function vbapGains(layout, azDeg, elDeg = 0) {
  const L = LAYOUTS[layout], idx = [];
  L.az.forEach((a, i) => { if (a !== null) idx.push(i); });
  idx.sort((i, j) => L.az[i] - L.az[j]);
  const g = new Array(L.n).fill(0);
  const az = (((azDeg + 180) % 360) + 360) % 360 - 180;
  const px = Math.cos(az * D2R), py = Math.sin(az * D2R);
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k], j = idx[(k + 1) % idx.length];
    let a1 = L.az[i], a2 = L.az[j]; if (a2 <= a1) a2 += 360;
    let t = az; if (t < a1) t += 360;
    if (t < a1 - 1e-9 || t > a2 + 1e-9) continue;
    const c1 = Math.cos(a1 * D2R), s1 = Math.sin(a1 * D2R), c2 = Math.cos(a2 * D2R), s2 = Math.sin(a2 * D2R);
    const det = c1 * s2 - c2 * s1;
    let g1 = (px * s2 - py * c2) / det, g2 = (py * c1 - px * s1) / det;
    g1 = Math.max(0, g1); g2 = Math.max(0, g2);
    const nrm = Math.hypot(g1, g2) || 1; g[i] = g1 / nrm; g[j] = g2 / nrm;
    break;
  }
  // elevation: sources overhead (or far below) spread over every speaker, keeping total power
  const w = Math.min(1, Math.abs(Math.sin(elDeg * D2R)));
  if (w > 0) { const ns = idx.length; for (const i of idx) g[i] = Math.sqrt((1 - w) * g[i] * g[i] + w / ns); }
  return g;
}

// direction of a world point as seen from a camera: azimuth (+left), elevation, distance
const _v = new THREE.Vector3();
export function direction(camera, p) {
  _v.copy(p).applyMatrix4(camera.matrixWorldInverse);
  const d = _v.length();
  return { az: Math.atan2(-_v.x, -_v.z) / D2R, el: Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) / D2R, d };
}

const setP = (param, v, t, tc) => { if (!param) return; if (tc) param.setTargetAtTime(v, t, tc); else param.setValueAtTime(v, t); };

export class Spatial {
  // ctx: (Offline)AudioContext; dryOut: node that the positioned (dry) voices feed;
  // wetIn: node that collects the reverb/delay returns; master/comp: the output chain to destination
  constructor(ctx, { dryOut, wetIn, master, comp }) {
    this.ctx = ctx; this.dryOut = dryOut; this.wetIn = wetIn; this.master = master; this.comp = comp;
    this.maxCh = this.devMax = ctx.destination.maxChannelCount || 2;
    this.want = 'auto'; this.mode = null; this.voices = {}; this.refDist = 1; this.stats = { listenerUpdates: 0, builds: 0 };
    this.setMode('auto');
  }
  get available() { return availableModes(this.maxCh); }
  // the media-element route (AirPlay / iOS media) is stereo: cap the channels, or pass null to restore
  capChannels(n) {
    const m = n ? Math.min(this.devMax, n) : this.devMax; if (m === this.maxCh) return this.mode;
    this.maxCh = m; return this.setMode(this.want);
  }
  get layout() { return LAYOUTS[this.mode] || null; }
  // (re)wire the output format for a mode
  setMode(want) {
    let mode = resolveMode(want, this.maxCh); this.want = want || 'auto';
    if (mode === this.mode) return mode;
    const ctx = this.ctx, dst = ctx.destination;
    let n = LAYOUTS[mode] ? LAYOUTS[mode].n : 2;
    // a device can report more channels than it accepts; if so, stay in stereo
    try { if (dst.channelCount !== n) dst.channelCount = n; } catch (_e) { this.error = `device refused ${n} channels`; mode = 'stereo'; n = 2; try { dst.channelCount = 2; } catch (_e2) { /* offline: fixed */ } }
    if (mode === this.mode) return mode;
    // tear down the old per-voice stage
    for (const id in this.voices) this.dropVoice(id);
    try { this.wetIn.disconnect(); } catch (_e) { /* first time */ }
    if (this.merger) { try { this.merger.disconnect(); } catch (_e) { /* gone */ } this.merger = null; }
    if (this.wetUp) { this.wetUp.forEach((x) => { try { x.disconnect(); } catch (_e) { /* gone */ } }); this.wetUp = null; }
    // output format: discrete N channels for surround, the default 2-channel speaker mix otherwise
    const fmt = (node, explicit) => { node.channelCount = n; node.channelCountMode = explicit ? 'explicit' : 'max'; node.channelInterpretation = n > 2 ? 'discrete' : 'speakers'; };
    dst.channelInterpretation = n > 2 ? 'discrete' : 'speakers';
    fmt(this.comp, true); fmt(this.master, false); fmt(this.dryOut, false);
    if (n > 2) {
      this.merger = ctx.createChannelMerger(n); this.merger.connect(this.dryOut);
      // wet returns (stereo) -> fronts and surrounds (and sides in 7.1), slightly lower behind
      const sp = ctx.createChannelSplitter(2); this.wetIn.connect(sp);
      const L = LAYOUTS[mode], pairs = mode === '7.1' ? [[0, 1, 1], [6, 7, 0.8], [4, 5, 0.7]] : [[0, 1, 1], [4, 5, 0.75]];
      const ups = [sp];
      for (const [l, r, a] of pairs) {
        const gl = ctx.createGain(), gr = ctx.createGain(); gl.gain.value = a; gr.gain.value = a;
        sp.connect(gl, 0); sp.connect(gr, 1); gl.connect(this.merger, 0, l); gr.connect(this.merger, 0, r); ups.push(gl, gr);
      }
      void L; this.wetUp = ups;
    } else this.wetIn.connect(this.master);
    this.mode = mode; this.stats.builds++;
    for (const id in this.inputs || {}) this.buildVoice(id);
    return mode;
  }
  // a voice's input node (the channel gain feeds it). Rebuilt behind the scenes on mode change.
  input(id) {
    this.inputs = this.inputs || {};
    if (!this.inputs[id]) { this.inputs[id] = this.ctx.createGain(); this.buildVoice(id); }
    return this.inputs[id];
  }
  buildVoice(id) {
    const ctx = this.ctx, inp = this.inputs[id], v = { id };
    if (this.mode === 'hrtf') {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = this.refDist; p.maxDistance = 1e4; p.rolloffFactor = 1; p.coneInnerAngle = 360; p.coneOuterAngle = 360;
      inp.connect(p); p.connect(this.dryOut); v.p = p; v.kind = 'hrtf';
    } else if (this.layout) {
      const L = this.layout; v.g = [];
      for (let i = 0; i < L.n; i++) {
        if (i === L.lfe) { v.g.push(null); continue; }
        const g = ctx.createGain(); g.gain.value = i === 2 ? 1 : 0; inp.connect(g); g.connect(this.merger, 0, i); v.g.push(g);
      }
      if (id === 'sr') { // the low Schumann drone also feeds the subwoofer channel
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 0.5;
        const lg = ctx.createGain(); lg.gain.value = 0.5; inp.connect(lp); lp.connect(lg); lg.connect(this.merger, 0, L.lfe); v.lfe = [lp, lg];
      }
      v.kind = 'vbap';
    } else {
      const p = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      if (p) { inp.connect(p); p.connect(this.dryOut); p.pan.value = this.pans?.[id] ?? 0; } else inp.connect(this.dryOut);
      v.sp = p; v.kind = 'stereo';
    }
    this.voices[id] = v;
  }
  dropVoice(id) {
    const v = this.voices[id], inp = this.inputs && this.inputs[id]; if (!v) return;
    try { inp.disconnect(); } catch (_e) { /* gone */ }
    [v.p, v.sp, ...(v.g || []), ...(v.lfe || [])].forEach((x) => { if (x) try { x.disconnect(); } catch (_e) { /* gone */ } });
    delete this.voices[id];
  }
  // stereo mode keeps the mixer's Pan control
  setPan(id, pan) { this.pans = this.pans || {}; this.pans[id] = pan; const v = this.voices[id]; if (v && v.sp) v.sp.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05); }
  setRefDistance(r) { this.refDist = r; for (const id in this.voices) { const v = this.voices[id]; if (v.p) v.p.refDistance = r; } }
  // per frame: listener = camera; each voice at its anchor
  update(camera, anchorOf, tc = 0.06) {
    if (this.mode === 'stereo') return;
    const t = this.ctx.currentTime; camera.updateMatrixWorld();
    if (this.mode === 'hrtf') {
      const L = this.ctx.listener, e = camera.matrixWorld.elements;
      const pos = camera.getWorldPosition(new THREE.Vector3());
      const fwd = new THREE.Vector3(-e[8], -e[9], -e[10]).normalize(), up = new THREE.Vector3(e[4], e[5], e[6]).normalize();
      if (L.positionX) {
        setP(L.positionX, pos.x, t, tc); setP(L.positionY, pos.y, t, tc); setP(L.positionZ, pos.z, t, tc);
        setP(L.forwardX, fwd.x, t, tc); setP(L.forwardY, fwd.y, t, tc); setP(L.forwardZ, fwd.z, t, tc);
        setP(L.upX, up.x, t, tc); setP(L.upY, up.y, t, tc); setP(L.upZ, up.z, t, tc);
      } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
      this.lastListener = { pos: pos.toArray(), fwd: fwd.toArray(), up: up.toArray() };
      for (const id in this.voices) {
        const v = this.voices[id], a = anchorOf(id); if (!a || !v.p) continue;
        if (v.p.positionX) { setP(v.p.positionX, a.x, t, tc); setP(v.p.positionY, a.y, t, tc); setP(v.p.positionZ, a.z, t, tc); } else v.p.setPosition(a.x, a.y, a.z);
        v.pos = a.toArray();
      }
    } else {
      for (const id in this.voices) {
        const v = this.voices[id], a = anchorOf(id); if (!a || !v.g) continue;
        const dir = direction(camera, a), gains = vbapGains(this.mode, dir.az, dir.el);
        const att = Math.min(1, this.refDist / Math.max(this.refDist, dir.d)) ** 0.5; // gentler than HRTF's inverse law
        v.g.forEach((g, i) => { if (g) setP(g.gain, gains[i] * att, t, tc); });
        v.dir = dir;
      }
    }
    this.stats.listenerUpdates++;
  }
  // test a speaker: a short tone burst straight into one channel (or a direction in stereo/3D)
  ping(i, when = this.ctx.currentTime + 0.05) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    const L = this.layout, lfe = L && i === L.lfe;
    o.type = lfe ? 'sine' : 'triangle'; o.frequency.value = lfe ? 55 : 660;
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(0.35, when + 0.02); g.gain.setTargetAtTime(0, when + 0.45, 0.08);
    o.connect(g);
    let out;
    if (L) { g.connect(this.merger, 0, i); out = L.short[i]; }
    else if (this.mode === 'hrtf') {
      const az = [90, 0, -90, 180][i % 4] * D2R, p = ctx.createPanner(); p.panningModel = 'HRTF';
      // place 2 m away relative to the listener's current orientation
      const lp = this.lastListener || { pos: [0, 0, 0], fwd: [0, 0, -1], up: [0, 1, 0] };
      const f = new THREE.Vector3(...lp.fwd), u = new THREE.Vector3(...lp.up), r = new THREE.Vector3().crossVectors(f, u);
      const dir = f.clone().multiplyScalar(Math.cos(az)).addScaledVector(r, -Math.sin(az)).multiplyScalar(2 * this.refDist).add(new THREE.Vector3(...lp.pos));
      p.refDistance = this.refDist; if (p.positionX) { p.positionX.value = dir.x; p.positionY.value = dir.y; p.positionZ.value = dir.z; } else p.setPosition(dir.x, dir.y, dir.z);
      g.connect(p); p.connect(this.dryOut); out = ['Left', 'Front', 'Right', 'Behind'][i % 4];
    } else {
      const p = ctx.createStereoPanner(); p.pan.value = i % 2 ? 1 : -1; g.connect(p); p.connect(this.dryOut); out = i % 2 ? 'Right' : 'Left';
    }
    o.start(when); o.stop(when + 0.9);
    return out;
  }
  // the names the speaker test steps through
  testNames() {
    const L = this.layout;
    if (L) return L.names.map((nm, i) => `${L.short[i]} · ${nm}`);
    if (this.mode === 'hrtf') return ['Left', 'Front', 'Right', 'Behind'];
    return ['Left', 'Right'];
  }
  describe() {
    const L = this.layout;
    return { want: this.want, mode: this.mode, maxCh: this.maxCh, error: this.error || null, available: this.available, channels: L ? L.n : 2,
      order: L ? L.short.join(' ') : 'L R', destCount: this.ctx.destination.channelCount, destInterp: this.ctx.destination.channelInterpretation,
      voices: Object.fromEntries(Object.entries(this.voices).map(([k, v]) => [k, v.kind])), panning: this.mode === 'hrtf' ? 'HRTF' : this.mode === 'stereo' ? 'StereoPanner' : 'VBAP' };
  }
}

// ---------- where each voice sits in each scene (world coordinates of that scene)
// Sun: flare/active regions; solar wind: travelling pulses on the Parker spiral; magnetosphere: the bow
// shock and magnetopause noses and the poles; UV oval: points on the oval; aurora: the curtains;
// Schumann: the cavity over the busiest storm region. Geomagnetic indices sit "at Earth" where Earth
// is drawn, and toward Earth (off-screen) where it is not.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function anchorFor(s, id, t) {
  const H = s.hooks || {}, st = s.state || {};
  switch (s.id) {
    case 'sun': {
      const R = H.R || 10, nar = H.nar ? H.nar() : 4, ar = H.ar || [V(1, 0, 0)];
      const at = (i) => H.sun ? H.sun.localToWorld(ar[i % nar].clone().multiplyScalar(R * 1.05)) : ar[0].clone().multiplyScalar(R);
      if (id === 'xr') return at(H.flareIdx ? H.flareIdx() : 0);
      if (id === 'f107') return V(0, R * 0.2, 0);
      if (id === 'sn') return at(1);
      if (id === 'speed') return V(R * 2.2, R * 0.3, R * 1.2);
      if (id === 'dens') return V(R * 2.2, -R * 0.3, -R * 1.2);
      if (id === 'bz') return V(R * 1.6, R * 1.4, 0);
      return V(R * 6, 0, 0); // kp, ap, sr, marker: toward Earth
    }
    case 'wind': {
      const AU = H.AU || 60, k = H.U ? H.U.uK.value : 0.016, dist = H.U ? H.U.uDist.value : t * 3;
      const pulse = (ph) => { const r = 6 + (((dist * 0.6 + ph * AU) % (AU - 6)) + (AU - 6)) % (AU - 6); const a = k * (AU - r); return V(r * Math.cos(a), 0, r * Math.sin(a)); };
      if (id === 'speed') return pulse(0);
      if (id === 'dens') return pulse(0.5);
      if (id === 'bz') return H.imf ? H.imf.position.clone() : V(AU - 9, 0, 0);
      if (id === 'f107' || id === 'sn' || id === 'xr') return V(0, id === 'sn' ? 2 : id === 'xr' ? -2 : 0, 0);
      return V(AU, id === 'ap' ? -2 : id === 'kp' ? 2 : 0, 0);
    }
    case 'magneto': {
      const r0 = st.r0 || 10, xbs = st.xbs || 13;
      if (id === 'speed') return V(xbs, 2, 0);
      if (id === 'dens') return V(xbs, -2, 0);
      if (id === 'bz') return V(r0, 0, 0);
      if (id === 'kp') return V(0, 6, 0);
      if (id === 'ap') return V(0, -6, 0);
      if (id === 'sr') return V(0, 0, 0);
      return V(60, 0, 0); // the Sun's sets: far sunward
    }
    case 'oval': {
      const RE = H.RE || 8, kp = H.U ? H.U.uKp.value : 2, lat = (66 - 2 * kp) * D2R;
      const on = (az) => V(RE * Math.cos(lat) * Math.cos(az), RE * Math.sin(lat), RE * Math.cos(lat) * Math.sin(az));
      if (id === 'kp') return on(Math.PI);           // midnight sector, where substorms brighten
      if (id === 'ap') return on(-Math.PI / 2);
      if (id === 'bz') return on(0);                 // dayside cusp
      if (id === 'speed' || id === 'dens') return V(RE * 3, 0, id === 'dens' ? RE : -RE);
      if (id === 'sr') return V(0, 0, 0);
      return V(RE * 6, RE, 0);                        // toward the Sun (to the right)
    }
    case 'curtain': {
      const cs = H.curtains || [];
      const cur = (i, x) => { const c = cs[i]; if (!c) return V(x, 80, -200); const u = c.material.uniforms; return V(x, u.uBase.value + u.uH.value * 0.5, u.uZ.value); };
      if (id === 'kp') return cur(0, -40);
      if (id === 'ap') return cur(1, 50);
      if (id === 'bz') return V(0, 160, -40);       // overhead
      if (id === 'speed' || id === 'dens') return cur(2, id === 'speed' ? -110 : 110);
      if (id === 'sr') return V(0, -3, -6);         // underfoot: the ground-ionosphere cavity
      return V(0, 8, 200);                           // the Sun's sets: low in the south, behind you
    }
    case 'schumann': {
      const w = s.world, ax = H.axis || V(0, 0, 1), sd = H.sunDir || V(1, 0, 0);
      const toW = (p) => (w ? w.localToWorld(p) : p);
      if (id === 'sr') return toW(ax.clone().normalize().multiplyScalar(1.08));
      if (id === 'f107' || id === 'sn' || id === 'xr') return toW(sd.clone().normalize().multiplyScalar(6));
      if (id === 'kp') return toW(V(0, 1.15, 0));
      if (id === 'ap') return toW(V(0, -1.15, 0));
      return toW(sd.clone().normalize().multiplyScalar(2.5)); // solar wind: sunward
    }
    default: return V(0, 0, 0);
  }
}
