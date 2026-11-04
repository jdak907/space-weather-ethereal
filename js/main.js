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
import { Orchestra, noteColor, noteName, SET_INFO } from './orchestra.js';
import { createReactions } from './reactions.js';
import { BartelsStrip } from './strip.js';
import { buildPanel } from './panel.js';

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
const scenes = [createSun(ctx), createWind(ctx), createMagneto(ctx), createOval(ctx), createCurtain(ctx)];
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
const P = { kp: 2, kp24: 2, ap: 7, f107: 100, sn: 40, swSpeed: 400, swDens: 4, bz: 0 };
const Ptarget = { ...P };
const replay = { on: false, t: 0, start: 0, end: 0, speed: 0 };
const clock = new THREE.Clock();
const fmtTime = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function computeTargets() {
  if (!D) return;
  const following = orchFollowing();
  const now = following ? orch.timeOf(playK) : replay.on ? replay.t : Math.max(endTime(D.kp), endTime(D.sw, 'speed'));
  const pick = (v, fallback) => (v === null || v === undefined ? fallback : v);
  Ptarget.kp = pick(at(D.kp, now, 'v', 16), Ptarget.kp);
  Ptarget.kp24 = pick(maxOver(D.kp, now, 24 * 3600e3), Ptarget.kp);
  Ptarget.ap = pick(at(D.ap, now, 'v', 4), Ptarget.ap);
  Ptarget.f107 = pick(at(D.f107, now, 'v', 5), Ptarget.f107);
  Ptarget.sn = pick(sunspot(D, now).v, Ptarget.sn);
  // the solar wind record is only the last 24 h, so replay keeps its latest values
  // while the orchestra plays, the wind follows its own 24-hour loop (one 10-minute reading per step)
  const swT = following ? D.sw.t0 + orch.mapIdx('speed', playK) * D.sw.step
    : replay.on ? Math.min(now, endTime(D.sw, 'speed')) : endTime(D.sw, 'speed');
  Ptarget.swSpeed = pick(at(D.sw, swT, 'speed', 12), Ptarget.swSpeed);
  Ptarget.swDens = pick(at(D.sw, swT, 'dens', 12), Ptarget.swDens);
  Ptarget.bz = pick(at(D.sw, swT, 'bz', 12), Ptarget.bz);
}

function setBadge() {
  const b = $('badge'), live = anyLive(D);
  b.className = 'badge ' + (live ? 'live' : 'snapshot');
  $('badge-mode').textContent = live ? 'LIVE' : 'SNAPSHOT';
  const latestT = Math.max(endTime(D.kp), endTime(D.sw, 'speed'));
  $('badge-asof').textContent = live ? `data as of ${fmtTime(latestT)}` : `data as of ${D.snapshotAsOf}`;
  const parts = Object.entries({ 'Kp': D.live.kp, 'Solar wind': D.live.sw, 'F10.7': D.live.f107, 'Sunspots': D.live.ssn })
    .map(([k, v]) => `${k}: ${v ? 'live NOAA SWPC' : 'snapshot'}`);
  b.title = parts.join(' · ') + (D.errors.length ? `\nLive fetch issues: ${D.errors.join('; ')}` : '');
  $('about-status').innerHTML = `<p><b>Right now:</b> ${parts.join(' · ')}.<br>Bundled snapshot generated ${D.snapshotAsOf}.` +
    (D.errors.length ? `<br>Live fetch issues: ${D.errors.map((e) => e.replace(/</g, '&lt;')).join('; ')}` : '') + '</p>';
}

