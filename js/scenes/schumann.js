import * as THREE from 'three';
import { NOISE } from '../glsl.js';
import { makeStars, makeNebula } from '../stars.js';
import { LAND_W, LAND_H } from '../landmask.js';
import { land, srAt, srSpectrum, sampleStorm, diurnal, geo, subsolar, REGIONS, SR_F0 } from '../schumann.js';

// Scene 6: the Earth-ionosphere cavity and its Schumann resonances (MODELED, see js/schumann.js).
// Earth (real continents from a 1-degree Natural Earth land mask), the ionosphere as a glowing shell,
// standing-wave modes n = 1..5 drawn as Legendre patterns P_n(cos theta) breathing between the two
// surfaces, lightning flashes where the model puts afternoon storms for the UTC hour, and a small
// spectrum panel. Shell height and mode speeds are exaggerated so they can be seen.
const CENTERS = [geo(5, 110), geo(2, 22), geo(-5, -62)]; // chimney centers: SE Asia, Africa, Amazon
const LAPSE = 24 * 3600 / 72; // time-lapse when not following the playhead: one day in 72 s

export function createSchumann(ctx) {
  const scene = new THREE.Scene();
  scene.add(makeNebula(new THREE.Color(0.03, 0.04, 0.08), 9.0));
  scene.add(makeStars(ctx.stars, ctx.pr));
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000);
  camera.position.set(1.2, 1.4, 4.4);

  const sunDir = new THREE.Vector3(1, 0, 0);
  const tex = new THREE.DataTexture(new Uint8Array(LAND_W * LAND_H).map((_, i) => land[i] * 255), LAND_W, LAND_H, THREE.RedFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
  const U = {
    uTime: { value: 0 }, uSun: { value: sunDir }, uLand: { value: tex }, uFlare: { value: 0 }, uPCA: { value: 0 }, uStorm: { value: 0 },
    uA: { value: [1, 0.7, 0.5, 0.35, 0.25] }, uPh: { value: [0, 0, 0, 0, 0] }, uHi: { value: [0, 0, 0, 0, 0] },
    uAxis: { value: new THREE.Vector3(...CENTERS[1]) }, uHiCol: { value: new THREE.Color(1, 1, 1) }, uI: { value: 1 }, uKp: { value: 2 },
  };
  const geoGLSL = /* glsl */`
    vec2 lonlat(vec3 p){ return vec2(atan(-p.z, p.x), asin(clamp(p.y,-1.0,1.0))); }`;
  // ---------- Earth
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + geoGLSL + /* glsl */`
      uniform sampler2D uLand; uniform vec3 uSun; uniform float uTime, uFlare; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec2 ll = lonlat(vP);
        vec2 uv = vec2((ll.x + 3.14159265)/6.2831853, (1.5707963 - ll.y)/3.14159265);
        float landM = smoothstep(0.35, 0.65, texture2D(uLand, uv).r);
        float n = fbm3(vP*6.0);
        vec3 ocean = vec3(0.02,0.07,0.2) + vec3(0.0,0.03,0.06)*n;
        float trop = 1.0 - smoothstep(15.0, 35.0, abs(degrees(ll.y)));
        vec3 ground = mix(vec3(0.24,0.22,0.14), vec3(0.08,0.2,0.07), trop*0.8) * (0.85 + 0.3*n);
        float ice = smoothstep(62.0, 72.0, abs(degrees(ll.y))) * (landM > 0.5 || abs(degrees(ll.y)) > 75.0 ? 1.0 : 0.0);
        vec3 c = mix(ocean, ground, landM); c = mix(c, vec3(0.78,0.82,0.88), ice);
        float cloud = smoothstep(0.2, 0.7, fbm3(vP*3.2 + vec3(uTime*0.01,0.0,0.0)))*0.35;
        c = mix(c, vec3(0.8), cloud);
        float d = dot(normalize(vP), normalize(uSun));
        float day = smoothstep(-0.1, 0.25, d);
        vec3 col = c*(0.05 + 0.72*day);
        col += vec3(1.0,0.65,0.3) * landM * (1.0-day) * smoothstep(0.6,0.8, snoise(vP*55.0)) * 0.12; // faint city lights
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)),0.0), 3.0);
        col += vec3(0.25,0.5,1.0) * rim * (0.12 + 0.6*max(d+0.2,0.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const world = new THREE.Group(); scene.add(world);
  world.add(earth);

  // ---------- mode field between the surfaces: sum of a_n P_n(cos theta) cos(phase_n), theta from the storm axis
  const MODE_R = 1.055, ION_R = 1.11;
  const modeMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uA[5], uPh[5], uHi[5]; uniform vec3 uAxis; varying float vF; varying float vHi; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float P(int n, float x){ float x2=x*x;
        if(n==0) return x; if(n==1) return 0.5*(3.0*x2-1.0); if(n==2) return 0.5*(5.0*x2*x-3.0*x);
        if(n==3) return 0.125*(35.0*x2*x2-30.0*x2+3.0); return 0.125*(63.0*x2*x2*x-70.0*x2*x+15.0*x); }
      void main(){
        vec3 p = normalize(position); float x = dot(p, normalize(uAxis));
        float f = 0.0, hi = 0.0;
        for (int n = 0; n < 5; n++){ float a = uA[n]*(1.0+1.5*uHi[n]); f += a*P(n,x)*cos(uPh[n]); hi += uHi[n]*abs(P(n,x)); }
        vF = f; vHi = hi; vP = p;
        vec3 pos = position * (1.0 + 0.028*f);
        vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(pos,1.0); vV = normalize(cameraPosition-w.xyz);
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      uniform float uI; uniform vec3 uHiCol; varying float vF; varying float vHi; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        float a = abs(vF);
        float contour = 1.0 - smoothstep(0.0, 0.08, abs(fract(vF*3.0+0.5)-0.5));
        vec3 pos = vec3(1.0,0.62,0.28), neg = vec3(0.3,0.75,1.0);
        vec3 c = mix(neg, pos, step(0.0, vF));
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float alpha = (0.025 + 0.11*a + 0.12*contour*a) * (0.35 + 0.65*uI) * (0.3 + 0.8*edge);
        vec3 col = c*alpha + uHiCol*vHi*0.1*(0.4+edge);
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const modeShell = new THREE.Mesh(new THREE.SphereGeometry(MODE_R, 160, 80), modeMat);
  world.add(modeShell);

  // ---------- ionosphere shell (the cavity ceiling): dayside brighter; flares, protons and storms light it
  const ion = new THREE.Mesh(new THREE.SphereGeometry(ION_R, 96, 48), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uSun; uniform float uTime, uFlare, uPCA, uStorm, uKp; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float d = dot(vP, normalize(uSun)), day = smoothstep(-0.2, 0.6, d);
        float tex = 0.75 + 0.25*snoise(vP*5.0 + vec3(0.0, uTime*0.03, 0.0));
        vec3 c = vec3(0.35,0.42,1.0) * (0.07 + 0.14*day) * edge * tex;
        c += vec3(0.8,0.75,1.0) * uFlare * day * (0.06 + 0.5*edge);                         // sudden ionospheric disturbance (X-rays, dayside)
        float cap = smoothstep(55.0, 70.0, abs(degrees(asin(clamp(vP.y,-1.0,1.0)))));
        c += vec3(1.0,0.35,0.55) * uPCA * cap * (0.12 + 0.6*edge);                           // polar cap absorption (protons)
        float oval = exp(-pow((abs(degrees(asin(clamp(vP.y,-1.0,1.0)))) - (68.0 - 2.0*uKp))/4.0, 2.0));
        c += vec3(0.3,1.0,0.55) * oval * (0.04 + 0.03*uKp + 0.4*uStorm) * (0.5+edge);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  world.add(ion);

  // ---------- lightning flashes (GPU points; birth time + strength per point)
  const NL = ctx.mobile ? 220 : 420;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NL * 3), 3));
  lg.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(NL).fill(-99), 1));
  lg.setAttribute('aAmp', new THREE.BufferAttribute(new Float32Array(NL), 1));
  const lmat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPR: { value: ctx.pr } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aBirth, aAmp; uniform float uTime, uPR; varying float vB;
      void main(){ float age = uTime - aBirth; float fl = age < 0.0 ? 0.0 : exp(-age*5.0) * (0.6 + 0.4*step(0.5, fract(age*13.0 + aAmp*7.0)));
        vB = fl*aAmp; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = (5.0 + 30.0*vB) * uPR * clamp(4.6/-mv.z, 0.4, 3.0); }`,
    fragmentShader: `varying float vB; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a *= a; if (vB*a < 0.002) discard;
        gl_FragColor = vec4(vec3(0.75,0.85,1.0)*a*vB*1.6 + vec3(1.0)*smoothstep(0.12,0.0,d)*vB, 1.0); }`,
  });
  const lpts = new THREE.Points(lg, lmat); lpts.frustumCulled = false; world.add(lpts);
  let li = 0, spawnAcc = 0;
  // sferics: rings that race around the cavity from a strong stroke (slowed down a lot)
  const ringGeo = new THREE.RingGeometry(0.985, 1.0, 128);
  const rings = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fc7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; m.userData = { t: 0, busy: false, p: new THREE.Vector3(), dur: 2.2 }; world.add(m); return m;
  });
  const Z = new THREE.Vector3(0, 0, 1);
  function sferic(p, col, dur = 2.4, op = 0.5) {
    const r = rings.find((x) => !x.userData.busy); if (!r) return;
    r.userData.busy = true; r.userData.t = 0; r.userData.dur = dur; r.userData.op = op; r.userData.p.copy(p).normalize(); r.visible = true;
    r.material.color.copy(col || new THREE.Color(0.62, 0.78, 1.0)); r.quaternion.setFromUnitVectors(Z, r.userData.p);
  }

  // ---------- state
  const hooks = { boost: [0, 0, 0, 0, 0], col: [null, null, null, null, null], sferic, spec: null, U };
  const st = { simT: Date.now(), lapse: true, s: null, D: null };
  const axis = new THREE.Vector3(...CENTERS[1]);
  let specAcc = 1;
  const specCv = document.getElementById('sr-spec');

  function drawSpectrum(s, hi) {
    if (!specCv || specCv.offsetParent === null) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = specCv.clientWidth, H = specCv.clientHeight;
    if (specCv.width !== Math.round(W * dpr)) { specCv.width = Math.round(W * dpr); specCv.height = Math.round(H * dpr); }
    const g = specCv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const L = 26, R = 8, top = 18, sh = Math.round(H * 0.52), plotW = W - L - R;
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(220,228,245,.85)'; g.fillText('Schumann spectrum', 4, 8);
    g.fillStyle = '#c9b8ff'; g.textAlign = 'right'; g.fillText('MODELED', W - 4, 8); g.textAlign = 'left';
    const X = (f) => L + (f / 40) * plotW;
    let mx = 0; for (let f = 3; f <= 40; f += 0.25) mx = Math.max(mx, srSpectrum({ ...s, A: s.A.map((a) => a / Math.sqrt(Math.max(0.05, s.I))) }, f));
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(L, top + sh); g.lineTo(L + plotW, top + sh); g.stroke();
    // curve (power, relative to the day's maximum)
    g.beginPath();
    for (let px = 0; px <= plotW; px += 1.5) {
      const f = (px / plotW) * 40, y = srSpectrum(s, f, hi) / mx + 0.02 * Math.sin(f * 9 + performance.now() / 300);
      const yy = top + sh - Math.min(1.15, y) * (sh - 4); if (px === 0) g.moveTo(L + px, yy); else g.lineTo(L + px, yy);
    }
    const grad = g.createLinearGradient(0, top, 0, top + sh); grad.addColorStop(0, 'rgba(255,190,120,.95)'); grad.addColorStop(1, 'rgba(120,190,255,.7)');
    g.strokeStyle = grad; g.lineWidth = 1.6; g.stroke(); g.lineWidth = 1;
    for (let n = 0; n < 5; n++) {
      const x = X(s.f[n]);
      g.fillStyle = hooks.col[n] && hi[n] > 0.02 ? hooks.col[n] : 'rgba(200,210,230,.55)';
      g.fillRect(x - 0.5, top + sh + 2, 1, 4);
      g.textAlign = 'center'; g.fillText(s.f[n].toFixed(1), x, top + sh + 11);
    }
    g.textAlign = 'left'; g.fillStyle = 'rgba(200,210,230,.5)'; g.fillText('Hz', 4, top + sh + 11);
    // diurnal strip: modeled global lightning by UTC hour, with the playhead hour
    const y0 = top + sh + 30, dh = H - y0 - 14, tb = diurnal(Math.floor((st.simT - Date.UTC(new Date(st.simT).getUTCFullYear(), 0, 0)) / 864e5));
    g.beginPath();
    for (let k = 0; k < 96; k++) { const x = L + (k / 96) * plotW, y = y0 + dh - (tb.tot[k] / tb.mx) * dh; if (!k) g.moveTo(x, y); else g.lineTo(x, y); }
    g.strokeStyle = 'rgba(160,200,255,.7)'; g.stroke();
    const cx = L + (s.ut / 24) * plotW; g.fillStyle = '#fff'; g.fillRect(cx - 0.75, y0, 1.5, dh);
    g.fillStyle = 'rgba(200,210,230,.6)'; g.textAlign = 'right'; g.fillText('modeled lightning by UTC hour', W - 4, y0 - 7); g.textAlign = 'left';
    [['Asia', 8], ['Africa', 14.5], ['Americas', 20.5]].forEach(([l, h]) => { g.textAlign = 'center'; g.fillText(l, L + (h / 24) * plotW, y0 + dh + 7); });
    g.textAlign = 'left';
  }

  return {
    id: 'schumann', label: 'Schumann',
    kicker: 'Scene 6 · The ringing cavity',
    title: 'Schumann resonances',
    text: 'Lightning strikes about 50 times a second worldwide. Its radio waves race around the planet between the ground and the bottom of the ionosphere, and waves that line up after a full lap ring like a bell: about 7.8, 14.3, 20.8, 27.3 and 33.8 Hz. Storms peak in the late afternoon over Asia, Africa and the Americas in turn, so the ringing swells and fades through the day.',
    instrument: 'MODELED: no open live Schumann data exists for web pages (stations publish pictures). Intensity comes from where tropical land storms are in the afternoon for the UTC hour; frequencies shift with live NOAA GOES X-rays (up) and proton events (down).',
    note: 'Not to scale: the real cavity is only 60 to 90 km tall. Wave patterns are Legendre modes P1-P5 around the main storm region, slowed about 14×. When the music is off, the clock runs as a time-lapse (one day in 72 seconds).',
    scene, camera, hooks, state: st, world, bloom: 0.45,
    orbit: { target: new THREE.Vector3(0, 0, 0), minDistance: 1.6, maxDistance: 30, home: 5.4, zoomAmp: 0.12, spin: 0.02, polar: 1.25 },
    update(t, dt, P) {
      // while idle, the globe turns slowly so the busiest storm region faces the viewer
      if (!this.dragging && t - (this.lastUser ?? -1e9) > 12) {
        const ca = Math.atan2(camera.position.x, camera.position.z), aa = Math.atan2(axis.x, axis.z);
        let d = ca - aa - world.rotation.y; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        world.rotation.y += d * Math.min(1, dt * 0.25);
      }
      const clk = ctx.clock ? ctx.clock() : null;
      if (clk && clk.follow) { st.simT = clk.t; st.lapse = false; } else { st.simT += dt * LAPSE * 1000; st.lapse = true; }
      const s = srAt(ctx.D, st.simT, P.kp); st.s = s;
      const ss = subsolar(st.simT); sunDir.set(...geo(ss.lat, ss.lon));
      U.uTime.value = t; U.uI.value = s.I; U.uKp.value = P.kp;
      // the field pattern is centered on the busiest storm region (weighted by the model's regional shares)
      const want = new THREE.Vector3(); s.shares.forEach((w, r) => want.addScaledVector(new THREE.Vector3(...CENTERS[r]), w * w));
      axis.lerp(want.normalize(), Math.min(1, dt * 0.8)).normalize(); U.uAxis.value.copy(axis);
      for (let n = 0; n < 5; n++) {
        U.uPh.value[n] += dt * 2 * Math.PI * s.f[n] * 0.07;
        U.uA.value[n] = s.A[n] * 0.85;
        hooks.boost[n] = Math.max(0, hooks.boost[n] - dt * 0.7); U.uHi.value[n] = hooks.boost[n];
      }
      // space weather from the data at this time (plus chain-of-events emphasis, which decays)
      const xrGlow = s.xr ? Math.min(1, Math.max(0, (Math.log10(s.xr) + 6) / 2)) : 0;
      const pGlow = s.p10 !== null && s.p10 >= 10 ? Math.min(1, 0.4 + Math.log10(s.p10 / 10) / 2) : 0;
      U.uFlare.value = Math.max(U.uFlare.value - dt * 0.35, xrGlow * 0.6);
      U.uPCA.value = Math.max(U.uPCA.value - dt * 0.3, pGlow * 0.6);
      U.uStorm.value = Math.max(0, U.uStorm.value - dt * 0.3);
      // lightning: rate follows modeled global intensity
      spawnAcc += dt * (ctx.mobile ? 26 : 48) * (0.25 + s.I * s.I * 1.1);
      const posA = lg.attributes.position, bA = lg.attributes.aBirth, aA = lg.attributes.aAmp;
      let spawned = false;
      while (spawnAcc >= 1) {
        spawnAcc -= 1; const c = sampleStorm(st.simT); if (!c) continue;
        const p = geo(c.lat, c.lon, 1.012); posA.setXYZ(li, ...p);
        bA.setX(li, t + Math.random() * 0.05); const amp = 0.4 + Math.random() * 0.6; aA.setX(li, amp);
        if (amp > 0.97 && Math.random() < 0.4) sferic(new THREE.Vector3(...p), null, 2.6, 0.16);
        li = (li + 1) % NL; spawned = true;
      }
      if (spawned) { posA.needsUpdate = true; bA.needsUpdate = true; aA.needsUpdate = true; }
      for (const r of rings) {
        const u = r.userData; if (!u.busy) continue; u.t += dt; const x = u.t / u.dur;
        if (x >= 1) { u.busy = false; r.visible = false; continue; }
        const al = x * Math.PI, R = MODE_R;
        r.position.copy(u.p).multiplyScalar(Math.cos(al) * R); r.scale.setScalar(Math.max(0.001, Math.sin(al) * R));
        r.material.opacity = u.op * (x < 0.08 ? x / 0.08 : 1 - x) ;
      }
      specAcc += dt; if (specAcc > (ctx.mobile ? 0.1 : 0.066)) { specAcc = 0; drawSpectrum(s, hooks.boost); }
    },
  };
}
export { REGIONS, SR_F0 };
