import * as THREE from 'three';
import { NOISE, rng } from '../glsl.js';
import { makeStars, makeNebula } from '../stars.js';
import { makeEarth } from './earth.js';

// Scene 3: Earth's magnetosphere. 1 scene unit = 1 Earth radius (RE); the Sun is toward +x.
// Magnetopause: Shue et al. (1998) empirical model from measured solar wind dynamic
// pressure and IMF Bz. Bow shock: paraboloid at a typical 1.3x standoff (stylized).
// Field lines: a dipole squeezed inside the model magnetopause and stretched into a tail (stylized).
export function shue(Dp, Bz) {
  const r0 = (10.22 + 1.29 * Math.tanh(0.184 * (Bz + 8.14))) * Math.pow(Dp, -1 / 6.6);
  const a = (0.58 - 0.007 * Bz) * (1 + 0.024 * Math.log(Dp));
  return { r0, a };
}

export function createMagneto(ctx) {
  const rnd = rng(42);
  const scene = new THREE.Scene();
  scene.add(makeNebula(new THREE.Color(0.03, 0.05, 0.09), 5.0));
  scene.add(makeStars(ctx.stars, ctx.pr));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
  camera.position.set(10, 22, 50);

  const U = { uTime: { value: 0 }, uFlow: { value: 0 }, uFade: { value: 1 }, uKp: { value: 2 } };
  const earth = makeEarth(1, { aurora: true, sun: new THREE.Vector3(1, 0, 0) });
  scene.add(earth);

  // ---------- surfaces (magnetopause + bow shock), rebuilt when the model changes
  const surfMat = (col, strength) => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(...col) }, uS: { value: strength }, uTime: U.uTime, uFade: U.uFade },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;} `,
    fragmentShader: NOISE + `uniform vec3 uCol; uniform float uS, uTime, uFade; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(max(1.0-abs(dot(vN,vV)),0.0), 3.0);
        float n = 0.65 + 0.35*snoise(vP*0.12 + vec3(uTime*0.05,0.0,0.0));
        float tail = smoothstep(-70.0,-20.0, vP.y);
        gl_FragColor = vec4(uCol*f*n*uS*tail*uFade, 1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mpMesh = new THREE.Mesh(new THREE.BufferGeometry(), surfMat([0.35, 0.75, 1.0], 0.16));
  const bsMesh = new THREE.Mesh(new THREE.BufferGeometry(), surfMat([0.9, 0.75, 1.0], 0.09));
  mpMesh.rotation.z = bsMesh.rotation.z = -Math.PI / 2; // lathe axis (y) -> +x (sunward)
  scene.add(mpMesh, bsMesh);

  function mpProfile(r0, a) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const th = (i / 80) * THREE.MathUtils.degToRad(150);
      const r = r0 * Math.pow(2 / (1 + Math.cos(th)), a);
      const x = r * Math.cos(th); if (x < -70) break;
      pts.push(new THREE.Vector2(Math.max(1e-3, r * Math.sin(th)), x));
    }
    return pts;
  }
  function bsProfile(xbs) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const rho = (i / 60) * 4.2 * xbs; // x = xbs - rho^2/(4 xbs)
      const x = xbs - rho * rho / (4 * xbs); if (x < -70) break;
      pts.push(new THREE.Vector2(Math.max(1e-3, rho), x));
    }
    return pts;
  }

  // ---------- field lines
  const LINE_N = 120;
  const lineMat = new THREE.ShaderMaterial({
    uniforms: { uFlow: U.uFlow, uFade: U.uFade, uKp: U.uKp },
    vertexShader: `attribute float aS; attribute float aKind; varying float vS; varying float vK; void main(){ vS=aS; vK=aKind; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform float uFlow, uFade, uKp; varying float vS; varying float vK;
      void main(){
        vec3 closed = vec3(0.30,0.85,0.95), open = vec3(0.55,0.55,1.0);
        vec3 c = mix(closed, open, vK);
        float dash = 0.5+0.5*sin(vS*40.0 - uFlow*(1.0+vK));
        float a = (0.18 + 0.30*pow(max(dash,0.0),6.0)) * (0.8 + 0.06*uKp);
        a *= mix(1.0, 1.0 - smoothstep(0.55, 1.0, vS), vK);
        gl_FragColor = vec4(c*a*uFade, 1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lineGeo = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(lineGeo, lineMat); lines.frustumCulled = false; scene.add(lines);
  const LONS = 12, LS = [2.2, 3.2, 4.4, 5.8, 7.4, 9.2];
  const OPEN = 10;

  function buildLines(r0, a, kp) {
    const R = (th) => r0 * Math.pow(2 / (1 + Math.cos(th)), a);
    const pos = [], sArr = [], kind = [], idx = [];
    let base = 0;
    const push = (P, k) => {
      for (let i = 0; i < P.length; i++) {
        pos.push(P[i].x, P[i].y, P[i].z); sArr.push(i / (P.length - 1)); kind.push(k);
        if (i < P.length - 1) idx.push(base + i, base + i + 1);
      }
      base += P.length;
    };
    const stretch = 0.25 + 0.12 * kp;
    for (let j = 0; j < LONS; j++) {
      const phi = (j / LONS) * Math.PI * 2;
      for (const L0 of LS) {
        const L = L0 * Math.min(1, (r0 * 0.95) / 10.5);
        const P = [];
        const lam0 = Math.acos(Math.sqrt(1 / L));
        for (let i = 0; i < LINE_N; i++) {
          const lam = -lam0 + (2 * lam0 * i) / (LINE_N - 1);
          const r = L * Math.cos(lam) ** 2;
          let x = r * Math.cos(lam) * Math.cos(phi), y = r * Math.sin(lam), z = r * Math.cos(lam) * Math.sin(phi);
          const rr = Math.hypot(x, y, z), th = Math.acos(THREE.MathUtils.clamp(x / rr, -1, 1));
          const Rm = R(th) * 0.93;
          const k = 1 / Math.pow(1 + Math.pow(rr / Rm, 6), 1 / 6);
          x *= k; y *= k; z *= k;
          if (x < 0) { // nightside stretch toward the tail
            const f = 1 + stretch * Math.pow(L / 6, 2);
            x *= f; y *= 1 - 0.18 * Math.min(1, (L / 9) * stretch * 2);
          }
          P.push(new THREE.Vector3(x, y, z));
        }
        push(P, 0);
      }
    }
    // open tail-lobe lines from the polar caps
    const lobeH = 0.55 * r0 * Math.pow(2, a) * 0.85;
    for (let hemi = -1; hemi <= 1; hemi += 2) for (let j = 0; j < OPEN; j++) {
      const lon = Math.PI * (0.55 + 0.9 * (j / (OPEN - 1))); // nightside half
      const lat = THREE.MathUtils.degToRad(76 + 8 * rnd());
      const p0 = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), hemi * Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const zz = Math.sin(lon) * (0.4 + 0.5 * rnd()) * lobeH * 1.3;
      const ctrl = [p0, p0.clone().multiplyScalar(3.0), new THREE.Vector3(-4, hemi * lobeH * 0.55, zz * 0.4),
        new THREE.Vector3(-18, hemi * lobeH * 0.85, zz * 0.8), new THREE.Vector3(-40, hemi * lobeH * 0.95, zz), new THREE.Vector3(-68, hemi * lobeH, zz)];
      const P = new THREE.CatmullRomCurve3(ctrl).getPoints(LINE_N - 1);
      push(P, 1);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lineGeo.setAttribute('aS', new THREE.Float32BufferAttribute(sArr, 1));
    lineGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    lineGeo.setIndex(idx);
  }

  // ---------- solar wind flow around the obstacle (GPU points)
  const N = Math.floor(ctx.particles * 0.5);
  const fg = new THREE.BufferGeometry();
  const b = new Float32Array(N), az = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { b[i] = Math.sqrt(rnd()) * 34; az[i] = rnd() * Math.PI * 2; ph[i] = rnd(); }
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  fg.setAttribute('aB', new THREE.BufferAttribute(b, 1));
  fg.setAttribute('aAz', new THREE.BufferAttribute(az, 1));
  fg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const FU = { uDist: { value: 0 }, uR0: { value: 10 }, uXbs: { value: 13 }, uPR: { value: ctx.pr }, uFade: U.uFade, uDens: { value: 0.5 } };
  const flowMat = new THREE.ShaderMaterial({
    uniforms: FU,
    vertexShader: /* glsl */`
      attribute float aB, aAz, aPh; uniform float uDist, uR0, uXbs, uPR, uDens;
      varying float vA; varying float vSheath;
      void main(){
        float L = 110.0;
        float spd = 0.75 + 0.5*fract(aPh*13.71);            // parcels move at slightly different speeds
        float x = 40.0 - mod(aPh*L + uDist*spd, L);
        // flow wraps around a paraboloid obstacle (approximate magnetopause shape)
        float rhoMP2 = max(0.0, 2.25*uR0*(uR0 - x));
        float rho = sqrt(aB*aB + rhoMP2);
        float rhoBS2 = max(0.0, 4.0*uXbs*(uXbs - x));
        vSheath = step(rho*rho, rhoBS2);
        // gentle turbulence, stronger in the magnetosheath and the wake
        float tb = 0.25 + 1.2*vSheath + 0.8*smoothstep(0.0, -40.0, x);
        float w = sin(x*0.21 + aAz*5.0 + uDist*0.13) * sin(x*0.07 - aPh*31.0);
        rho += tb*w; float az = aAz + 0.04*tb*sin(x*0.15 + aPh*47.0);
        vec3 p = vec3(x, rho*cos(az), rho*sin(az));
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        vA = smoothstep(40.0, 30.0, x) * smoothstep(-70.0, -50.0, x) * step(fract(aPh*7.13), uDens);
        gl_PointSize = (2.0 + vSheath*1.2) * uPR * clamp(60.0/-mv.z, 0.5, 3.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vSheath; uniform float uFade;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d);
        if (vA*a < 0.003) discard;
        vec3 c = mix(vec3(0.95,0.85,0.6), vec3(1.0,0.55,0.35), vSheath);
        gl_FragColor = vec4(c*a*vA*0.9*uFade, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flow = new THREE.Points(fg, flowMat); flow.frustumCulled = false; scene.add(flow);

  // ---------- radiation belts / ring current (stylized glow torus of points)
  const NB = Math.floor(ctx.particles * 0.12);
  const bp = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const L = rnd() < 0.35 ? 1.4 + rnd() * 0.8 : 3.2 + rnd() * 2.6;
    const lam = (rnd() - 0.5) * 0.9 * (1.0 / Math.sqrt(L));
    const r = L * Math.cos(lam) ** 2, phi = rnd() * Math.PI * 2;
    bp.set([r * Math.cos(lam) * Math.cos(phi), r * Math.sin(lam), r * Math.cos(lam) * Math.sin(phi)], i * 3);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  const beltMat = new THREE.PointsMaterial({ color: new THREE.Color(0.5, 0.3, 0.9), size: 0.08, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const belts = new THREE.Points(bg, beltMat); scene.add(belts);

  let built = { r0: -1, a: -1, kp: -1 }, lastBuild = -10;
  const state = { r0: 10, a: 0.58, xbs: 13, Dp: 2 };
  return {
    id: 'magneto', label: 'Magnetosphere',
    kicker: 'Scene 3 · The shield',
    title: 'Earth\'s magnetosphere',
    text: 'Earth\'s magnetic field carves a cavity in the solar wind. The wind\'s pressure squeezes the day side and drags the night side into a long tail. A shock wave (the bow shock) stands in front, where the supersonic wind suddenly slows. Higher pressure pushes the boundary closer to Earth.',
    instrument: 'Boundary distance from the Shue et al. (1998) model fed by measured solar wind speed, density and Bz (NOAA real-time solar wind). In space, missions such as THEMIS, Cluster and MMS map this region.',
    note: 'Not to scale outside the model boundary. Field lines are a stylized compressed dipole; the dipole tilt and bow-shock physics are simplified. Purple glow: radiation belts (stylized).',
    scene, camera, state, bloom: 0.6,
    orbit: { target: new THREE.Vector3(-6, 0, 0), minDistance: 8, maxDistance: 160, home: 66, zoomAmp: 0.22, spin: 0.015, polar: 1.1 },
    update(t, dt, P) {
      U.uTime.value = t; U.uKp.value = P.kp;
      earth.material.uniforms.uTime.value = t; earth.material.uniforms.uKp.value = P.kp;
      earth.material.uniforms.uSpin.value = t * 0.01;
      const Dp = Math.max(0.1, 1.6726e-6 * P.swDens * P.swSpeed * P.swSpeed);
      const { r0, a } = shue(Dp, P.bz);
      state.r0 = r0; state.a = a; state.Dp = Dp; state.xbs = 1.3 * r0;
      if (t - lastBuild > 0.4 && (Math.abs(r0 - built.r0) > 0.03 || Math.abs(a - built.a) > 0.003 || Math.abs(P.kp - built.kp) > 0.05)) {
        mpMesh.geometry.dispose(); mpMesh.geometry = new THREE.LatheGeometry(mpProfile(r0, a), 72);
        bsMesh.geometry.dispose(); bsMesh.geometry = new THREE.LatheGeometry(bsProfile(state.xbs), 72);
        buildLines(r0, a, P.kp);
        built = { r0, a, kp: P.kp }; lastBuild = t;
      }
      U.uFlow.value += dt * (1.0 + P.kp * 0.25);
      FU.uDist.value += dt * (P.swSpeed / 400) * 6.0;
      FU.uR0.value = r0; FU.uXbs.value = state.xbs;
      FU.uDens.value = THREE.MathUtils.clamp(0.15 + P.swDens / 12, 0.15, 1);
      beltMat.opacity = 0.12 + 0.05 * P.kp;
      belts.rotation.y = t * 0.02;
    },
  };
}
