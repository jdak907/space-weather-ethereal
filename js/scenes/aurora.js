import * as THREE from 'three';
import { NOISE, rng } from '../glsl.js';
import { makeStars } from '../stars.js';

// Approximate Kp -> auroral oval relation: the equatorward edge near midnight sits at about
// 66 degrees magnetic latitude for Kp 0 and moves ~2 degrees equatorward per Kp step
// (the rule of thumb behind NOAA's Kp-latitude aurora guide). The dayside oval sits poleward.
export function ovalEdge(kp) { return 66 - 2 * kp; }

// ---------------------------------------------------------------------------------------
// Scene 4: the auroral oval in far-ultraviolet false color, seen from above the north pole,
// in the style of NASA IMAGE (FUV/WIC) and Polar (UVI) images.
export function createOval(ctx) {
  const scene = new THREE.Scene();
  scene.add(makeStars(ctx.stars, ctx.pr));
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(0, 34, 8);
  const RE = 8;
  const U = { uTime: { value: 0 }, uKp: { value: 2 }, uSpin: { value: 0 }, uSub: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = normalize(position); vN = normalize(mat3(modelMatrix)*normal);
        vec4 w = modelMatrix*vec4(position,1.0); vV = normalize(cameraPosition-w.xyz);
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uKp, uSpin, uSub; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      vec3 uvi(float x){ // black-purple-blue-cyan-green-yellow-red-white false-color bar
        x = clamp(x, 0.0, 1.0);
        vec3 c = mix(vec3(0.0), vec3(0.28,0.0,0.45), smoothstep(0.0,0.12,x));
        c = mix(c, vec3(0.05,0.15,0.9), smoothstep(0.1,0.28,x));
        c = mix(c, vec3(0.0,0.75,0.95), smoothstep(0.26,0.42,x));
        c = mix(c, vec3(0.1,0.95,0.3), smoothstep(0.4,0.56,x));
        c = mix(c, vec3(1.0,0.95,0.1), smoothstep(0.55,0.72,x));
        c = mix(c, vec3(1.0,0.25,0.05), smoothstep(0.7,0.88,x));
        c = mix(c, vec3(1.0,0.9,0.9), smoothstep(0.88,1.0,x));
        return c;
      }
      void main(){
        // Sun toward +x. Magnetic local time angle: 0 at noon (+x), pi at midnight (-x).
        float lat = degrees(asin(clamp(vP.y,-1.0,1.0)));
        float mlt = atan(vP.z, vP.x);
        float mid = 0.5 - 0.5*cos(mlt);            // 1 at midnight, 0 at noon
        // oval boundaries (approximate, Kp-scaled)
        float eqMid = 66.0 - 2.0*uKp, eqNoon = 76.5 - 1.0*uKp;
        float eq = mix(eqNoon, eqMid, mid);
        float width = mix(2.5 + 0.3*uKp, 5.5 + 0.9*uKp, mid);
        float c0 = eq + width*0.5;
        float zo = (lat - c0)/(width*0.5); float o = exp(-zo*zo);
        // pre-midnight emphasis and stylized substorm bulge (brightening expands poleward)
        float za = (mlt + 2.75)/0.9, zb = (mlt - 3.53)/0.9; float pre = exp(-za*za) + exp(-zb*zb); // ~22 MLT, dusk side (-z)
        float zc = (lat - (c0 + 3.0*uSub))/(width*0.6 + 2.0*uSub); float bulge = uSub * pre * exp(-zc*zc);
        float tex = 0.75 + 0.25*snoise(vec3(vP*14.0) + vec3(0.0, uTime*0.05, 0.0)) + 0.1*snoise(vec3(vP*40.0) - uTime*0.1);
        float aur = (o*(0.25 + 0.75*mid) * (0.22 + 0.075*uKp) + bulge*0.55) * tex;
        // dayglow: sunlit atmosphere also glows in the far UV
        float sza = dot(normalize(vP), vec3(1.0,0.0,0.0));
        float dayglow = 0.30*smoothstep(-0.1, 0.9, sza);
        float v = dayglow + aur;
        vec3 col = uvi(v);
        // faint procedural "coastlines" and magnetic latitude grid, as overlaid on UV images
        float cs = cos(uSpin), sn = sin(uSpin);
        vec3 g = vec3(cs*vP.x - sn*vP.z, vP.y, sn*vP.x + cs*vP.z);
        float h = fbm(g*1.8 + 3.0);
        float coast = 1.0 - smoothstep(0.0, 0.006, abs(h - 0.05));
        col += vec3(0.5)*coast*0.16;
        float grid = 0.0;
        for (int k=5;k<=8;k++){ grid += 1.0 - smoothstep(0.0, 0.18, abs(lat - float(k)*10.0)); }
        float mer = (1.0 - smoothstep(0.0, 0.006, abs(vP.z))) * step(lat, 85.0);
        col += vec3(0.6)*grid*0.07 + vec3(0.6)*mer*0.05;
        float limb = smoothstep(0.0, 0.25, dot(vN, vV));
        gl_FragColor = vec4(col*limb, 1.0);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 160, 80), mat);
  scene.add(earth);
  // thin UV "airglow" limb
  const limb = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.03, 64, 32), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;} `,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f=pow(max(1.0-abs(dot(vN,vV)),0.0),4.0); gl_FragColor=vec4(vec3(0.25,0.1,0.6)*f*0.8,1.0);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }));
  scene.add(limb);

  let sub = { t0: -99, dur: 40 }, nextSub = 12;
  const hooks = { RE, U, kick: 0 };
  return {
    id: 'oval', label: 'UV oval', bloom: 0.75, hooks,
    kicker: 'Scene 4 · From orbit',
    title: 'The auroral oval in ultraviolet',
    text: 'Seen from high above the North Pole, the aurora forms a glowing ring around the magnetic pole. When geomagnetic activity (Kp) rises, the ring brightens and widens toward the equator, which is why big storms bring the aurora to lower latitudes. The day side glows too, from sunlit air.',
    instrument: 'False-color style of far-ultraviolet imagers such as NASA IMAGE FUV/WIC and Polar UVI (about 130 to 190 nm, nitrogen LBH bands), which could see the aurora even in sunlight.',
    note: 'Visualization. Oval size and brightness follow measured Kp via an approximate rule (equatorward edge ≈ 66° − 2°×Kp magnetic latitude). Substorm brightenings are illustrative. Sun is to the right; grid lines mark 50°–80° latitude.',
    scene, camera,
    orbit: { target: new THREE.Vector3(0, 0, 0), minDistance: 12, maxDistance: 120, home: 30, zoomAmp: 0.12, spin: 0.02, polar: 0.32 },
    update(t, dt, P) {
      U.uTime.value = t; U.uKp.value = P.kp; U.uSpin.value = t * 0.012;
      if (t > nextSub) { sub = { t0: t, dur: 30 + Math.random() * 25 }; nextSub = t + (110 - 9 * Math.min(P.kp, 8)) * (0.6 + Math.random() * 0.8); }
      const s = (t - sub.t0) / sub.dur;
      const amp = THREE.MathUtils.clamp((P.kp - 1) / 5, 0.15, 1);
      U.uSub.value = (s >= 0 && s < 1 ? amp * (s < 0.12 ? s / 0.12 : Math.exp(-(s - 0.12) * 3.2)) : 0) + hooks.kick;
      hooks.kick *= Math.exp(-dt * 1.6);
    },
  };
}

// ---------------------------------------------------------------------------------------
// Scene 5: aurora from the ground. Green 557.7 nm (oxygen, ~100-200 km) curtains with red
// 630.0 nm (oxygen, above ~200 km) tops and a purple-pink nitrogen fringe in strong displays.
export function createCurtain(ctx) {
  const rnd = rng(5577);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);
  const eye = new THREE.Vector3(0, 1.7, 0);
  camera.position.copy(eye);
  const U = { uTime: { value: 0 }, uKp: { value: 2 }, uGlow: { value: new THREE.Color(0, 0, 0) } };

  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uGlow; varying vec3 vD; void main(){
      float e = vD.y; vec3 top = vec3(0.004,0.008,0.025), hor = vec3(0.02,0.035,0.06);
      vec3 c = mix(hor, top, smoothstep(0.0, 0.6, e));
      float north = smoothstep(0.2, 1.0, -vD.z) * exp(-max(e,0.0)*3.0);
      c += uGlow * north * 0.35;
      if (e < 0.0) c *= 0.3;
      gl_FragColor = vec4(c,1.0);} `,
  }));
  sky.renderOrder = -20; scene.add(sky);
  scene.add(makeStars(ctx.stars, ctx.pr));

  // curtains
  const curtains = [];
  const NC = 5;
  for (let i = 0; i < NC; i++) {
    const seg = ctx.mobile ? 160 : 320;
    const geo = new THREE.PlaneGeometry(900, 1, seg, 1);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uKp: U.uKp, uSeed: { value: rnd() * 100 }, uZ: { value: -220 }, uBase: { value: 42 },
        uH: { value: 70 }, uB: { value: 0 }, uRed: { value: 0 },
      },
      vertexShader: NOISE + /* glsl */`
        uniform float uTime, uSeed, uZ, uBase, uH; varying vec2 vUv; varying float vX;
        void main(){ vUv = uv; float x = position.x; vX = x;
          float fold = 60.0*snoise(vec3(x*0.004, uSeed, uTime*0.012)) + 16.0*snoise(vec3(x*0.018, uSeed*1.7, uTime*0.035));
          float hh = uH*(0.75 + 0.35*snoise(vec3(x*0.006, uSeed+5.0, uTime*0.02)));
          float y = uBase + 4.0*snoise(vec3(x*0.01, uSeed+9.0, uTime*0.03)) + uv.y*hh;
          vec3 p = vec3(x, y, uZ + fold + uv.y*(-14.0));
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: NOISE + /* glsl */`
        uniform float uTime, uSeed, uB, uRed, uKp; varying vec2 vUv; varying float vX;
        void main(){
          float h = vUv.y;
          float rays = pow(clamp(0.5 + 0.5*snoise(vec3(vX*0.09, uSeed, uTime*0.25)), 0.0, 1.0), 2.2);
          rays = 0.35 + 0.65*rays;
          float drift = 0.65 + 0.35*snoise(vec3(vX*0.008 - uTime*0.03, uSeed*0.3, uTime*0.05));
          float lower = smoothstep(0.0, 0.035, h);
          vec3 green = vec3(0.25, 1.0, 0.45) * exp(-h*3.2) * lower;
          vec3 red = vec3(0.9, 0.12, 0.18) * smoothstep(0.25, 0.75, h) * (1.0 - smoothstep(0.8, 1.0, h)) * uRed;
          vec3 fringe = vec3(0.75, 0.25, 0.85) * (1.0 - smoothstep(0.0, 0.06, h)) * smoothstep(3.5, 7.0, uKp);
          float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 c = (green + red*0.8 + fringe*0.8) * rays * drift * ends * uB;
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false;
    mesh.position.x = (i - (NC - 1) / 2) * 55 + (rnd() - 0.5) * 40;
    mesh.rotation.y = (rnd() - 0.5) * 0.25;
    mesh.userData = { order: i, z: -170 - i * 45 - rnd() * 30 };
    curtains.push(mesh); scene.add(mesh);
  }

  // terrain: snowy foreground and distant hills (procedural)
  const tg = new THREE.PlaneGeometry(2400, 2400, ctx.mobile ? 120 : 220, ctx.mobile ? 120 : 220);
  tg.rotateX(-Math.PI / 2);
  const tmat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: NOISE + `varying float vD; varying float vH; void main(){ vec3 p = position;
        float d = length(p.xz); vD = d;
        float m = smoothstep(350.0, 900.0, d);
        float h = (fbm3(vec3(p.xz*0.004, 1.0))*0.5+0.5);
        p.y = m*h*h*70.0 + (fbm3(vec3(p.xz*0.03, 3.0)))*1.2 - 0.6; vH = p.y;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
    fragmentShader: `uniform vec3 uGlow; varying float vD; varying float vH; void main(){
        vec3 snow = vec3(0.035,0.045,0.07) + uGlow*0.12;
        float far = smoothstep(150.0, 900.0, vD);
        vec3 c = mix(snow, vec3(0.006,0.008,0.014), far);
        gl_FragColor = vec4(c,1.0);} `,
  });
  const terrain = new THREE.Mesh(tg, tmat); scene.add(terrain);

  // spruce silhouettes (instanced cones)
  const NT = ctx.mobile ? 40 : 90;
  const tree = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshBasicMaterial({ color: 0x010203 }), NT);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let i = 0; i < NT; i++) {
    // trees to the sides and behind; the view north stays open
    const side = rnd() < 0.5 ? -1 : 1;
    const ang = side * (0.75 + rnd() * 2.2); // radians from north
    const d = 35 + rnd() * 110;
    const h = 4 + rnd() * 6;
    ps.set(Math.sin(ang) * d, h / 2 - 0.6, -Math.cos(ang) * d);
    sc.set(h * 0.13, h, h * 0.13);
    tree.setMatrixAt(i, M.compose(ps, q, sc));
  }
  scene.add(tree);

  const hooks = { U, curtains, kick: 0, tint: new THREE.Color(0, 0, 0) };
  return {
    id: 'curtain', hooks, label: 'Aurora', bloom: 1.0,
    kicker: 'Scene 5 · From the ground',
    title: 'Auroral curtains',
    text: 'Electrons guided down Earth\'s field lines strike oxygen and nitrogen 100 to 300 km up. Oxygen glows green low down and deep red higher up; nitrogen adds a purple-pink lower edge in strong displays. Higher Kp means brighter curtains that climb higher in the sky and reach farther south.',
    instrument: 'Emission lines: oxygen 557.7 nm (green) and 630.0 nm (red), nitrogen 427.8 nm (blue-violet), as recorded by all-sky cameras such as those at UAF\'s Poker Flat Research Range.',
    note: 'Stylized view looking north from a high-latitude site. Brightness, height and color mix follow measured Kp; the curtain shapes and motion are procedural.',
    scene, camera,
    orbit: { lookAround: true, eye, dir: new THREE.Vector3(0, 0.22, -1).normalize(), yawAmp: 0.35, pitch: 0.2 },
    update(t, dt, P) {
      U.uTime.value = t; U.uKp.value = P.kp;
      const kp = P.kp;
      const bright = 0.6 + 0.2 * kp;
      const nOn = THREE.MathUtils.clamp(2 + Math.round(kp * 0.5), 2, NC);
      const red = THREE.MathUtils.smoothstep(kp, 2.5, 7.0);
      curtains.forEach((c, i) => {
        const u = c.material.uniforms;
        const target = (i < nOn ? 1 : 0) * bright * (0.7 + 0.3 * Math.sin(t * 0.07 + i * 2.1));
        const ud = c.userData; ud.b = (ud.b ?? 0) + (target - (ud.b ?? 0)) * Math.min(1, dt * 0.4);
        u.uB.value = ud.b * (1 + (i < nOn ? 0.55 * hooks.kick : 0)); // a Kp/Ap note briefly brightens the curtains
        u.uRed.value = red * (0.8 + 0.4 * (i / NC));
        // equatorward expansion: curtains come closer (higher in the sky) with Kp
        u.uZ.value = c.userData.z * (1.15 - 0.07 * kp);
        u.uH.value = 60 + 9 * kp;
        c.visible = u.uB.value > 0.005;
      });
      U.uGlow.value.setRGB(0.12 + 0.25 * red, 0.6 * (1 - red * 0.3), 0.28).multiplyScalar(0.12 + 0.07 * kp);
      U.uGlow.value.add(hooks.tint);
      hooks.tint.multiplyScalar(Math.exp(-dt * 1.2)); hooks.kick *= Math.exp(-dt * 1.5);
    },
  };
}
