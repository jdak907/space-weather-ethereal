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

  // --- local IMF near Earth: direction tilts north/south with measured Bz
  const imf = new THREE.Group(); imf.position.set(AU - 9, 0, 0); scene.add(imf);
  const imfMat = new THREE.ShaderMaterial({
    uniforms: { uCol: U.uBzCol, uDist: U.uDist, uFade: U.uFade },
    vertexShader: `attribute float aS; varying float vS; void main(){ vS=aS; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uCol; uniform float uDist, uFade; varying float vS; void main(){
      float dash = smoothstep(0.55,1.0, 0.5+0.5*sin(vS*18.0 - uDist*1.5)); float e = sin(3.14159*vS);
      gl_FragColor = vec4(uCol*(0.15+0.85*dash)*e*0.9*uFade,1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const imfLines = [];
  for (let i = 0; i < 9; i++) {
    const gg = new THREE.BufferGeometry();
    const n = 40, p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let k = 0; k < n; k++) { const u = k / (n - 1); s[k] = u; p.set([0, u * 10 - 5, 0], k * 3); }
    gg.setAttribute('position', new THREE.BufferAttribute(p, 3)); gg.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    const ln = new THREE.Line(gg, imfMat); ln.position.set(0, 0, (i - 4) * 1.4); imf.add(ln); imfLines.push(ln);
  }

  const tmpQ = new THREE.Quaternion();
  return {
    id: 'wind', label: 'Solar wind',
    kicker: 'Scene 2 · The messenger',
    title: 'Solar wind and the Parker spiral',
    text: 'The Sun blows a constant wind of charged particles at hundreds of km/s. Because the Sun rotates, the magnetic field carried by the wind winds into a spiral, like water from a garden sprinkler. When the field near Earth points south (negative Bz), energy couples into Earth\'s magnetosphere much more easily.',
    instrument: 'Driven by in-situ plasma and magnetometer readings from NOAA\'s real-time solar wind monitors at the L1 point (yellow dot), about 1.5 million km sunward of Earth.',
    note: 'Not to scale. Particle speed and count follow measured speed and density; spiral pitch uses tan ψ = Ωr/v. Field color: blue = northward Bz, red = southward Bz.',
    scene, camera, bloom: 0.9, hooks: { U, AU, RS, imf },
    orbit: { target: new THREE.Vector3(30, 0, 0), minDistance: 20, maxDistance: 220, home: 95, zoomAmp: 0.2, spin: 0.012, polar: 0.95 },
    update(t, dt, P) {
      const v = Math.max(200, P.swSpeed);
      const vvis = (v / 400) * 3.0; // scene units per second
      const k = (OMEGA_R_AU / v) / AU;
      U.uDist.value += vvis * dt; U.uRot.value += k * vvis * dt; U.uK.value = k; U.uTime.value = t;
      U.uDens.value = THREE.MathUtils.clamp(0.25 + P.swDens / 16, 0.25, 1.0);
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
