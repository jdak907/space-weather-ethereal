import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { loadSnapshot, refreshLive, anyLive, at, maxOver, endTime, sunspot } from './data.js';
import { tickStars } from './stars.js';
import { createSun } from './scenes/sun.js';
import { createWind } from './scenes/wind.js';
import { createMagneto, shue } from './scenes/magneto.js';
import { createOval, createCurtain, ovalEdge } from './scenes/aurora.js';
import { createSchumann } from './scenes/schumann.js';
import { srAt, srSeries } from './schumann.js';
import { fmt3, setCompact, getLon, setLon } from './time.js';
import { shiftWind, demoData, DELAYS, l1DelayMin, xcls } from './timeline.js';
import { Orchestra, noteColor, noteName, SET_INFO } from './orchestra.js';
import { createReactions } from './reactions.js';
import { BartelsStrip } from './strip.js';
import { buildPanel } from './panel.js';
import * as spatial from './spatial.js';
import { airplaySupported, watchAirPlay, mkAudio, OUT_ID, unlockStats } from './audiounlock.js';

// Colors are authored directly in display space; no color-space conversion anywhere.
THREE.ColorManagement.enabled = false;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const low = mobile || params.get('quality') === 'low';
const Q = {
  pr: Math.min(devicePixelRatio || 1, low ? 1.5 : 2),
  particles: low ? 14000 : 40000,
  stars: low ? 2500 : 6000,
  mobile: low,
};

// ---------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  $('fallback').hidden = false; $('ui').hidden = true; throw e;
}
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

// ---------- scenes
const ctx = { pr: Q.pr, particles: Q.particles, stars: Q.stars, mobile: Q.mobile };
const scenes = [createSun(ctx), createWind(ctx), createMagneto(ctx), createOval(ctx), createCurtain(ctx), createSchumann(ctx)];
const byId = Object.fromEntries(scenes.map((s, i) => [s.id, i]));

// one OrbitControls per scene camera; only the active one is enabled
const sph = new THREE.Spherical();
for (const s of scenes) {
  const c = new OrbitControls(s.camera, renderer.domElement);
  c.enableDamping = true; c.dampingFactor = 0.06; c.rotateSpeed = 0.5; c.zoomSpeed = 0.6; c.enabled = false;
  const o = s.orbit;
  if (o.lookAround) {
    c.enableZoom = false; c.enablePan = false;
    c.target.copy(o.eye).add(o.dir.clone().multiplyScalar(0.01));
    s.camera.position.copy(o.eye);
    c.minPolarAngle = THREE.MathUtils.degToRad(92); c.maxPolarAngle = THREE.MathUtils.degToRad(165);
    c.rotateSpeed = -0.35; // drag like grabbing the sky
  } else {
    c.target.copy(o.target); c.minDistance = o.minDistance; c.maxDistance = o.maxDistance; c.enablePan = true;
    const off = s.camera.position.clone().sub(o.target);
    sph.setFromVector3(off); sph.radius = o.home * Math.pow(Math.max(1, 1.3 / (innerWidth / innerHeight)), 0.75); if (o.polar) sph.phi = o.polar;
    s.camera.position.copy(o.target).add(new THREE.Vector3().setFromSpherical(sph));
  }
  c.update();
  s.controls = c; s.lastUser = -1e9; s.homeTarget = c.target.clone();
  c.addEventListener('start', () => { s.dragging = true; });
  c.addEventListener('end', () => { s.dragging = false; s.lastUser = clock.elapsedTime; });
}

// ---------- crossfade pass: renders the current scene (and the next one while fading)
class CrossfadePass extends Pass {
  constructor(w, h) {
    super();
    const opt = { type: THREE.HalfFloatType, samples: low ? 0 : 4 };
    this.rtA = new THREE.WebGLRenderTarget(w, h, opt); this.rtB = new THREE.WebGLRenderTarget(w, h, opt);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);} ',
      fragmentShader: `uniform sampler2D tA, tB; uniform float uMix; varying vec2 vUv;
        vec3 safe(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 32.0); }
        void main(){ vec4 a = texture2D(tA,vUv), b = texture2D(tB,vUv); a.rgb = safe(a.rgb); b.rgb = safe(b.rgb);
          float m = smoothstep(0.0,1.0,uMix);
          // dip slightly through darkness for a dreamy dissolve
          float dip = 1.0 - 0.35*sin(3.14159*m);
          gl_FragColor = vec4(mix(a.rgb,b.rgb,m)*dip, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.a = null; this.b = null; this.mix = 0;
  }
  setSize(w, h) { this.rtA.setSize(w, h); this.rtB.setSize(w, h); }
  render(r, writeBuffer) {
    r.setRenderTarget(this.rtA); r.clear(); r.render(this.a.scene, this.a.camera);
    if (this.b && this.mix > 0) { r.setRenderTarget(this.rtB); r.clear(); r.render(this.b.scene, this.b.camera); }
    this.mat.uniforms.tA.value = this.rtA.texture; this.mat.uniforms.tB.value = this.rtB.texture;
    this.mat.uniforms.uMix.value = this.b ? this.mix : 0;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
}

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Q.pr);
composer.setSize(innerWidth, innerHeight);
const xfade = new CrossfadePass(innerWidth * Q.pr, innerHeight * Q.pr);
composer.addPass(xfade);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), low ? 0.7 : 0.9, 0.65, 0.12);
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 d = vUv - 0.5; d.x *= uRes.x/uRes.y;
      c *= 1.0 - 0.45*smoothstep(0.35, 1.05, length(d));
      c = c / (1.0 + 0.12*c);                       // gentle highlight roll-off
      c += (h(vUv*uRes + uTime) - 0.5) * (1.5/255.0); // dither / film grain
      gl_FragColor = vec4(c, 1.0); }`,
});
composer.addPass(finalPass);