function readout() {
  if (!D) return;
  const s = scenes[cur];
  const f = (v, d = 0) => (v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toFixed(d));
  const Dp = Math.max(0.1, 1.6726e-6 * P.swDens * P.swSpeed * P.swSpeed);
  const { r0 } = shue(Dp, P.bz);
  const rows = [];
  const add = (k, v, cls = '') => rows.push(`<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);
  add('Kp (geomagnetic)', f(Ptarget.kp, 1), Ptarget.kp >= 5 ? 'hi' : '');
  if (s.id === 'sun') { add('F10.7 radio flux', f(Ptarget.f107, 0) + ' sfu'); add(sunspot(D, orchFollowing() ? orch.timeOf(playK) : replay.on ? replay.t : Date.now()).label, f(Ptarget.sn, 0)); add('Ap (daily)', f(Ptarget.ap, 0)); }
  if (s.id === 'wind' || s.id === 'magneto') {
    add('Wind speed', f(Ptarget.swSpeed, 0) + ' km/s'); add('Density', f(Ptarget.swDens, 1) + ' /cm³');
    add('IMF Bz', (Ptarget.bz > 0 ? '+' : '') + f(Ptarget.bz, 1) + ' nT ' + (Ptarget.bz < -0.5 ? '(south)' : Ptarget.bz > 0.5 ? '(north)' : ''), Ptarget.bz < -5 ? 'hi' : '');
  }
  if (s.id === 'magneto') { add('Dynamic pressure', f(Dp, 2) + ' nPa', 'model'); add('Magnetopause nose', f(r0, 1) + ' Earth radii', 'model'); }
  if (s.id === 'oval' || s.id === 'curtain') { add('Kp max, last 24 h', f(Ptarget.kp24, 1)); add('Oval edge (approx.)', '~' + f(ovalEdge(P.kp), 0) + '° mag. lat', 'model'); }
  rows.push('<div class="sep"></div>');
  const kpT = endTime(D.kp), swT = endTime(D.sw, 'speed');
  rows.push(`<span class="src">${orchFollowing() ? 'Orchestra playhead at ' + fmtTime(orch.timeOf(playK)) + ' (solar wind loops its latest 24 h)' : replay.on ? 'Replaying ' + fmtDay(replay.t) + ' (solar wind shows latest 24 h only)' : `Kp ${D.live.kp ? 'live' : 'snapshot'} to ${fmtTime(kpT)} · wind ${D.live.sw ? 'live' : 'snapshot'} to ${fmtTime(swT)}${D.sw.source ? ' (' + D.sw.source + ')' : ''}`}. Purple values are model estimates.</span>`);
  $('readout').innerHTML = rows.join('');
}

// ---------- scene switching, tour, captions
let cur = 0, next = -1, fadeT = 0;
const FADE = 4.0, DWELL = Math.max(5, +params.get('dwell') || (low ? 34 : 42));
let tourOn = params.get('tour') !== '0', dwellT = 0;
function caption(s) {
  const c = $('caption'); c.classList.add('fade');
  setTimeout(() => {
    $('cap-kicker').textContent = s.kicker; $('cap-title').textContent = s.title; $('cap-text').textContent = s.text;
    $('cap-inst').textContent = s.instrument; $('cap-note').textContent = s.note; c.classList.remove('fade'); readout();
  }, 600);
}
function setActive(i) {
  scenes.forEach((s, k) => (s.controls.enabled = k === i));
  document.querySelectorAll('#picker button').forEach((b, k) => b.classList.toggle('active', k === i));
}
function go(i, instant = false) {
  i = (i + scenes.length) % scenes.length;
  if (instant) { cur = i; next = -1; fadeT = 0; xfade.b = null; xfade.mix = 0; }
  else {
    if (next >= 0) { cur = next; next = -1; xfade.b = null; xfade.mix = 0; } // finish a pending fade
    if (i !== cur) { next = i; fadeT = 0; }
  }
  dwellT = 0; setActive(i); caption(scenes[i]);
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
const HOME = { kp: ['oval', 'curtain'], ap: ['curtain', 'oval'], f107: ['sun'], sn: ['sun'], speed: ['wind', 'magneto'], dens: ['wind', 'magneto'], bz: ['magneto', 'wind'] };
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
}
function setStrip(on) { opt.strip = on; $('strip-wrap').hidden = !on; strip.dirty = true; }
const panel = buildPanel($('orch'), orch, {
  play: startOrchestra, close: () => toggleOrch(false), stripSet: () => strip.id,
  setStrip: (id) => strip.setSet(id), get: (k) => opt[k],
  set: (k, v) => { opt[k] = v; if (k === 'strip') setStrip(v); if (k === 'follow') syncSound(); },
  changed: () => { strip.dirty = true; },
});
orch.on('state', () => syncSound());
orch.on('step', (e) => {
  playK = e.k;
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
  else if (k === 'h') toggleText(); else if (k === 'i') toggleAbout(); else if (k === 'escape') toggleAbout(false);
  else if (/^[1-5]$/.test(k)) go(+k - 1);
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

// ---------- main loop
let readoutAcc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (!document.hidden) {
    if (orchFollowing()) {
      $('replay-fill').style.width = (playK / Math.max(1, orch.N - 1) * 100).toFixed(2) + '%';
      $('replay-date').textContent = '♪ ' + fmtTime(orch.timeOf(playK)) + ' · Kp ' + (Ptarget.kp ?? 0).toFixed(1);
      const pos = document.getElementById('o-pos'); if (pos) pos.textContent = fmtDay(orch.timeOf(playK)) + ' · step ' + (playK + 1) + ' of ' + orch.N;
    } else if (replay.on && D) {
      replay.t += replay.speed * dt;
      if (replay.t > replay.end) replay.t = replay.start;
      $('replay-fill').style.width = ((replay.t - replay.start) / (replay.end - replay.start) * 100).toFixed(2) + '%';
      $('replay-date').textContent = fmtDay(replay.t) + ' · Kp ' + (Ptarget.kp ?? 0).toFixed(1);
    }
    computeTargets();
    const k = Math.min(1, dt * (replay.on ? 1.5 : 0.6));
    for (const key in P) P[key] += (Ptarget[key] - P[key]) * k;

    // tour
    if (tourOn && next < 0 && $('about').hidden) {
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
    const bTarget = next >= 0 ? THREE.MathUtils.lerp(scenes[cur].bloom ?? 0.8, scenes[next].bloom ?? 0.8, xfade.mix) : (scenes[cur].bloom ?? 0.8);
    bloom.strength = bTarget * (low ? 0.85 : 1);
    const active = [scenes[cur]]; if (next >= 0) active.push(scenes[next]);
    for (const s of active) { s.update(t, dt, P); drift(s, t, dt); }
    tickStars(t);
    finalPass.uniforms.uTime.value = t % 100;
    composer.render(dt);

    // orchestra: hand over notes whose audio time has come, then animate their reactions
    orch.drain();
    reactions.update(dt);
    if (opt.strip) strip.draw(dt);
    readoutAcc += dt; if (readoutAcc > 1) { readoutAcc = 0; readout(); }
    if (t - lastMove > 9 && $('about').hidden) $('ui').classList.add('idle');
  }
  requestAnimationFrame(frame);
}

// ---------- boot
(async () => {
  const start = byId[params.get('scene')] ?? 0;
  go(start, true);
  tourOn = params.get('tour') !== '0'; btn('btn-tour', tourOn, 'Tour');
  try {
    D = await loadSnapshot();
    orch.setData(D); playK = orch.N - 1; orch.pos = 0;
    setBadge(); computeTargets(); Object.assign(P, Ptarget); readout();
  } catch (e) {
    console.warn('Snapshot data unavailable', e);
    $('badge-mode').textContent = 'NO DATA';
  }
  requestAnimationFrame(frame);
  if (D && params.get('live') !== '0') {
    await refreshLive(D);
    orch.setData(D); if (!orch.playing) playK = orch.N - 1; strip.reset();
    setBadge(); readout();
  }
  setStrip(opt.strip); panel.render();
  if (params.get('orch') === '1') toggleOrch(true);
  window.__spacewx = { D, P, scenes, go, orch, reactions, strip, opt, get cur() { return cur; }, get playK() { return playK; } };
})();
