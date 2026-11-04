// The Space Weather Sonifier's sound engine and orchestra, ported from the Sonifier page to plain
// JavaScript. Seven data sets are seven players. One step = one 3-hour Kp reading (the master clock);
// daily sets hold their value for the 8 steps of each day; the 24-hour solar wind sets loop, one
// 10-minute reading per step. Web Audio only; nothing starts until the user presses a button.
export const MISSING = -900; // anything below this is a missing reading (-999 in the data)
const HOUR_MS = 3600e3;
export const ROT = 216; // steps in a 27-day Bartels rotation (27 days x 8 three-hour readings)
export const BARTELS_EPOCH = Date.UTC(1832, 1, 8);

export const ORDER = ['kp', 'ap', 'f107', 'sn', 'speed', 'dens', 'bz'];
export const SET_INFO = {
  kp: { label: 'Kp index (3-hourly)', short: 'Kp', unit: '', lo: 0, hi: 9, diverge: false, cycleH: 27 * 24, turnName: '27-day solar rotation', domain: 'Geomagnetic activity' },
  ap: { label: 'Ap index (daily)', short: 'Ap', unit: 'nT', lo: 0, hi: 80, diverge: false, cycleH: 27 * 24, turnName: '27-day solar rotation', domain: 'Geomagnetic activity' },
  f107: { label: 'Solar radio flux F10.7 (daily)', short: 'F10.7', unit: 'sfu', lo: 85, hi: 250, diverge: false, cycleH: 27 * 24, turnName: '27-day solar rotation', domain: 'The Sun' },
  sn: { label: 'Sunspot number (daily)', short: 'Sunspots', unit: '', lo: 0, hi: 140, diverge: false, cycleH: 27 * 24, turnName: '27-day solar rotation', domain: 'The Sun' },
  speed: { label: 'Solar wind speed (last 24 h)', short: 'Wind speed', unit: 'km/s', lo: 320, hi: 440, diverge: false, cycleH: 6, turnName: '6 hours', domain: 'Solar wind' },
  dens: { label: 'Solar wind density (last 24 h)', short: 'Density', unit: 'p/cm³', lo: 1, hi: 4, diverge: false, cycleH: 6, turnName: '6 hours', domain: 'Solar wind' },
  bz: { label: 'Magnetic field Bz (last 24 h)', short: 'Bz', unit: 'nT', lo: -8, hi: 8, diverge: true, cycleH: 6, turnName: '6 hours', domain: 'Magnetosphere' },
};

