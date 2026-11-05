import * as THREE from 'three';
import { NOISE, rng } from '../glsl.js';
import { makeStars, makeNebula } from '../stars.js';

// Scene 1: The Sun in the style of extreme-ultraviolet false color (SDO/AIA or SOHO/EIT 304 Å,
// the orange-gold He II line from the ~50,000 K chromosphere). Fully procedural.
// Activity (active-region brightness, loop count and height, flare rate) follows F10.7 and sunspot number.
const R = 10, MAX_AR = 12, MAX_LOOPS = 18;

const PAL = /* glsl */`
vec3 aia304(float x){ // black -> deep red -> orange -> gold -> pale yellow
  x = clamp(x,0.0,1.4);
  vec3 c = mix(vec3(0.0), vec3(0.45,0.04,0.0), smoothstep(0.0,0.25,x));
  c = mix(c, vec3(0.95,0.32,0.02), smoothstep(0.2,0.55,x));
  c = mix(c, vec3(1.0,0.66,0.18), smoothstep(0.5,0.85,x));
  c = mix(c, vec3(1.0,0.93,0.62), smoothstep(0.85,1.25,x));
  return c;
}`;

export function createSun(ctx) {
  const r = rng(304);
  const scene = new THREE.Scene();
  scene.add(makeNebula(new THREE.Color(0.10, 0.05, 0.03), 1.0));
  scene.add(makeStars(ctx.stars, ctx.pr));
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  camera.position.set(8, 6, 40);

  // Active regions live in the two activity belts (roughly 5-35 degrees latitude).
  const ar = [];
  for (let i = 0; i < MAX_AR; i++) {
    const lat = (r() < 0.5 ? -1 : 1) * THREE.MathUtils.degToRad(6 + r() * 26);
    const lon = r() * Math.PI * 2;
    ar.push(new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)));
  }
  const arU = ar.map((v) => new THREE.Vector4(v.x, v.y, v.z, 0));

  const sunMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uAct: { value: 0.4 }, uAR: { value: arU }, uNAR: { value: 4 },
      uFlare: { value: new THREE.Vector4(0, 1, 0, 0) },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vObj; varying vec3 vView;
      void main(){ vObj = normalize(position); vN = normalize(normalMatrix*normal);
        vec4 mv = modelViewMatrix*vec4(position,1.0); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: NOISE + PAL + /* glsl */`
      uniform float uTime, uAct, uNAR; uniform vec4 uAR[${MAX_AR}]; uniform vec4 uFlare;
      varying vec3 vN; varying vec3 vObj; varying vec3 vView;
      void main(){
        vec3 p = vObj;
        float lat = asin(clamp(p.y,-1.0,1.0));
        // differential rotation: equator turns faster than the poles
        float ang = uTime*0.02*(1.0 - 0.25*sin(lat)*sin(lat));
        float cs = cos(ang), sn = sin(ang);
        vec3 q = vec3(cs*p.x - sn*p.z, p.y, sn*p.x + cs*p.z);
        float net = fbm(q*4.0 + vec3(0.0, uTime*0.01, 0.0));
        float cells = 1.0 - abs(snoise(q*14.0 + uTime*0.03));
        float fine = snoise(q*38.0 - uTime*0.05);
        float v = 0.26 + 0.30*net + 0.15*cells*cells + 0.06*fine;
        // active regions
        float act = 0.0;
        for(int i=0;i<${MAX_AR};i++){
          if(float(i) >= uNAR) break;
          vec3 c = uAR[i].xyz;
          float d = 1.0 - dot(p, c);
          float core = exp(-d*260.0) * (0.7 + 0.5*snoise(p*30.0 + float(i) + uTime*0.02));
          float plage = exp(-d*55.0) * (0.55 + 0.45*fbm3(p*9.0 + float(i)*3.1 + uTime*0.02));
          act += (0.55*core + 0.45*plage);
        }
        v += act * (0.35 + 0.75*uAct);
        // flare flash (stylized timing)
        float fd = 1.0 - dot(p, uFlare.xyz);
        v += uFlare.w * (exp(-fd*400.0)*2.2 + exp(-fd*60.0)*0.5);
        // coronal-hole-like dark patches near the poles when quiet
        v -= 0.18*smoothstep(0.55,0.95,abs(p.y))*(1.0-uAct)*(0.6+0.4*snoise(q*3.0));
        // EUV limb: optically thin emission brightens toward the limb
        float mu = clamp(dot(vN, vView), 0.0, 1.0);
        v *= 0.85 + 0.55*pow(1.0-mu, 2.0);
        gl_FragColor = vec4(aia304(v)*0.85, 1.0);
      }`,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), sunMat);
  scene.add(sun);

  // Off-limb glow and spicule fringe on a camera-facing quad.
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAct: { value: 0.4 }, uR: { value: R / 34 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: NOISE + PAL + /* glsl */`
      uniform float uTime, uAct, uR; varying vec2 vUv;
      void main(){
        float r = length(vUv); if(r < uR*0.985) discard;
        float a = atan(vUv.y, vUv.x);
        float h = (r - uR)/uR;
        float streak = 0.5 + 0.5*snoise(vec3(cos(a)*7.0, sin(a)*7.0, uTime*0.05));
        float spic = 0.5 + 0.5*snoise(vec3(cos(a)*60.0, sin(a)*60.0, uTime*0.3));
        float g = exp(-h*14.0)*(0.35 + 0.35*spic) + exp(-h*2.6)*0.10*(0.4+streak)*(0.6+uAct) + exp(-h*0.9)*0.025;
        g *= smoothstep(1.0, 0.75, r);
        vec3 c = aia304(0.25 + g*1.1) * g;
        gl_FragColor = vec4(c, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(68, 68), haloMat);
  scene.add(halo);

  // Prominence / coronal loops anchored in active regions.
  const loops = [];
  const loopMat = (seed) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 0 }, uSeed: { value: seed } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: NOISE + PAL + /* glsl */`
      uniform float uTime, uBright, uSeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(max(1.0 - abs(dot(vN, vV)), 0.0), 1.5);
        float flow = 0.5 + 0.5*snoise(vec3(vUv.x*14.0 - uTime*0.35, vUv.y*3.0, uSeed));
        float threads = 0.6 + 0.4*snoise(vec3(vUv.x*3.0, vUv.y*22.0, uSeed + uTime*0.05));
        float ends = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x);
        float v = (0.35 + 0.65*edge) * flow * threads * ends * uBright;
        gl_FragColor = vec4(aia304(0.5 + v*0.9) * v, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (let i = 0; i < MAX_LOOPS; i++) {
    const c = ar[i % MAX_AR];
    const tangent = new THREE.Vector3().crossVectors(c, new THREE.Vector3(0, 1, 0)).normalize();
    tangent.applyAxisAngle(c, (r() - 0.5) * 1.6);
    const sep = THREE.MathUtils.degToRad(5 + r() * 10);
    const a = c.clone().applyAxisAngle(new THREE.Vector3().crossVectors(c, tangent).normalize(), sep / 2);
    const b = c.clone().applyAxisAngle(new THREE.Vector3().crossVectors(c, tangent).normalize(), -sep / 2);
    const h0 = 0.08 + r() * 0.22;
    const lean = (r() - 0.5) * 0.5;
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const s = k / 40;
      const dir = a.clone().lerp(b, s).normalize();
      const up = Math.sin(Math.PI * s);
      const p = dir.multiplyScalar(R * (1 + h0 * up)).add(tangent.clone().multiplyScalar(lean * up * R * h0));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.14 + r() * 0.22, 8, false), loopMat(r() * 50));
    m.userData = { phase: r() * 10, base: 0.6 + r() * 0.6 };
    loops.push(m); sun.add(m);
  }

  // flare scheduler (stylized: the rate rises with F10.7, but the timing is not real)
  let flare = { t: -99, idx: 0, dur: 9 }, nextFlare = 6, lastT = 0, curNar = 4;
  // hooks for the orchestra: notes can light a specific active region
  const hooks = {
    sun, ar, R, nar: () => curNar, flareIdx: () => flare.idx,
    flare(idx, dur = 4) { const ft = (lastT - flare.t) / flare.dur; if (ft < 0 || ft >= 0.5) flare = { t: lastT, idx: idx % curNar, dur }; },
  };

  return {
    id: 'sun', label: 'Sun',
    kicker: 'Scene 1 · The source',
    title: 'The active Sun',
    text: 'Magnetic active regions around sunspots heat the solar atmosphere and launch flares and loops of glowing plasma. Brighter, busier disk = more sunspots and stronger 10.7 cm radio flux.',
    instrument: 'Look evokes extreme-ultraviolet images at 304 Å (ionized helium, about 50,000 K), the orange-gold view familiar from NASA SDO/AIA and ESA/NASA SOHO/EIT.',
    note: 'Procedural visualization. Activity level follows measured F10.7 and sunspot number; flare timing and region positions are illustrative.',
    scene, camera, hooks, bloom: 0.55,
    orbit: { target: new THREE.Vector3(0, 0, 0), minDistance: 18, maxDistance: 140, home: 40, zoomAmp: 0.18, spin: 0.018 },
    update(t, dt, P) {
      const act = THREE.MathUtils.clamp((P.f107 - 68) / 140, 0, 1);
      const nar = THREE.MathUtils.clamp(Math.round(1 + P.sn / 14), 1, MAX_AR);
      lastT = t; curNar = nar;
      sunMat.uniforms.uTime.value = t; sunMat.uniforms.uAct.value = act; sunMat.uniforms.uNAR.value = nar;
      haloMat.uniforms.uTime.value = t; haloMat.uniforms.uAct.value = act;
      halo.quaternion.copy(camera.quaternion);
      sun.rotation.y = t * 0.004;
      // flares
      if (t > nextFlare) {
        flare = { t, idx: Math.floor(Math.random() * nar), dur: 6 + Math.random() * 8 };
        nextFlare = t + (70 - 50 * act) * (0.5 + Math.random());
      }
      const ft = (t - flare.t) / flare.dur;
      const fwv = ft >= 0 && ft < 1 ? (ft < 0.15 ? ft / 0.15 : Math.exp(-(ft - 0.15) * 4)) : 0;
      const c = ar[flare.idx];
      sunMat.uniforms.uFlare.value.set(c.x, c.y, c.z, fwv * (0.6 + act));
      const nLoops = THREE.MathUtils.clamp(Math.round(2 + P.sn / 7), 2, MAX_LOOPS);
      loops.forEach((m, i) => {
        const on = i < nLoops ? 1 : 0;
        const u = m.material.uniforms;
        const target = on * m.userData.base * (0.45 + 0.8 * act) * (0.75 + 0.25 * Math.sin(t * 0.2 + m.userData.phase))
          + (i % MAX_AR === flare.idx ? fwv * 1.5 : 0);
        u.uBright.value += (target - u.uBright.value) * Math.min(1, dt * 0.8);
        u.uTime.value = t;
        m.visible = u.uBright.value > 0.01;
      });
    },
  };
}