// ---------- data + derived parameters
let D = null;
const P = { kp: 2, kp24: 2, ap: 7, f107: 100, sn: 40, swSpeed: 400, swDens: 4, bz: 0, lag: 55 };
const Ptarget = { ...P };
const replay = { on: false, t: 0, start: 0, end: 0, speed: 0 };
const clock = new THREE.Clock();
// every time on screen: local (zone) · UTC · GMST (and LST if the viewer set a longitude); compact on phones
setCompact(mobile);
const fmtTime = (ms) => fmt3(ms);
const fmtDay = (ms) => fmt3(ms);

function computeTargets() {
  if (!D) return;
  const following = orchFollowing();
  const now = clockT();
  const pick = (v, fallback) => (v === null || v === undefined ? fallback : v);
  Ptarget.kp = pick(at(D.kp, now, 'v', 16), Ptarget.kp);
  Ptarget.kp24 = pick(maxOver(D.kp, now, 24 * 3600e3), Ptarget.kp);
  Ptarget.ap = pick(at(D.ap, now, 'v', 4), Ptarget.ap);
  Ptarget.f107 = pick(at(D.f107, now, 'v', 5), Ptarget.f107);
  Ptarget.sn = pick(sunspot(D, now).v, Ptarget.sn);
  // solar wind on its Earth-arrival timeline (shifted from L1 by the measured speed); the record
  // only covers about 24 h, so outside it the last values are held and the readout says so
  const swT = Math.min(now, endTime(D.swE, 'speed'));
  void following;
  Ptarget.swSpeed = pick(at(D.swE, swT, 'speed', 12), Ptarget.swSpeed);
  Ptarget.swDens = pick(at(D.swE, swT, 'dens', 12), Ptarget.swDens);
  Ptarget.bz = pick(at(D.swE, swT, 'bz', 12), Ptarget.bz);
  Ptarget.lag = pick(at(D.swE, swT, 'lag', 12), Ptarget.lag);
}
// the one clock every scene reads: the orchestra playhead (continuous, UTC at Earth), the replay sweep, or "now"
let playT = 0, stepWall = 0, stepDur = 0.4;
function latestT() { return Math.max(endTime(D.kp), endTime(D.swE, 'speed')); }
function clockT() {
  if (orchFollowing()) return playT || orch.timeOf(playK);
  if (replay.on) return replay.t;
  return D.demo ? orch.timeOf(orch.N - 1) : Math.min(Date.now(), latestT() + 3 * 3600e3);
}
ctx.clock = () => ({ follow: orchFollowing() || replay.on, t: clockT() });
function prepare(d) { d.swE = shiftWind(d.sw); d.sr = srSeries(d); return d; }

function setBadge() {
  const b = $('badge'), live = anyLive(D);
  $('demo-banner').hidden = !D.demo;
  if (D.demo) {
    b.className = 'badge demo'; $('badge-mode').textContent = 'DEMO'; $('badge-asof').textContent = 'illustrative storm, not real data';
    b.title = 'Typical storm demo: a textbook sequence made up for illustration. Turn it off in the Orchestra panel to return to real data.';
    return;
  }
  b.className = 'badge ' + (live ? 'live' : 'snapshot');
  $('badge-mode').textContent = live ? 'LIVE' : 'SNAPSHOT';
  const latestT = Math.max(endTime(D.kp), endTime(D.sw, 'speed'));
  $('badge-asof').textContent = `data as of ${fmtTime(live ? latestT : (D.generated || latestT))}`;
  const parts = Object.entries({ 'Kp': D.live.kp, 'Solar wind': D.live.sw, 'F10.7': D.live.f107, 'Sunspots': D.live.ssn, 'GOES X-rays': D.live.xr, 'GOES protons': D.live.p10 })
    .map(([k, v]) => `${k}: ${v ? 'live NOAA SWPC' : 'snapshot'}`);
  b.title = parts.join(' · ') + (D.errors.length ? `\nLive fetch issues: ${D.errors.join('; ')}` : '');
  $('about-status').innerHTML = `<p><b>Right now:</b> ${parts.join(' · ')}.<br>Bundled snapshot generated ${D.generated ? fmtTime(D.generated) : D.snapshotAsOf}.` +
    (D.errors.length ? `<br>Live fetch issues: ${D.errors.map((e) => e.replace(/</g, '&lt;')).join('; ')}` : '') + '<br>Schumann resonance: <b>modeled</b> (no open live numeric source).</p>';
}