export const SCALES = {
  penta: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minpenta: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  minor: { label: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { label: 'Lydian (dreamy)', steps: [0, 2, 4, 6, 7, 9, 11] },
  whole: { label: 'Whole tone (eerie)', steps: [0, 2, 4, 6, 8, 10] },
  chromatic: { label: 'Chromatic (all 12 colors)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
export const INSTS = [
  ['eno', 'Airport piano'], ['pad', 'Slow pad, filter sweep'], ['shimmer', 'Shimmer glass'], ['choir', 'Soft choir'],
  ['bell', 'Long bell'], ['glass', 'Simple glass'], ['pluck', 'Pluck'],
];
export const LENS = {
  half: { label: 'Half note (2 beats)', beats: 2 }, quarter: { label: 'Quarter note', beats: 1 }, qtrip: { label: 'Quarter triplet', beats: 2 / 3 },
  eighth: { label: 'Eighth note', beats: 0.5 }, etrip: { label: 'Eighth triplet', beats: 1 / 3 }, sixteenth: { label: 'Sixteenth note', beats: 0.25 },
  strip: { label: 'Sixteenth triplet', beats: 1 / 6 },
};
export const METERS = {
  2: { label: 'Groups of 2', len: 2, sec: [] }, 3: { label: 'Groups of 3 (triplet feel)', len: 3, sec: [] },
  4: { label: '4 beats', len: 4, sec: [2] }, 5: { label: '5 (3 + 2)', len: 5, sec: [3] },
  68: { label: '6/8 (two groups of 3)', len: 6, sec: [3] }, 7: { label: '7 (2 + 2 + 3)', len: 7, sec: [2, 4] },
};
export const DELAYS = { e: { label: '1/8 note', beats: 0.5 }, de: { label: 'Dotted 1/8', beats: 0.75 }, q: { label: '1/4 note', beats: 1 }, h: { label: '1/2 note', beats: 2 } };
export const MODES = [['every', 'Every step'], ['n2', 'Every 2nd'], ['n4', 'Every 4th'], ['n8', 'Every 8th'], ['change', 'When it changes'], ['drone', 'Hold as drone']];
const MODE_N = { every: 1, n2: 2, n4: 4, n8: 8, change: 1, drone: 1 };
export const OCTS = [[-2, '2 oct down'], [-1, '1 oct down'], [0, 'Middle'], [1, '1 oct up'], [2, '2 oct up']];
export const SHIFTS = [[0, 'Root'], [3, 'Min 3rd up'], [4, 'Maj 3rd up'], [5, '4th up'], [7, '5th up'], [9, '6th up'], [-5, '5th down']];
export const VOLS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const PANS = [[-1, 'Left'], [-0.5, 'Left-center'], [0, 'Center'], [0.5, 'Right-center'], [1, 'Right']];
export const BPMS = [40, 50, 60, 66, 72, 80, 90, 100, 110, 120, 140, 160];
export const REV_MIX = [0, 0.15, 0.3, 0.45, 0.6, 0.8], REV_LEN = [3, 6, 9, 14], FBS = [0, 0.2, 0.35, 0.5, 0.65, 0.8], DMIX = [0, 0.15, 0.25, 0.4, 0.6];

const off = (inst, mode) => ({ on: false, solo: false, mute: false, inst, oct: 0, trans: 0, vol: 0.5, pan: 0, mode });
const on = (inst, mode, oct, trans, vol, pan) => ({ on: true, solo: false, mute: false, inst, oct, trans, vol, pan, mode });
export const PRESETS = {
  ambient: {
    label: 'Ambient orchestra', bpm: 72, len: 'eighth', meter: '4', scale: 'penta', fx: { revMix: 0.45, revLen: 9, dly: 'q', fb: 0.35, dmix: 0.25 },
    ch: { kp: on('eno', 'every', 0, 0, 0.8, 0), ap: off('bell', 'change'), f107: on('pad', 'drone', -1, 0, 0.45, -0.5), sn: on('choir', 'drone', 0, 7, 0.35, 0.5),
      speed: on('shimmer', 'n8', 1, 4, 0.3, 0.5), dens: off('glass', 'n4'), bz: off('pluck', 'n2') },
  },
  solo: {
    label: 'Solo Kp', bpm: 80, len: 'eighth', meter: '4', scale: 'penta', fx: { revMix: 0.4, revLen: 9, dly: 'q', fb: 0.3, dmix: 0.25 },
    ch: { kp: on('eno', 'every', 0, 0, 0.9, 0), ap: off('bell', 'change'), f107: off('pad', 'drone'), sn: off('choir', 'drone'),
      speed: off('shimmer', 'n8'), dens: off('glass', 'n4'), bz: off('pluck', 'n2') },
  },
  storm: {
    label: 'Storm ensemble', bpm: 112, len: 'eighth', meter: '7', scale: 'minpenta', fx: { revMix: 0.3, revLen: 6, dly: 'de', fb: 0.4, dmix: 0.3 },
    ch: { kp: on('bell', 'every', 0, 0, 0.7, 0), ap: on('pluck', 'change', 0, 7, 0.6, -0.5), f107: off('pad', 'drone'), sn: off('choir', 'drone'),
      speed: on('pad', 'drone', -1, 0, 0.45, 0), dens: on('glass', 'n4', 1, 3, 0.3, 0.5), bz: on('pluck', 'n2', 1, 0, 0.45, 0.5) },
  },
  all: {
    label: 'Everything on', bpm: 66, len: 'quarter', meter: '3', scale: 'lydian', fx: { revMix: 0.55, revLen: 14, dly: 'q', fb: 0.35, dmix: 0.2 },
    ch: { kp: on('eno', 'every', 0, 0, 0.75, 0), ap: on('bell', 'change', 1, 7, 0.35, -0.5), f107: on('pad', 'drone', -1, 0, 0.4, -0.5),
      sn: on('choir', 'drone', 0, 4, 0.3, 0.5), speed: on('shimmer', 'n4', 1, 0, 0.3, 0.5), dens: on('glass', 'n8', 1, 7, 0.25, -0.5), bz: on('pluck', 'n2', 0, 0, 0.3, 0.5) },
  },
};

// ---------- pitch and color
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const BASE_MIDI = 45; // A2, 110 Hz
export const toMidi = (t, steps) => { const total = steps.length * 3 + 1; const k = Math.round(t * (total - 1)); return BASE_MIDI + 12 * Math.floor(k / steps.length) + steps[k % steps.length]; };
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + String(Math.floor(m / 12) - 1);
// Chromatic color: hue = pitch class x 30 degrees on the HSL wheel, C anchored at red (0).
// Primaries land on C (red, 0), E (green, 120) and G# (blue, 240); secondaries on D (yellow, 60), F# (cyan, 180), A# (magenta, 300).
export const pcHue = (pc) => (((pc % 12) + 12) % 12) * 30;
export const octLight = (m) => { const o = Math.max(2, Math.min(5, Math.floor(m / 12) - 1)); return 34 + (o - 2) * 11; };
export const noteHSL = (m) => [pcHue(m), 88, octLight(m)];
export const noteColor = (m, alpha) => `hsl(${pcHue(m)} 88% ${octLight(m)}%${alpha !== undefined ? ' / ' + alpha : ''})`;
export const norm = (ds, x) => Math.max(0, Math.min(1, (x - ds.lo) / (ds.hi - ds.lo)));

// ---------- data sets from the visualizer's data object (snapshot + live)
export function buildSets(D) {
  const mk = (id, t0, stepMs, v) => ({ id, ...SET_INFO[id], start: t0, stepH: stepMs / HOUR_MS, v, daily: stepMs >= 24 * HOUR_MS });
  const S = {
    kp: mk('kp', D.kp.t0, D.kp.step, D.kp.v), ap: mk('ap', D.ap.t0, D.ap.step, D.ap.v), f107: mk('f107', D.f107.t0, D.f107.step, D.f107.v),
    sn: mk('sn', D.sn.t0, D.sn.step, D.sn.v), speed: mk('speed', D.sw.t0, D.sw.step, D.sw.speed), dens: mk('dens', D.sw.t0, D.sw.step, D.sw.dens),
    bz: mk('bz', D.sw.t0, D.sw.step, D.sw.bz),
  };
  // trim trailing missing Kp so the playhead ends at the newest real reading
  let n = S.kp.v.length; while (n > 1 && !(S.kp.v[n - 1] > MISSING)) n--;
  S.kp.v = S.kp.v.slice(0, n);
  return S;
}
export const timeAt = (ds, i) => ds.start + i * ds.stepH * HOUR_MS;

// ---------- audio rig (same graph as the Sonifier)
function makeIR(ctx, sec) {
  const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * sec));
  const buf = ctx.createBuffer(2, len, rate);
  const pre = Math.floor(rate * 0.025), fade = Math.floor(rate * 0.08);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const t = (i - pre) / (len - pre); const a = 0.25 + 0.7 * t;
      lp += (1 - a) * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 1.5) * Math.exp(-2 * t) * Math.min(1, (i - pre) / fade);
    }
  }
  return buf;
}
function buildRig() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = 0.75; master.connect(comp);
  const bus = ctx.createGain(); const dry = ctx.createGain(); bus.connect(dry); dry.connect(master);
  const delay = ctx.createDelay(4); const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
  const fb = ctx.createGain(); const dWet = ctx.createGain();
  bus.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(dWet); dWet.connect(master);
  const conv = ctx.createConvolver(); const rIn = ctx.createGain(); const rWet = ctx.createGain();
  bus.connect(rIn); dWet.connect(rIn); rIn.connect(conv); conv.connect(rWet); rWet.connect(master);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.31; const wob = ctx.createGain(); wob.gain.value = 7; lfo.connect(wob); lfo.start();
  return { ctx, master, bus, dry, delay, fb, dWet, conv, rWet, wob, chans: {}, active: 0, revLen: 0 };
}
function applyFx(rig, fx, bpm) {
  const t = rig.ctx.currentTime;
  rig.delay.delayTime.setTargetAtTime(Math.min(3.9, (60 / bpm) * DELAYS[fx.dly].beats), t, 0.05);
  rig.fb.gain.setTargetAtTime(fx.fb, t, 0.05);
  rig.dWet.gain.setTargetAtTime(fx.dmix, t, 0.05);
  rig.rWet.gain.setTargetAtTime(fx.revMix * 1.3, t, 0.05);
  rig.dry.gain.setTargetAtTime(1 - fx.revMix * 0.45, t, 0.05);
  if (rig.revLen !== fx.revLen) { rig.conv.buffer = makeIR(rig.ctx, fx.revLen); rig.revLen = fx.revLen; }
}
function chanNode(rig, id, ch) {
  let c = rig.chans[id];
  if (!c) {
    const g = rig.ctx.createGain();
    const p = typeof rig.ctx.createStereoPanner === 'function' ? rig.ctx.createStereoPanner() : null;
    if (p) { g.connect(p); p.connect(rig.bus); } else g.connect(rig.bus);
    c = { g, p }; rig.chans[id] = c;
  }
  const t = rig.ctx.currentTime;
  c.g.gain.setTargetAtTime(ch.vol, t, 0.05);
  if (c.p) c.p.pan.setTargetAtTime(ch.pan, t, 0.05);
  return c.g;
}
function playNote(rig, inst, f, t0, hold, vel, out) {
  if (rig.active > 72) return false;
  const ctx = rig.ctx;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
  const oscs = [], wobbled = [];
  const osc = (type, freq, det, dest, wobble) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det;
    if (wobble) { rig.wob.connect(o.detune); wobbled.push(o); }
    o.connect(dest); oscs.push(o); return o;
  };
  const sustainEnv = (peak, A, H, R) => {
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + A);
    g.gain.setValueAtTime(peak, t0 + A + H); g.gain.setTargetAtTime(0, t0 + A + H, R / 4);
    return t0 + A + H + R;
  };
  const v = 0.2 * vel;
  let end = t0 + 1;
  if (inst === 'eno') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(g); g.gain.value = 1;
    [[1, 1, 2.4], [2, 0.42, 1.5], [3, 0.14, 0.9], [4.01, 0.06, 0.6]].forEach(([mult, amp, tau]) => {
      const pg = ctx.createGain(); pg.gain.setValueAtTime(0, t0); pg.gain.linearRampToValueAtTime(v * amp * 1.3, t0 + 0.012);
      pg.gain.setTargetAtTime(0, t0 + 0.012, tau); pg.connect(lp); osc('sine', f * mult, mult === 1 ? 0 : 3, pg, true);
    });
    end = t0 + 7;
  } else if (inst === 'pad') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.connect(g);
    const A = 1.4, H = Math.max(0.4, hold), R = 3.5;
    lp.frequency.setValueAtTime(220, t0); lp.frequency.linearRampToValueAtTime(1700, t0 + A + H * 0.5); lp.frequency.linearRampToValueAtTime(380, t0 + A + H + R);
    [-12, 0, 12].forEach((det) => osc('sawtooth', f, det, lp, true)); osc('sine', f / 2, 0, lp, false);
    end = sustainEnv(v * 0.32, A, H, R);
  } else if (inst === 'shimmer') {
    [[1, 1], [2, 0.32], [2.99, 0.12], [4.02, 0.06]].forEach(([mult, amp]) => { const pg = ctx.createGain(); pg.gain.value = amp; pg.connect(g); osc('sine', f * mult, 0, pg, true); });
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v * 0.9, t0 + 0.08); g.gain.setTargetAtTime(0, t0 + 0.08 + Math.min(hold, 0.4), 1.6);
    end = t0 + 8;
  } else if (inst === 'choir') {
    const src = ctx.createGain(); const sum = ctx.createGain(); sum.gain.value = 3.2; sum.connect(g);
    const A = 0.9, H = Math.max(0.4, hold), R = 2.8;
    [[650, 6, 1], [1080, 8, 0.5], [2650, 10, 0.22]].forEach(([fq, q, amp], k) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      if (k === 0) { bp.frequency.setValueAtTime(560, t0); bp.frequency.linearRampToValueAtTime(800, t0 + A + H); } else bp.frequency.value = fq;
      const fg = ctx.createGain(); fg.gain.value = amp; src.connect(bp); bp.connect(fg); fg.connect(sum);
    });
    [-9, 9].forEach((det) => osc('sawtooth', f, det, src, true));
    end = sustainEnv(v * 0.8, A, H, R);
  } else if (inst === 'bell') {
    const c = osc('sine', f, 0, g, false);
    const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = f * 3.5;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 2.2, t0); mg.gain.exponentialRampToValueAtTime(1, t0 + 1.5);
    m.connect(mg); mg.connect(c.frequency); oscs.push(m);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.004); g.gain.setTargetAtTime(0, t0 + 0.004, 1.5);
    end = t0 + 6.5;
  } else if (inst === 'glass') {
    osc('sine', f, 0, g, false);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.01); g.gain.setTargetAtTime(0, t0 + 0.01, Math.max(0.15, hold));
    end = t0 + 0.01 + Math.max(0.6, hold * 5);
  } else {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(g);
    lp.frequency.setValueAtTime(f * 8, t0); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t0 + 0.3);
    osc('triangle', f, 0, lp, false);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.003); g.gain.setTargetAtTime(0, t0 + 0.003, 0.09);
    end = t0 + 0.6;
  }
  oscs.forEach((o) => { o.start(t0); o.stop(end); });
  rig.active += 1;
  oscs[0].onended = () => {
    rig.active -= 1;
    wobbled.forEach((o) => { try { rig.wob.disconnect(o.detune); } catch (_e) { /* gone */ } });
    try { g.disconnect(); } catch (_e) { /* gone */ }
  };
  return true;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- the player
