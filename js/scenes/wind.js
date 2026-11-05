import * as THREE from 'three';
import { NOISE, rng } from '../glsl.js';
import { makeStars, makeNebula } from '../stars.js';

// Scene 2: the solar wind streaming from the Sun past Earth, with the Parker spiral.
// Spiral pitch uses the real relation tan(psi) = Omega_sun * r / v (about 45 degrees at 1 AU
// for 400 km/s). Distances and sizes are not to scale; travel time is sped up enormously.
const AU = 60;          // scene units from Sun to Earth
const RS = 4;           // drawn Sun radius
const OMEGA_R_AU = 405; // Sun's rotation speed times 1 AU, in km/s (2.7e-6 rad/s * 1.496e8 km)

export function createWind(ctx) {
  const rnd = rng(1985);
  const scene = new THREE.Scene();
  scene.add(makeNebula(new THREE.Color(0.04, 0.05, 0.09), 3.0));
  scene.add(makeStars(ctx.stars, ctx.pr));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(30, 55, 80);

  const U = {
    uDist: { value: 0 }, uRot: { value: 0 }, uK: { value: 1 / AU }, uDens: { value: 0.5 },
    uTime: { value: 0 }, uPR: { value: ctx.pr }, uL: { value: AU * 1.35 }, uR0: { value: RS * 1.1 },
    uBzCol: { value: new THREE.Color(0.6, 0.8, 1.0) }, uFade: { value: 1 },
  };

  // --- particles (GPU-animated points)
  const N = ctx.particles;
  const g = new THREE.BufferGeometry();
  const phi0 = new Float32Array(N), ph = new Float32Array(N), el = new Float32Array(N), rr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    phi0[i] = rnd() * Math.PI * 2; ph[i] = rnd();
    el[i] = (rnd() + rnd() + rnd() - 1.5) * 0.16; rr[i] = rnd();
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aPhi', new THREE.BufferAttribute(phi0, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aEl', new THREE.BufferAttribute(el, 1));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rr, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: NOISE + /* glsl */`
      attribute float aPhi, aPhase, aEl, aRnd;
      uniform float uDist, uRot, uK, uDens, uPR, uL, uR0, uTime;
      varying float vA; varying vec3 vC;
      void main(){
        float r = uR0 + mod(aPhase*uL + uDist, uL);
        // emitted from a rotating source: longitude fixed at emission (sprinkler pattern)
        float phi = aPhi + uRot - uK*r;
        // fast/slow stream structure tied to source longitude (corotating streams)
        float stream = 0.5 + 0.5*snoise(vec3(cos(aPhi)*1.3, sin(aPhi)*1.3, uTime*0.01));
        vec3 p = vec3(cos(phi)*r, aEl*r*0.55 + aEl*2.0, sin(phi)*r);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_Position = projectionMatrix*mv;
        float on = step(aRnd, uDens);
        float fadeIn = smoothstep(uR0, uR0+6.0, r), fadeOut = 1.0 - smoothstep(uL*0.82, uL+uR0, r);
        vA = on * fadeIn * fadeOut * (0.25 + 0.75*stream);
        float near = clamp(1.0 - r/(uL*0.6), 0.0, 1.0);
        vC = mix(vec3(0.55,0.75,1.0), vec3(1.0,0.82,0.55), near*near);
        gl_PointSize = (1.2 + 2.2*stream) * uPR * clamp(60.0/-mv.z, 0.5, 3.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vC; uniform float uFade;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d);
        if (vA*a < 0.003) discard;
        gl_FragColor = vec4(vC * a * vA * 1.1 * uFade, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false; scene.add(pts);

  // --- Parker spiral field lines (interplanetary magnetic field)
  const NL = 14, SEG = 160;
  const lg = new THREE.BufferGeometry();
  const lpos = new Float32Array(NL * SEG * 3), lr = new Float32Array(NL * SEG), lphi = new Float32Array(NL * SEG);
  const idx = [];
  for (let l = 0; l < NL; l++) for (let s = 0; s < SEG; s++) {
    const k = l * SEG + s; lr[k] = RS + (s / (SEG - 1)) * (AU * 1.35); lphi[k] = (l / NL) * Math.PI * 2;
    if (s < SEG - 1) idx.push(k, k + 1);
  }
  lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  lg.setAttribute('aR', new THREE.BufferAttribute(lr, 1));
  lg.setAttribute('aPhi', new THREE.BufferAttribute(lphi, 1));
  lg.setIndex(idx);
  const lm = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      attribute float aR, aPhi; uniform float uRot, uK, uDist; varying float vR; varying float vF;
      void main(){ float phi = aPhi + uRot - uK*aR; vR = aR;
        vF = 0.5 + 0.5*sin(aR*0.6 - uDist*0.6);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(cos(phi)*aR, 0.0, sin(phi)*aR, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBzCol; uniform float uL, uFade; varying float vR; varying float vF;
      void main(){ float a = 0.10 + 0.14*vF; a *= 1.0 - smoothstep(uL*0.75, uL, vR);
        gl_FragColor = vec4(uBzCol*a*uFade, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; scene.add(lines);

  // --- the Sun (small, EUV-ish glow)
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: `varying vec3 vN; varying vec3 vO; varying vec3 vV; void main(){ vO=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + `uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vV;
      void main(){ float n = fbm3(normalize(vO)*5.0 + uTime*0.03); float mu = dot(vN,vV);
        vec3 c = mix(vec3(1.0,0.55,0.12), vec3(1.0,0.92,0.7), 0.5+0.5*n) * (1.0 + 0.6*pow(max(1.0-mu,0.0),2.0));
        gl_FragColor = vec4(c*1.3, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(RS, 64, 32), sunMat));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(RS * 9, RS * 9), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec2 vUv; void main(){ float r=length(vUv); float g=(exp(-r*5.0)*1.0 + exp(-r*2.0)*0.12)*smoothstep(1.0,0.7,r); gl_FragColor=vec4(vec3(1.0,0.6,0.25)*g,1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(glow);

  // --- Earth with a hint of its magnetic bubble, and Earth's orbit
  const earth = new THREE.Group(); earth.position.set(AU, 0, 0); scene.add(earth);
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(-1, 0, 0) } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vW=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: NOISE + `uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){
      float land = smoothstep(0.05,0.12,fbm3(vW*2.2));
      vec3 c = mix(vec3(0.05,0.18,0.45), vec3(0.22,0.35,0.2), land);
      float d = max(dot(vN,uSun),0.0); float rim = pow(max(1.0-abs(vN.z),0.0),3.0);
      gl_FragColor = vec4(c*(0.12+1.1*d) + vec3(0.3,0.55,1.0)*0.25*d, 1.0);} `,
  })));
  const shockMat = new THREE.ShaderMaterial({
    uniforms: { uFade: U.uFade, uTime: U.uTime },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;} `,
    fragmentShader: `uniform float uFade; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(1.0-abs(dot(vN,vV)),0.0),2.5); gl_FragColor=vec4(vec3(0.35,0.7,1.0)*f*0.35*uFade,1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shockGeo = new THREE.LatheGeometry(Array.from({ length: 24 }, (_, i) => {
    const y = i / 23 * 7; return new THREE.Vector2(Math.sqrt(y * 1.6) * 2.2 + 0.001, -y);
  }), 48);
  const shock = new THREE.Mesh(shockGeo, shockMat); shock.rotation.z = Math.PI / 2; shock.position.x = -3.5;
  earth.add(shock);
  const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 256 }, (_, i) => new THREE.Vector3(Math.cos(i / 256 * Math.PI * 2) * AU, 0, Math.sin(i / 256 * Math.PI * 2) * AU))),
  new THREE.LineBasicMaterial({ color: 0x1d2a44, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(orbit);
  // L1 monitor marker (about 1% of the way from Earth toward the Sun)
  const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  l1.position.set(AU - 4.2, 0, 0); scene.add(l1);

  // --- near-Earth solar wind plasma. Each streak is a parcel of wind: random start, phase, length
  // and speed; it flows anti-sunward (+x) at the measured wind speed, is deflected around the bow
  // shock and magnetopause (parabolic obstacles, the same shapes as the drawn shield), and is
  // compressed, heated (warmer) and stirred up (turbulence) in the magnetosheath and downstream.
  // Density sets how many parcels show; color follows the IMF Bz like the spiral field lines.
  // (Earth-local coordinates: Earth at 0, Sun toward -x. The anchor group below is where the
  //  Bz ripple and the Bz voice sit.)
  const imf = new THREE.Group(); imf.position.set(AU - 9, 0, 0); scene.add(imf);
  const NS = ctx.mobile ? 520 : 1100;
  const sg = new THREE.BufferGeometry();
  const sP = new Float32Array(NS * 4 * 3), sB = new Float32Array(NS * 4), sAz = new Float32Array(NS * 4), sPh = new Float32Array(NS * 4),
    sSp = new Float32Array(NS * 4), sLn = new Float32Array(NS * 4), sRn = new Float32Array(NS * 4), sE = new Float32Array(NS * 4);
  const ENDS = [0, 0.5, 0.5, 1]; // two segments per streak (tail -> middle -> head) so it can bend
  for (let i = 0; i < NS; i++) {
    const b = Math.pow(rnd(), 0.6) * 8.5, az = rnd() * Math.PI * 2, ph = rnd(), sp = 0.72 + 0.56 * rnd(), ln = 0.35 + 1.4 * rnd() * rnd(), rn = rnd();
    for (let k = 0; k < 4; k++) { const j = i * 4 + k; sB[j] = b; sAz[j] = az; sPh[j] = ph; sSp[j] = sp; sLn[j] = ln; sRn[j] = rn; sE[j] = ENDS[k]; }
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sP, 3));
  [['aB', sB], ['aAz', sAz], ['aPh', sPh], ['aSpd', sSp], ['aLen', sLn], ['aRnd', sRn], ['aEnd', sE]].forEach(([n, a]) => sg.setAttribute(n, new THREE.BufferAttribute(a, 1)));
  const SU = { uFlow: { value: 0 }, uV: { value: 1 }, uDens: { value: 0.5 }, uTime: U.uTime, uCol: U.uBzCol, uFade: U.uFade };
  const streakMat = new THREE.ShaderMaterial({
    uniforms: SU,
    vertexShader: NOISE + /* glsl */`
      attribute float aB, aAz, aPh, aSpd, aLen, aRnd, aEnd;
      uniform float uFlow, uV, uDens, uTime;
      varying float vA; varying float vHot;
      const float X0 = -16.0, LX = 29.0;
      const float XBS = -3.5, KBS = 7.74;   // bow shock: rho^2 = KBS (x - XBS) (matches the drawn shock)
      const float XMP = -2.3, KMP = 4.2;    // magnetopause (inner obstacle the flow wraps around)
      vec3 at(float x, float az){
        // streamline around the obstacle: area-preserving push outward once past the magnetopause nose
        float rho = sqrt(aB*aB + max(0.0, KMP*(x - XMP)));
        float sheath = step(rho*rho, KBS*max(0.0, x - XBS) + 0.001);
        // low-frequency meander along the flow (so a streak bends, it does not point at random)
        float turb = 0.05 + 0.30*sheath + 0.25*smoothstep(0.0, 8.0, x);
        float n1 = snoise(vec3(x*0.07 - uTime*0.08, aAz*1.3, aRnd*17.0));
        float n2 = snoise(vec3(x*0.06 + 3.1, aRnd*11.0, aAz*1.1 + uTime*0.05));
        rho += n1*turb*(1.0 + 0.15*aB); az += n2*turb*0.08;
        vHot = sheath;
        return vec3(x, rho*sin(az), rho*cos(az));
      }
      void main(){
        float s = mod(aPh*LX + uFlow*aSpd, LX);
        float len = aLen*(0.7 + 1.3*uV)*aSpd;
        float x = X0 + s - len*(1.0 - aEnd);
        vec3 p = at(x, aAz);
        vec4 mv = modelViewMatrix*vec4(p, 1.0); gl_Position = projectionMatrix*mv;
        float head = X0 + s;
        float edge = smoothstep(X0, X0 + 3.0, x) * (1.0 - smoothstep(X0 + LX - 6.0, X0 + LX, head));
        float on = step(aRnd, uDens);
        vA = on * edge * pow(aEnd, 1.6) * (0.25 + 0.75*fract(aRnd*7.31)) * (0.55 + 0.6*vHot);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uFade; varying float vA; varying float vHot;
      void main(){ if (vA < 0.004) discard;
        vec3 c = mix(mix(uCol, vec3(1.0), 0.35), vec3(1.0, 0.72, 0.45), 0.55*vHot);
        gl_FragColor = vec4(c*vA*0.7*uFade, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const streaks = new THREE.LineSegments(sg, streakMat); streaks.frustumCulled = false;
  { const idx = []; for (let i = 0; i < NS; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3); sg.setIndex(idx); }
  earth.add(streaks);

  const tmpQ = new THREE.Quaternion();
  return {
    id: 'wind', label: 'Solar wind',
    kicker: 'Scene 2 · The messenger',
    title: 'Solar wind and the Parker spiral',
    text: 'The Sun blows a constant wind of charged particles at hundreds of km/s. Because the Sun rotates, the magnetic field carried by the wind winds into a spiral, like water from a garden sprinkler. When the field near Earth points south (negative Bz), energy couples into Earth\'s magnetosphere much more easily.',
    instrument: 'Driven by in-situ plasma and magnetometer readings from NOAA\'s real-time solar wind monitors at the L1 point (yellow dot), about 1.5 million km sunward of Earth.',
    note: 'Not to scale. Particle speed and count follow measured speed and density; spiral pitch uses tan ψ = Ωr/v. Near Earth, the streaks are parcels of solar wind flowing around the bow shock (warmer where compressed). Color: blue = northward Bz, red = southward Bz.',
    scene, camera, bloom: 0.9, hooks: { U, AU, RS, imf, SU, streaks },
    orbit: { target: new THREE.Vector3(30, 0, 0), minDistance: 20, maxDistance: 220, home: 95, zoomAmp: 0.2, spin: 0.012, polar: 0.95 },
    update(t, dt, P) {
      const v = Math.max(200, P.swSpeed);
      const vvis = (v / 400) * 3.0; // scene units per second
      const k = (OMEGA_R_AU / v) / AU;
      U.uDist.value += vvis * dt; U.uRot.value += k * vvis * dt; U.uK.value = k; U.uTime.value = t;
      U.uDens.value = THREE.MathUtils.clamp(0.25 + P.swDens / 16, 0.25, 1.0);
      // near-Earth parcels: speed and length from the measured wind speed, count from density
      SU.uV.value = v / 400; SU.uFlow.value += dt * (v / 400) * 2.4;
      SU.uDens.value = THREE.MathUtils.clamp(0.3 + P.swDens / 14, 0.3, 1.0);
      const s = THREE.MathUtils.clamp(-P.bz / 8, -1, 1); // +1 = strongly southward
      const south = new THREE.Color(1.0, 0.36, 0.28), north = new THREE.Color(0.35, 0.7, 1.0), calm = new THREE.Color(0.7, 0.75, 0.9);
      U.uBzCol.value.copy(calm).lerp(s > 0 ? south : north, Math.abs(s));
      // IMF direction near Earth: Parker angle in the ecliptic, tilted by Bz (stylized magnitude)
      const psi = Math.atan(OMEGA_R_AU / v);
      const tilt = THREE.MathUtils.clamp(P.bz / 8, -1, 1) * THREE.MathUtils.degToRad(55);
      const horiz = new THREE.Vector3(-Math.cos(psi), 0, Math.sin(psi)); // along spiral, pointing back sunward-ish
      const dir = horiz.multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0)).normalize();
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      imf.quaternion.slerp(tmpQ, Math.min(1, dt * 0.5));
      glow.quaternion.copy(camera.quaternion);
    },
  };
}
