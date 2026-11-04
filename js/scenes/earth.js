import * as THREE from 'three';
import { NOISE } from '../glsl.js';

// Procedural Earth (not a map): noise continents, day/night terminator, thin atmosphere rim.
// Optional auroral-oval emission (opts.aurora) drawn by the same shader.
export function makeEarth(radius, opts = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: (opts.sun || new THREE.Vector3(1, 0, 0)).clone() },
      uKp: { value: 2 }, uTime: { value: 0 }, uAur: { value: opts.aurora ? 1 : 0 },
      uSpin: { value: 0 }, uDay: { value: opts.day ?? 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vP = normalize(position); vN = normalize(mat3(modelMatrix)*normal);
        vec4 w = modelMatrix*vec4(position,1.0); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform vec3 uSun; uniform float uKp, uTime, uAur, uSpin, uDay;
      varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){
        // spin the surface pattern (geographic) under the fixed Sun
        float cs = cos(uSpin), sn = sin(uSpin);
        vec3 g = vec3(cs*vP.x - sn*vP.z, vP.y, sn*vP.x + cs*vP.z);
        float h = fbm(g*1.8 + 3.0);
        float land = smoothstep(0.02, 0.09, h);
        float ice = smoothstep(0.80, 0.92, abs(vP.y));
        vec3 ocean = vec3(0.03,0.10,0.26), ground = mix(vec3(0.16,0.24,0.12), vec3(0.32,0.28,0.18), smoothstep(0.1,0.4,h));
        vec3 c = mix(ocean, ground, land); c = mix(c, vec3(0.75,0.8,0.86), ice);
        float cloud = smoothstep(0.15, 0.6, fbm3(g*3.5 + vec3(uTime*0.004,0,0)));
        c = mix(c, vec3(0.85), cloud*0.45);
        float d = dot(normalize(vN), normalize(uSun));
        float day = smoothstep(-0.08, 0.25, d);
        vec3 col = c * (0.035 + 1.05*day*uDay);
        // city lights on the night side (faint)
        float city = smoothstep(0.55, 0.75, snoise(g*40.0)) * land * (1.0-ice) * (1.0-day);
        col += vec3(1.0,0.7,0.35)*city*0.25;
        // atmosphere rim
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)),0.0), 3.0);
        col += vec3(0.25,0.5,1.0) * rim * (0.15 + 0.7*max(d+0.2,0.0));
        // auroral ovals around both magnetic poles (stylized, size and brightness follow Kp)
        if (uAur > 0.5) {
          float colat = degrees(acos(abs(vP.y)));
          float eq = 24.0 + 2.0*uKp; // equatorward edge colatitude ~ 90 - (66 - 2Kp)
          vec2 sunH = normalize(uSun.xz); vec2 ph = normalize(vP.xz + 1e-5);
          float night = 0.5 - 0.5*dot(ph, sunH);
          float center = eq - 3.5 - 1.5*night;
          float w = 2.2 + 0.4*uKp + 2.0*night;
          float o = exp(-((colat - center)/w)*((colat - center)/w));
          float flick = 0.7 + 0.3*snoise(vec3(vP*6.0) + uTime*0.15);
          col += vec3(0.25,1.0,0.55) * o * flick * (0.15 + 0.12*uKp) * (0.4 + 0.6*night);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  return m;
}