export class Orchestra {
  constructor() {
    this.rig = null; this.S = null; this.N = 0;
    this.playing = false; this.pos = 0; this.count = 0; this.startK = 0;
    this.loop = true; this.marker = true;
    this.lastVal = {}; this.lastNote = {};
    this.events = []; // visual events waiting for their audio time
    this.listeners = { note: [], step: [], state: [] };
    this.stats = { steps: 0, notesScheduled: 0, notesAudible: 0, voicesStarted: 0 };
    this.applyPreset('ambient');
  }
  on(ev, fn) { this.listeners[ev].push(fn); }
  emit(ev, x) { this.listeners[ev].forEach((f) => f(x)); }
  setData(D) {
    this.S = buildSets(D); this.N = this.S.kp.v.length;
    if (this.pos >= this.N) this.pos = 0;
    this.lastVal = {}; this.lastNote = {};
  }
  applyPreset(key) {
    const p = PRESETS[key]; this.preset = key;
    this.ch = clone(p.ch); this.bpm = p.bpm; this.len = p.len; this.meter = p.meter; this.scale = p.scale; this.fx = clone(p.fx);
    this.lastVal = {}; this.lastNote = {};
    this.refresh();
  }
  refresh() { const r = this.rig; if (!r) return; applyFx(r, this.fx, this.bpm); ORDER.forEach((id) => chanNode(r, id, this.ch[id])); }
  get steps() { return SCALES[this.scale].steps; }
  get stepSec() { return (60 / this.bpm) * LENS[this.len].beats; }
  anySolo() { return ORDER.some((id) => this.ch[id].on && this.ch[id].solo); }
  audible(id) { const c = this.ch[id]; return c.on && !c.mute && (!this.anySolo() || c.solo); }
  soloed() { const s = ORDER.filter((id) => this.ch[id].on && this.ch[id].solo); return s.length === 1 ? s[0] : null; }
  offset(id) { return 12 * this.ch[id].oct + this.ch[id].trans; }
  midiFor(id, v) { return toMidi(norm(this.S[id], v), this.steps) + this.offset(id); }
  // master clock index k -> index into a set
  mapIdx(id, k) {
    const ds = this.S[id]; if (id === 'kp') return k;
    if (ds.daily) { const j = Math.floor((this.S.kp.start + k * 3 * HOUR_MS - ds.start) / (24 * HOUR_MS)); return j >= 0 && j < ds.v.length ? j : -1; }
    const n = ds.v.length; return (((k - this.startK) % n) + n) % n;
  }
  kFor(id, j) {
    const ds = this.S[id]; if (id === 'kp') return j;
    if (ds.daily) return Math.max(0, Math.min(this.N - 1, Math.ceil((ds.start + j * 24 * HOUR_MS - this.S.kp.start) / (3 * HOUR_MS))));
    return Math.min(this.N - 1, this.startK + j);
  }
  timeOf(k) { return timeAt(this.S.kp, k); }
  ensureRig() {
    if (!this.rig) this.rig = buildRig();
    if (!this.rig) return null;
    if (this.rig.ctx.state === 'suspended') this.rig.ctx.resume();
    this.refresh();
    return this.rig;
  }
  now() { return this.rig ? this.rig.ctx.currentTime : performance.now() / 1000; }
  async play() {
    if (!this.S) return false;
    const rig = this.ensureRig(); if (!rig) return false;
    try { await rig.ctx.resume(); } catch (e) { /* ignore */ }
    if (this.pos >= this.N - 1 || this.pos < this.startK) { this.pos = this.startK; this.lastVal = {}; this.lastNote = {}; }
    this.playing = true; this.next = rig.ctx.currentTime + 0.08;
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 25);
    rig.master.gain.setTargetAtTime(0.75, rig.ctx.currentTime, 0.1);
    this.emit('state', this); return true;
  }
  pause() {
    this.playing = false; clearInterval(this.timer); this.events.length = 0;
    if (this.rig) this.rig.master.gain.setTargetAtTime(0.0, this.rig.ctx.currentTime, 0.6);
    this.emit('state', this);
  }
  stop() { this.pause(); this.pos = this.startK; this.count = 0; this.lastVal = {}; this.lastNote = {}; this.emit('step', { k: this.pos, count: 0, fired: [], seek: true }); }
  seek(k) { this.pos = Math.max(0, Math.min(this.N - 1, k)); this.lastVal = {}; this.lastNote = {}; this.events.length = 0; this.emit('step', { k: this.pos, count: this.count, fired: [], seek: true }); }
  tick() {
    const rig = this.rig; if (!rig || !this.playing) return;
    const now = rig.ctx.currentTime, stepS = this.stepSec;
    if (this.next < now - 0.25) this.next = now + 0.05;
    let guard = 0;
    while (this.next < now + 0.15 && guard < 8) {
      guard++;
      const k = this.pos;
      this.doStep(k, this.next, stepS);
      this.count++; this.stats.steps++;
      let nk = k + 1;
      if (nk >= this.N) { if (this.loop) nk = this.startK; else { this.pos = this.N - 1; setTimeout(() => this.pause(), stepS * 1000); break; } }
      this.pos = nk; this.next += stepS;
    }
  }
  doStep(k, t, stepS) {
    const rig = this.rig, m = METERS[this.meter], p = this.count % m.len;
    const acc = p === 0 ? 1.3 : m.sec.includes(p) ? 1.1 : 0.82;
    const anySolo = this.anySolo(), sc = this.steps, fired = [];
    if (rig && this.marker && (k - this.startK) % ROT === 0) playNote(rig, 'pad', hz(BASE_MIDI - 12), t, Math.min(4, stepS * 8), 0.6, rig.bus);
    for (const id of ORDER) {
      const ch = this.ch[id]; if (!ch.on) continue;
      const ds = this.S[id], j = this.mapIdx(id, k); if (j < 0) continue;
      const v = ds.v[j]; if (!(v > MISSING)) continue;
      const nth = MODE_N[ch.mode];
      const trig = ch.mode === 'change' || ch.mode === 'drone' ? this.lastVal[id] !== v : this.count % nth === 0;
      if (!trig) continue;
      this.lastVal[id] = v;
      const midi = toMidi(norm(ds, v), sc) + 12 * ch.oct + ch.trans;
      this.lastNote[id] = { midi, v, j };
      const audible = !ch.mute && !(anySolo && !ch.solo);
      let hold = stepS * nth * 0.9;
      if (ch.mode === 'drone') {
        let h = 1;
        while (h < 24 && k + h < this.N) { const j2 = this.mapIdx(id, k + h); if (j2 < 0 || ds.v[j2] !== v) break; h++; }
        hold = h * stepS;
      }
      const vel = Math.min(1, (0.55 + 0.35 * norm(ds, v)) * acc);
      this.stats.notesScheduled++;
      if (audible) { this.stats.notesAudible++; if (rig && playNote(rig, ch.inst, hz(midi), t, hold, vel, chanNode(rig, id, ch))) this.stats.voicesStarted++; }
      fired.push({ id, midi, v, j, vel, hold, audible, inst: ch.inst, t });
    }
    this.events.push({ t, k, count: this.count, fired });
  }
  // called from the render loop: hands over events whose audio time has arrived
  drain() {
    const now = this.now(), out = [];
    while (this.events.length && this.events[0].t <= now) out.push(this.events.shift());
    for (const e of out) { this.emit('step', e); for (const n of e.fired) this.emit('note', n); }
    return out.length;
  }
}