function readout() {
  if (!D) return;
  const s = scenes[shown >= 0 ? shown : cur];
  const f = (v, d = 0) => (v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toFixed(d));
  const Dp = Math.max(0.1, 1.6726e-6 * P.swDens * P.swSpeed * P.swSpeed);
  const { r0 } = shue(Dp, P.bz);
  const rows = [];
  const add = (k, v, cls = '') => rows.push(`<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);
  if (s.id === 'schumann') return readoutSR(f, rows, add);
  add('Kp (geomagnetic)', f(Ptarget.kp, 1), Ptarget.kp >= 5 ? 'hi' : '');
  if (s.id === 'sun') { add('F10.7 radio flux', f(Ptarget.f107, 0) + ' sfu'); add(sunspot(D, orchFollowing() ? orch.timeOf(playK) : replay.on ? replay.t : Date.now()).label, f(Ptarget.sn, 0)); add('Ap (daily)', f(Ptarget.ap, 0)); }
  if (s.id === 'wind' || s.id === 'magneto') {
    add('Wind speed', f(Ptarget.swSpeed, 0) + ' km/s'); add('Density', f(Ptarget.swDens, 1) + ' /cm³');
    add('IMF Bz', (Ptarget.bz > 0 ? '+' : '') + f(Ptarget.bz, 1) + ' nT ' + (Ptarget.bz < -0.5 ? '(south)' : Ptarget.bz > 0.5 ? '(north)' : ''), Ptarget.bz < -5 ? 'hi' : '');
    add('L1 → Earth delay', '+' + f(Ptarget.lag, 0) + ' min', 'model');
  }
  if (s.id === 'magneto') { add('Dynamic pressure', f(Dp, 2) + ' nPa', 'model'); add('Magnetopause nose', f(r0, 1) + ' Earth radii', 'model'); }
  if (s.id === 'oval' || s.id === 'curtain') { add('Kp max, last 24 h', f(Ptarget.kp24, 1)); add('Oval edge (approx.)', '~' + f(ovalEdge(P.kp), 0) + '° mag. lat', 'model'); }
  rows.push('<div class="sep"></div>');
  const kpT = endTime(D.kp), swT = endTime(D.sw, 'speed');
  const swNote = clockT() > endTime(D.swE, 'speed') + 3600e3 || clockT() < D.swE.t0 ? ' · no solar wind data at this time (record covers ~24 h), last values held' : ' · solar wind shifted to Earth arrival';
  rows.push(`<span class="src">${D.demo ? '<b style="color:#ffb45a">DEMO, not real data.</b> ' : ''}${orchFollowing() ? 'Playhead at ' + fmtTime(clockT()) + swNote : replay.on ? 'Replaying ' + fmtDay(replay.t) + swNote : `Kp ${D.live.kp ? 'live' : 'snapshot'} to ${fmtTime(kpT)} · wind ${D.live.sw ? 'live' : 'snapshot'} to ${fmtTime(swT)}${D.sw.source ? ' (' + D.sw.source + ')' : ''}`}. Purple values are model estimates.</span>`);
  $('readout').innerHTML = rows.join('');
}

function readoutSR(f, rows, add) {
  const sc = scenes[byId.schumann], st = sc.state, s = st.s || srAt(D, clockT(), P.kp);
  const hh = (ms) => fmtTime(ms);
  add(st.lapse ? 'Scene clock (time-lapse)' : 'Scene clock', hh(st.simT));
  add('Mode 1 frequency', f(s.f[0], 2) + ' Hz', 'model');
  add('Cavity intensity', f(s.I * 100, 0) + '% of daily max', 'model');
  add('Busiest storm region', s.leadLabel, 'model');
  add('GOES X-rays', s.xcls + (s.dfX > 0.005 ? ` (+${s.dfX.toFixed(2)} Hz)` : ''), s.dfX > 0.05 ? 'hi' : '');
  add('Protons ≥10 MeV', s.p10 === null ? '—' : f(s.p10, s.p10 < 10 ? 2 : 0) + ' pfu' + (s.dfP < 0 ? ` (${s.dfP.toFixed(2)} Hz)` : ''), s.p10 >= 10 ? 'hi' : '');
  rows.push('<div class="sep"></div>');
  rows.push(`<span class="src">${D.demo ? '<b style="color:#ffb45a">DEMO, not real data.</b> ' : ''}Schumann values are <b>modeled</b> (purple): lightning by time of day from the land map, plus published flare (+0.2 Hz) and proton-event (−0.15 to −0.4 Hz) shifts driven by NOAA GOES ${D.live.xr ? 'live' : 'snapshot'} data.</span>`);
  $('readout').innerHTML = rows.join('');
}

// ---------- scene switching, tour, captions
let cur = 0, next = -1, fadeT = 0, shown = -1;
const FADE = 4.0, DWELL = Math.max(5, +params.get('dwell') || (low ? 34 : 42));
let tourOn = params.get('tour') !== '0', dwellT = 0;
function caption(s) {
  const c = $('caption'); c.classList.add('fade');
  clearTimeout(caption.tm);
  caption.tm = setTimeout(() => {
    $('cap-kicker').textContent = s.kicker; $('cap-title').textContent = s.title; $('cap-text').textContent = s.text;
    $('cap-inst').textContent = s.instrument; $('cap-note').textContent = s.note; c.classList.remove('fade'); readout();
  }, 300);
}
function setActive(i) { scenes.forEach((s, k) => (s.controls.enabled = k === i)); }
// caption, picker highlight and scene-specific panels switch when the picture does (crossfade midpoint),
// not when the fade starts, so the text never describes the scene that is still on screen
function showScene(i) {
  shown = i;
  document.body.classList.toggle('sr-on', scenes[i].id === 'schumann');
  document.querySelectorAll('#picker button').forEach((b, k) => b.classList.toggle('active', k === i));
  caption(scenes[i]);
  if (orch.rig) orch.rig.sp.setRefDistance(audioRef(scenes[i]));
}
const audioRef = (s) => (s.orbit && s.orbit.home ? s.orbit.home * 0.5 : 40);
function visibleScene() { return next >= 0 && xfade.mix >= 0.45 ? next : cur; }
function go(i, instant = false) {
  i = (i + scenes.length) % scenes.length;
  if (instant) { cur = i; next = -1; fadeT = 0; xfade.b = null; xfade.mix = 0; }
  else {
    if (next >= 0) { cur = next; next = -1; xfade.b = null; xfade.mix = 0; } // finish a pending fade
    if (i !== cur) { next = i; fadeT = 0; }
  }
  dwellT = 0; setActive(i);
  if (instant || next < 0) showScene(i);
}
scenes.forEach((s, i) => {
  const b = document.createElement('button'); b.textContent = s.label; b.title = s.title;
  b.onclick = () => go(i); $('picker').appendChild(b);
});

// ---------- gentle camera drift (pauses while the viewer is steering)
const tmpV = new THREE.Vector3();
function drift(s, t, dt) {
  const c = s.controls, o = s.orbit;
  const idle = !s.dragging && t - s.lastUser > 12;
  if (idle) {
    const ease = Math.min(1, dt * (t - s.lastUser < 30 ? 0.08 : 0.25));
    if (o.lookAround) {
      tmpV.copy(s.camera.position).sub(c.target); sph.setFromVector3(tmpV);
      const yaw0 = Math.atan2(-o.dir.x, -o.dir.z); // theta of (camera - target) when facing o.dir
      const wantT = yaw0 + o.yawAmp * Math.sin(t * 0.021);
      const wantP = Math.PI / 2 + (o.pitch + 0.06 * Math.sin(t * 0.033));
      sph.theta += (wantT - sph.theta) * ease; sph.phi += (wantP - sph.phi) * ease;
      s.camera.position.copy(c.target).add(tmpV.setFromSpherical(sph));
      s.camera.fov += ((62 + 4 * Math.sin(t * 0.017)) - s.camera.fov) * ease; s.camera.updateProjectionMatrix();
    } else {
      const want = tmpV.copy(s.homeTarget).add(new THREE.Vector3(Math.sin(t * 0.019) * o.home * 0.05, Math.sin(t * 0.023) * o.home * 0.03, Math.cos(t * 0.017) * o.home * 0.04));
      const shift = want.sub(c.target).multiplyScalar(ease);
      c.target.add(shift); s.camera.position.add(shift);
      tmpV.copy(s.camera.position).sub(c.target); sph.setFromVector3(tmpV);
      sph.theta += o.spin * dt;
      const fit = Math.pow(Math.max(1, 1.3 / s.camera.aspect), 0.75); // pull back on tall/narrow screens
      const wantR = o.home * fit * (1 + o.zoomAmp * Math.sin(t * 0.031));
      sph.radius += (wantR - sph.radius) * ease;
      if (o.polar) sph.phi += ((o.polar + 0.12 * Math.sin(t * 0.027)) - sph.phi) * ease;
      sph.makeSafe();
      s.camera.position.copy(c.target).add(tmpV.setFromSpherical(sph));
    }
  }
  c.update();
}

// ---------- UI wiring
const orch = new Orchestra();
const reactions = createReactions(scenes);
const strip = new BartelsStrip($('strip'), orch);
let playK = 0;
const opt = { follow: params.get('follow') !== '0', tourSolo: true, strip: params.get('strip') !== '0' };
function orchFollowing() { return !!(orch.playing && opt.follow && orch.S); }
// which scenes belong to which data set's physical domain (used by "Tour follows solo")
const HOME = { kp: ['oval', 'curtain'], ap: ['curtain', 'oval'], f107: ['sun'], sn: ['sun'], speed: ['wind', 'magneto'], dens: ['wind', 'magneto'], bz: ['magneto', 'wind'], xr: ['sun', 'schumann'], sr: ['schumann'] };
const btn = (id, on, label) => { const b = $(id); b.classList.toggle('on', on); b.textContent = `${label}: ${on ? 'on' : 'off'}`; };
function toggleTour() { tourOn = !tourOn; dwellT = 0; btn('btn-tour', tourOn, 'Tour'); }
function toggleReplay() {
  if (!D) return;
  replay.on = !replay.on;
  replay.start = D.kp.t0; replay.end = endTime(D.kp); replay.t = replay.start;
  replay.speed = (replay.end - replay.start) / (low ? 200 : 240); // whole record in about 4 minutes
  $('replay-bar').hidden = !replay.on; btn('btn-replay', replay.on, 'Replay');
}
async function startOrchestra() {
  if (!orch.S) return;
  try { await orch.play(); } catch (e) { console.warn('audio', e); }
  syncSound();
}
async function toggleSound() { if (orch.playing) orch.pause(); else await startOrchestra(); syncSound(); }
function syncSound() {
  btn('btn-sound', orch.playing, 'Sound');
  $('replay-bar').hidden = !(replay.on || orchFollowing());
  panel.render();
}
function toggleOrch(force) {
  const a = $('orch'); a.hidden = force !== undefined ? !force : !a.hidden;
  $('btn-orch').classList.toggle('on', !a.hidden); document.body.classList.toggle('orch-open', !a.hidden);
  if (!a.hidden && !orch.rig && navigator.userActivation && navigator.userActivation.isActive) { orch.probeOutput(); panel.render(); } // detect output channels on a real click
}
function setStrip(on) { opt.strip = on; $('strip-wrap').hidden = !on; strip.dirty = true; }
// Bartels strip: one click / E / double-click on its header enlarges or minimizes it (remembered)
function setStripBig(on, save = true) {
  strip.setBig(on); $('strip-wrap').classList.toggle('big', !!on);
  const b = $('strip-size'); b.textContent = on ? '⤡' : '⤢'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.setAttribute('aria-label', on ? 'Minimize Bartels strip' : 'Enlarge Bartels strip'); b.title = (on ? 'Minimize' : 'Enlarge') + ' (E, or double-click the header)';
  if (save) try { localStorage.setItem('swe.stripBig', on ? '1' : '0'); } catch (_e) { /* private mode */ }
}
$('strip-size').onclick = (e) => { e.stopPropagation(); setStripBig(!strip.big); };
$('strip-head').ondblclick = (e) => { if (e.target.id !== 'strip-size') setStripBig(!strip.big); };
try { if (localStorage.getItem('swe.stripBig') === '1') setStripBig(true, false); } catch (_e) { /* private mode */ }
const panel = buildPanel($('orch'), orch, {
  play: startOrchestra, close: () => toggleOrch(false), stripSet: () => strip.id,
  setStrip: (id) => strip.setSet(id), get: (k) => opt[k],
  set: (k, v) => { opt[k] = v; if (k === 'strip') setStrip(v); if (k === 'follow') syncSound(); },
  setDemo: (on) => setDemo(on), demo: () => !!(D && D.demo),
  jumpTo: (id) => { const ds = orch.S[id]; if (ds && orch.timeOf(orch.pos) < ds.start) orch.seek(orch.kAtTime(ds.start)); },
  changed: () => { strip.dirty = true; },
});
orch.on('state', () => syncSound());
orch.on('step', (e) => {
  playK = e.k; stepWall = clock.elapsedTime; stepDur = e.stepS || orch.stepSec;
  if (e.seek) { playT = orch.timeOf(e.k); resetChains(playT); }
  const so = orch.soloed(); if (so && strip.id !== so) { strip.setSet(so); panel.render(); } // the strip follows a soloed set
  if (e.seek) strip.reset(); else strip.step(e.k, e.fired);
});
orch.on('note', (n) => {
  const sw = document.getElementById('sw-' + n.id), nn = document.getElementById('nn-' + n.id);
  if (sw) { sw.style.background = noteColor(n.midi); sw.classList.remove('hit'); void sw.offsetWidth; sw.classList.add('hit'); }
  if (nn) nn.textContent = noteName(n.midi);
  if (!n.audible) return;
  const act = [scenes[cur]]; if (next >= 0) act.push(scenes[next]);
  reactions.note(n, act);
});
$('btn-orch').onclick = () => toggleOrch();
// lock screen / Control Center play-pause (iOS shows these while the media route is playing)
orch.msHandlers = { play: () => startOrchestra(), pause: () => { orch.pause(); syncSound(); } };
// AirPlay: offered only in Safari, and only when WebKit reports an AirPlay target nearby
if (airplaySupported()) {
  watchAirPlay(mkAudio(OUT_ID), (ok) => { orch.airplayOk = ok; $('btn-airplay').hidden = !ok; panel.render(); });
  $('btn-airplay').onclick = () => { const was = orch.playing; orch.airplay(); if (!was) startOrchestra(); };
}
$('replay-bar').onclick = (e) => {
  if (!orchFollowing()) return;
  const r = e.currentTarget.getBoundingClientRect();
  orch.seek(Math.round(((e.clientX - r.left) / r.width) * (orch.N - 1)));
};

function toggleText() { const u = $('ui'); u.classList.toggle('hidden-text'); $('btn-hide').textContent = u.classList.contains('hidden-text') ? 'Show text' : 'Hide text'; }
function toggleAbout(force) { const a = $('about'); a.hidden = force !== undefined ? !force : !a.hidden; }
$('btn-tour').onclick = toggleTour; $('btn-replay').onclick = toggleReplay; $('btn-sound').onclick = toggleSound;
$('btn-hide').onclick = toggleText; $('caption').onclick = () => $('caption').classList.toggle('expanded'); $('btn-info').onclick = () => toggleAbout(); $('about-close').onclick = () => toggleAbout(false);
$('about').onclick = (e) => { if (e.target.id === 'about') toggleAbout(false); };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'arrowright') go((next >= 0 ? next : cur) + 1); else if (k === 'arrowleft') go((next >= 0 ? next : cur) - 1);
  else if (k === 't') toggleTour(); else if (k === 'r') toggleReplay(); else if (k === 's') toggleSound();
  else if (k === 'o') toggleOrch(); else if (k === 'b') { setStrip(!opt.strip); panel.render(); }
  else if (k === 'e') { if (!opt.strip) setStrip(true); setStripBig(!strip.big); }
  else if (k === 'h') toggleText(); else if (k === 'i') toggleAbout(); else if (k === 'escape') toggleAbout(false);
  else if (/^[1-6]$/.test(k)) go(+k - 1);
});
let lastMove = 0;
const wake = () => { lastMove = clock.elapsedTime; $('ui').classList.remove('idle'); };
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h); // also resizes every pass
  finalPass.uniforms.uRes.value.set(w, h);
  for (const s of scenes) { s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); }
}
addEventListener('resize', resize);
resize();
// measured heights for the phone layout: controls (bar + wrapped buttons), readout, Schumann panel, header
{
  const root = document.documentElement.style, H = (id) => { const e = $(id); return e && e.offsetParent !== null ? e.getBoundingClientRect().height : 0; };
  const sync = () => { root.setProperty('--ctl-h', Math.ceil(H('controls')) + 'px'); root.setProperty('--ro-h', Math.ceil(H('readout')) + 'px');
    root.setProperty('--sr-h', Math.ceil(H('sr-wrap')) + 'px'); root.setProperty('--top-h', Math.ceil(H('top')) + 'px'); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(sync); ['controls', 'readout', 'sr-wrap', 'top'].forEach((id) => ro.observe($(id))); }
  addEventListener('resize', sync); sync();
}

// ---------- main loop
let readoutAcc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (!document.hidden) {
    if (orchFollowing()) {
      $('replay-fill').style.width = (playK / Math.max(1, orch.N - 1) * 100).toFixed(2) + '%';
      $('replay-date').textContent = (D.demo ? 'DEMO · ' : '♪ ') + fmtTime(playT || orch.timeOf(playK)) + ' · Kp ' + (Ptarget.kp ?? 0).toFixed(1) + (orch.tl.eventMode ? ' · event mode' : '');
      const pos = document.getElementById('o-pos'); if (pos) pos.textContent = fmtDay(orch.timeOf(playK)) + ' · step ' + (playK + 1) + ' of ' + orch.N;
    } else if (replay.on && D) {
      replay.t += replay.speed * dt;
      if (replay.t > replay.end) replay.t = replay.start;
      $('replay-fill').style.width = ((replay.t - replay.start) / (replay.end - replay.start) * 100).toFixed(2) + '%';
      $('replay-date').textContent = fmtDay(replay.t) + ' · Kp ' + (Ptarget.kp ?? 0).toFixed(1);
    }
    if (orchFollowing()) { // continuous playhead between slots
      const k0 = Math.min(playK, orch.N - 1), k1 = Math.min(k0 + 1, orch.N - 1), u = Math.min(1, (t - stepWall) / Math.max(0.05, stepDur));
      playT = orch.timeOf(k0) + u * (orch.timeOf(k1) - orch.timeOf(k0));
    }
    computeTargets();
    runChains(t);
    const k = Math.min(1, dt * (replay.on ? 1.5 : 0.6));
    for (const key in P) P[key] += (Ptarget[key] - P[key]) * k;

    // tour
    if (tourOn && next < 0 && $('about').hidden && !(chainHold > t)) {
      dwellT += dt;
      const so = opt.tourSolo && orch.playing ? orch.soloed() : null;
      if (so) {
        // tour follows the soloed data set: stay within the scenes of its physical domain
        const ids = HOME[so], here = ids.indexOf(scenes[cur].id);
        if (here < 0) go(byId[ids[0]]);
        else if (dwellT > DWELL && ids.length > 1) go(byId[ids[(here + 1) % ids.length]]);
        else if (dwellT > DWELL) dwellT = 0;
      } else if (dwellT > DWELL) go(cur + 1);
    }
    if (next >= 0) {
      fadeT += dt; xfade.b = scenes[next]; xfade.mix = Math.min(1, fadeT / FADE);
      if (fadeT >= FADE) { cur = next; next = -1; xfade.b = null; xfade.mix = 0; }
    }
    xfade.a = scenes[cur];
    const vis = visibleScene(); if (vis !== shown) showScene(vis);
    const bTarget = next >= 0 ? THREE.MathUtils.lerp(scenes[cur].bloom ?? 0.8, scenes[next].bloom ?? 0.8, xfade.mix) : (scenes[cur].bloom ?? 0.8);
    bloom.strength = bTarget * (low ? 0.85 : 1);
    const active = [scenes[cur]]; if (next >= 0) active.push(scenes[next]);
    for (const s of active) { s.update(t, dt, P); drift(s, t, dt); }
    tickStars(t);
    finalPass.uniforms.uTime.value = t % 100;
    composer.render(dt);

    // orchestra: hand over notes whose audio time has come, then animate their reactions
    orch.drain();
    // spatial audio: the listener rides the visible scene's camera; each voice sits at its anchor there
    if (orch.rig) { const vs = scenes[vis], rd = audioRef(vs); if (orch.rig.sp.refDist !== rd) orch.rig.sp.setRefDistance(rd); orch.spatialUpdate(vs.camera, (id) => spatial.anchorFor(vs, id, t)); }
    reactions.update(dt);
    if (opt.strip) strip.draw(dt);
    readoutAcc += dt; if (readoutAcc > 1) { readoutAcc = 0; readout(); }
    if (t - lastMove > 9 && $('about').hidden) $('ui').classList.add('idle');
  }
  requestAnimationFrame(frame);
}

// ---------- chain of events: when the clock passes a stage, show it (cause first, effects after their delays)
let realD = null, chainT = 0, chainHold = 0, lastGo = -99, hudUntil = 0, curChain = null;
const chainLog = [];
const goQueue = [];
const TYPE_NAME = { flare: 'Solar flare', sep: 'Solar proton event', cme: 'Coronal mass ejection', bzs: 'Southward magnetic field (Bz)', kp5: 'Geomagnetic storm' };
const fmtD = (ms) => { const m = Math.abs(ms) / 60e3; return (ms < 0 ? '−' : '+') + (m < 90 ? m.toFixed(m < 10 ? 1 : 0) + ' min' : m < 2880 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' d'); };
function drawHUD() {
  const el = $('chain'); if (!curChain) { el.hidden = true; return; }
  const c = curChain, t0 = c.stages[0].t;
  el.hidden = false;
  el.innerHTML = `<div class="ch-head"><b>Chain of events</b> · ${TYPE_NAME[c.e.type]}${D.demo ? ' <em>(demo)</em>' : ''}</div>` + c.stages.map((st) =>
    `<div class="ch-st ${st.done ? 'done' : ''} ${st === c.last ? 'now' : ''}"><span class="ch-t">${fmtD(st.t - t0)}</span><span class="ch-sc">${scenes[byId[st.scene]].label}</span><span class="ch-l">${st.label}</span></div>`).join('') +
    `<div class="ch-foot">${fmtTime(t0)} · times are when each effect happens where that scene is (Sun scene = emission time)</div>`;
}
function resetChains(T) { chainT = T; goQueue.length = 0; if (orch.chains) for (const c of orch.chains) c.stages.forEach((x) => { x.done = x.t <= T; }); }
function fireStage(c, st, t) {
  st.done = true; c.last = st; curChain = c; hudUntil = t + 30; drawHUD();
  chainLog.push({ type: c.e.type, fx: st.fx, scene: st.scene, t: st.t, wall: t });
  if (chainLog.length > 200) chainLog.shift();
  const sc = scenes[byId[st.scene]];
  const visible = scenes[cur] === sc || (next >= 0 && scenes[next] === sc);
  if (tourOn && !visible) goQueue.push({ c, st }); else reactions.stage(st, sc);
}
function runChains(t) {
  if (!D || !orch.chains) return;
  const following = orchFollowing() || replay.on;
  if (following) {
    const T = clockT();
    if (T < chainT || T - chainT > 30 * 864e5) resetChains(T);
    const due = [];
    for (const c of orch.chains) for (const st of c.stages) if (!st.done && st.t > chainT && st.t <= T) due.push([c, st]);
    due.sort((a, b) => a[1].t - b[1].t).slice(0, 6).forEach(([c, st]) => fireStage(c, st, t));
    chainT = T;
  }
  // tour follows the chain: visit each stage's scene in order, then show the stage there
  if (goQueue.length && t - lastGo > 3.4) {
    const { st } = goQueue.shift(), i = byId[st.scene];
    if (scenes[cur].id !== st.scene) go(i);
    lastGo = t; chainHold = t + 10;
    setTimeout(() => reactions.stage(st, scenes[i]), FADE * 600);
  }
  if (curChain && t > hudUntil) { curChain = null; drawHUD(); }
}
// event markers on the playhead bar (positions follow musical time, so event mode stretches them)
function drawMarkers() {
  const bar = $('replay-bar'); bar.querySelectorAll('.mk').forEach((m) => m.remove());
  if (!orch.chains || !orch.N) return;
  const span = replay.on ? [replay.start, replay.end] : null;
  for (const c of orch.chains) {
    const x = span ? (c.e.t - span[0]) / (span[1] - span[0]) : orch.kAtTime(c.e.t) / Math.max(1, orch.N - 1);
    if (x < 0 || x > 1) continue;
    const m = document.createElement('span'); m.className = 'mk mk-' + c.e.type; m.style.left = (x * 100).toFixed(2) + '%';
    m.title = `${TYPE_NAME[c.e.type]} · ${fmtTime(c.e.t)}` + (c.e.type === 'flare' ? ' · ' + xcls(c.e.peak) : c.e.type === 'kp5' ? ' · Kp ' + c.e.peak.toFixed(1) : c.e.type === 'bzs' ? ' · ' + c.e.peak.toFixed(0) + ' nT' : '');
    bar.appendChild(m);
  }
}
orch.on('retime', () => { drawMarkers(); strip.dirty = true; });
function setDemo(on) {
  if (!realD) return;
  D = on ? prepare(demoData(realD)) : realD; ctx.D = D;
  const was = orch.playing; orch.setData(D); orch.pos = 0; playK = on ? 0 : orch.N - 1; playT = orch.timeOf(playK); resetChains(playT);
  strip.reset(); setBadge(); computeTargets(); readout(); panel.render(); drawMarkers();
  if (on && !was && params.get('autoplay') !== '0') startOrchestra();
}

// ---------- boot
(async () => {
  const start = byId[params.get('scene')] ?? 0;
  go(start, true);
  tourOn = params.get('tour') !== '0'; btn('btn-tour', tourOn, 'Tour');
  try {
    realD = prepare(await loadSnapshot()); D = realD; ctx.D = D;
    if (params.get('event') === '1') orch.tl.eventMode = true;
    if (params.get('window')) orch.tl.window = params.get('window');
    if (params.get('bars')) orch.tl.barsPerDay = +params.get('bars') || 4;
    orch.setData(D); playK = orch.N - 1; orch.pos = 0;
    setBadge(); computeTargets(); Object.assign(P, Ptarget); readout();
  } catch (e) {
    console.warn('Snapshot data unavailable', e);
    $('badge-mode').textContent = 'NO DATA';
  }
  requestAnimationFrame(frame);
  if (D && params.get('live') !== '0') {
    await refreshLive(realD); prepare(realD);
    if (!D.demo) { orch.setData(D); if (!orch.playing) playK = orch.N - 1; strip.reset(); }
    setBadge(); readout();
  }
  if (params.get('demo') === '1') setDemo(true);
  setStrip(opt.strip); panel.render();
  // Bartels strip tooltip: the reading under the pointer, with its three times
  $('strip').addEventListener('mousemove', (e) => {
    const r = e.currentTarget.getBoundingClientRect(), hit = strip.at(e.clientX - r.left, e.clientY - r.top);
    e.currentTarget.title = hit ? `${hit.label}: ${hit.v} · ${fmtTime(hit.t)}` : 'Bartels light-up strip';
  });
  // optional longitude for Local Sidereal Time (typed by the viewer; location is never requested)
  const lonIn = $('lon-in'); if (lonIn) {
    const v = getLon(); lonIn.value = v === null ? '' : v;
    lonIn.addEventListener('change', () => { const x = lonIn.value.trim(); setLon(x === '' ? null : x); setBadge(); readout(); drawMarkers(); drawHUD(); $('lon-note').textContent = getLon() === null ? 'Showing GMST only.' : `Showing LST for ${getLon()}°.`; });
  }
  if (params.get('orch') === '1') toggleOrch(true);
  window.__spacewx = { spatial, THREE, unlockStats, setStripBig, goQueue, get shown() { return shown; }, get D() { return D; }, P, scenes, go, orch, reactions, strip, opt, chainLog, setDemo, clockT, get cur() { return cur; }, get playK() { return playK; } };
})();
