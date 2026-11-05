import * as THREE from 'three';
import { noteHSL } from './orchestra.js';
import { ovalEdge } from './scenes/aurora.js';

// Visual reactions to orchestra notes. Each played note makes a short glow in the current scene,
// placed where that data set "lives" physically, and colored with the note's chromatic color
// (hue = pitch class x 30 degrees, C = red; lightness by octave 34/45/56/67%).
//   F10.7, sunspots -> active regions flare on the Sun
//   wind speed, density -> glowing pulses ride the Parker spiral from the Sun to Earth
//   Bz -> ripples run along the magnetopause / the field near Earth
//   Kp, Ap -> the auroral oval and curtains brighten
//   X-rays -> a flare on the Sun; the dayside ionosphere lights up elsewhere
//   Schumann (modeled) -> the cavity's mode patterns and spectrum peaks swell; a faint hum of light elsewhere
// Chain-of-events stages (js/timeline.js) call stage(), which makes a bigger, labeled version.

let glowTex = null;
function tex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}
const ringGeo = new THREE.RingGeometry(0.965, 1.0, 160);
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

export function noteColor3(midi, boost = 1.6) {
  const [h, s, l] = noteHSL(midi);
  return new THREE.Color().setHSL(h / 360, s / 100, l / 100).multiplyScalar(boost);
}

class FX {
  constructor(sceneDef) {
    this.s = sceneDef; this.group = new THREE.Group(); this.group.renderOrder = 10;
    (sceneDef.world || sceneDef.scene).add(this.group); this.live = []; this.sprites = []; this.rings = []; this.points = [];
  }
  sprite(parent = this.group) {
    let sp = this.sprites.find((x) => !x.userData.busy);
    if (!sp) {
      sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true }));
      sp.frustumCulled = false; this.sprites.push(sp);
    }
    sp.userData.busy = true; sp.visible = true; parent.add(sp); return sp;
  }
  ring(parent = this.group) {
    let rg = this.rings.find((x) => !x.userData.busy);
    if (!rg) {
      rg = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
      rg.frustumCulled = false; this.rings.push(rg);
    }
    rg.userData.busy = true; rg.visible = true; rg.quaternion.identity(); parent.add(rg); return rg;
  }
  // a fading loop of glow points (for the auroral oval)
  loop(pts, size) {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.PointsMaterial({ map: tex(), size, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: true });
    const p = new THREE.Points(g, m); p.frustumCulled = false; this.group.add(p);
    return p;
  }
  add(obj, dur, fn, done) { this.live.push({ obj, t: 0, dur, fn, done }); }
  free(obj) { obj.visible = false; obj.userData.busy = false; if (obj.parent) obj.parent.remove(obj); }
  update(dt, camera) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]; e.t += dt; const u = Math.min(1, e.t / e.dur);
      e.fn(u, e.obj, camera);
      if (u >= 1) {
        this.live.splice(i, 1);
        if (e.done) e.done(e.obj); else this.free(e.obj);
      }
    }
  }
}

const env = (u, a = 0.12) => (u < a ? u / a : Math.pow(1 - (u - a) / (1 - a), 1.6)); // fast attack, smooth release

export function createReactions(scenes) {
  const fx = Object.fromEntries(scenes.map((s) => [s.id, new FX(s)]));
  const stats = { total: 0, byScene: {}, bySet: {} };
  let rr = 0;

  // ---- glow helpers
  function flash(F, pos, col, size, dur, parent, opt = {}) {
    const sp = F.sprite(parent); sp.position.copy(pos); sp.material.color.copy(col);
    const grow = opt.grow ?? 1.6, alpha = (opt.alpha ?? 1) * 0.7;
    F.add(sp, dur, (u, o) => { const e = env(u, opt.attack ?? 0.1); o.material.opacity = e * alpha; o.scale.setScalar(size * (1 + (grow - 1) * u)); if (opt.move) opt.move(u, o); });
    return sp;
  }
  function ring(F, pos, normal, col, r0, r1, dur, opt = {}) {
    const rg = F.ring(opt.parent); rg.position.copy(pos); rg.material.color.copy(col).multiplyScalar(0.55);
    if (normal) rg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    F.add(rg, dur, (u, o, cam) => {
      if (!normal && cam) o.quaternion.copy(cam.quaternion);
      o.material.opacity = env(u, 0.08) * (opt.alpha ?? 0.9);
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2)); o.scale.set(r, r, r);
      if (opt.move) opt.move(u, o);
    });
  }

  // ---- per-scene reactions
  const R = {
    sun(n, col, s) {
      const F = fx.sun, H = s.hooks, nar = H.nar(), str = 0.6 + 0.6 * n.vel;
      if (n.id === 'sr') { if (n.j % 4 === 0) ring(F, new THREE.Vector3(), null, col, H.R * 1.02, H.R * 1.08, 1.6, { alpha: 0.05 }); return; } // Schumann barely touches the Sun scene
      if (n.id === 'xr') { const i = (Math.floor(n.T / 3600e3) * 5) % nar; const p = H.ar[i].clone().multiplyScalar(H.R * 1.03);
        flash(F, p, col, 7 * str, 2.2, H.sun, { grow: 1.6 }); if (n.v >= -5) H.flare(i, 3 + 4 * Math.min(1, n.v + 5)); return; }
      if (n.id === 'f107' || n.id === 'sn') {
        // an active region lights up; F10.7 also triggers a flare there
        const i = (n.j * 7 + (n.id === 'sn' ? 3 : 0)) % nar;
        const p = H.ar[i].clone().multiplyScalar(H.R * 1.03);
        flash(F, p, col, (n.id === 'f107' ? 9 : 6) * str, n.id === 'f107' ? 3.2 : 2.4, H.sun, { grow: 1.5 });
        flash(F, p.clone().multiplyScalar(1.01), col.clone().multiplyScalar(1.4), 2.4 * str, 1.6, H.sun, { grow: 1.0 });
        if (n.id === 'f107') H.flare(i, 4 + 3 * n.vel);
        else for (let q = 0; q < 3; q++) {
          const d = H.ar[i].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12)).normalize().multiplyScalar(H.R * 1.02);
          flash(F, d, col, 1.6, 1.8 + q * 0.3, H.sun, { grow: 1.2 });
        }
      } else if (n.id === 'kp' || n.id === 'ap') {
        ring(F, new THREE.Vector3(), null, col, H.R * 1.05, H.R * (n.id === 'kp' ? 1.9 : 2.4), 2.4, { alpha: 0.3 });
      } else if (n.id === 'speed' || n.id === 'dens') {
        // a puff of wind leaving the corona
        const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize();
        flash(F, dir.clone().multiplyScalar(H.R), col, 3.5, 3.0, F.group, { grow: 1.3, move: (u, o) => o.position.copy(dir).multiplyScalar(H.R * (1.05 + 2.4 * u)) });
      } else if (n.id === 'bz') {
        const nrm = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        ring(F, new THREE.Vector3(), nrm, col, H.R * 1.1, H.R * 1.45, 2.0, { alpha: 0.3 });
      }
    },
    wind(n, col, s) {
      const F = fx.wind, H = s.hooks, AU = H.AU, k = H.U.uK.value;
      const along = (c0, r) => { const phi = c0 + k * (AU - r); return new THREE.Vector3(Math.cos(phi) * r, 0, Math.sin(phi) * r); };
      if (n.id === 'sr') { flash(F, new THREE.Vector3(AU, 0, 0), col, 2.2, 2.4, F.group, { alpha: 0.25, grow: 1.2 }); return; }
      if (n.id === 'xr') { ring(F, new THREE.Vector3(), null, col, H.RS * 1.5, AU * 1.05, 1.6, { alpha: 0.3 }); return; } // light-speed front
      if (n.id === 'speed' || n.id === 'dens') {
        // pulse riding the spiral field line that reaches Earth (speed) or a neighbor line (density)
        const c0 = n.id === 'speed' ? 0 : ((rr++ % 6) - 2.5) * 0.18;
        const dur = 3.4 * (400 / Math.max(250, n.id === 'speed' ? n.v : 400));
        const sz = n.id === 'speed' ? 4.5 : 2.6 + n.vel * 2;
        for (let q = 0; q < (n.id === 'speed' ? 3 : 1); q++) {
          const lag = q * 0.07;
          flash(F, along(c0, H.RS), col, sz * (1 - q * 0.25), dur, F.group, { grow: 1.0, attack: 0.05, alpha: 1 - q * 0.3,
            move: (u, o) => { const uu = Math.max(0, u - lag) / (1 - lag); o.position.copy(along(c0, H.RS + (AU * 1.05 - H.RS) * uu)); } });
        }
        if (n.id === 'speed') ring(F, new THREE.Vector3(AU, 0, 0), null, col, 1.6, 6, 1.4, { alpha: 0.45 });
      } else if (n.id === 'bz') {
        // ripple through the field near Earth, tilted like the IMF
        const nrm = new THREE.Vector3(1, n.v / 8, 0).normalize();
        ring(F, H.imf.position.clone(), nrm, col, 1.5, 7.5, 2.0, { alpha: 0.85 });
        flash(F, H.imf.position.clone(), col, 3, 1.4, F.group, { alpha: 0.5 });
      } else if (n.id === 'kp' || n.id === 'ap') {
        flash(F, new THREE.Vector3(AU, 0, 0), col, n.id === 'kp' ? 3.5 : 4.5, 2.0, F.group, { grow: 1.4, alpha: 0.5 });
        ring(F, new THREE.Vector3(AU, 0, 0), UP, col, 2, 4.5, 2.0, { alpha: 0.45 });
      } else {
        flash(F, new THREE.Vector3(0, 0, 0), col, n.id === 'f107' ? 16 : 12, 3, F.group, { grow: 1.3, alpha: 0.5 });
      }
    },
    magneto(n, col, s) {
      const F = fx.magneto, st = s.state;
      const mp = (th) => st.r0 * Math.pow(2 / (1 + Math.cos(th)), st.a);
      if (n.id === 'sr') { ring(F, new THREE.Vector3(), null, col, 1.05, 1.35, 2.2, { alpha: 0.35 }); return; }
      if (n.id === 'xr') { flash(F, new THREE.Vector3(0.9, 0, 0), col, 2.4, 1.6, F.group, { alpha: 0.4 }); return; }
      if (n.id === 'bz') {
        // ripple running from the nose of the magnetopause down the flanks
        ring(F, new THREE.Vector3(st.r0, 0, 0), X, col, 0.3, 1, 3.2, { alpha: 0.95,
          move: (u, o) => { const th = 0.05 + u * 2.0; const r = mp(th); o.position.set(r * Math.cos(th), 0, 0); const rad = r * Math.sin(th); o.scale.set(rad, rad, rad); } });
        flash(F, new THREE.Vector3(st.r0, 0, 0), col, 2.5, 1.0, F.group, { alpha: 0.5 });
      } else if (n.id === 'speed' || n.id === 'dens') {
        // a parcel of solar wind arrives and hits the nose
        const y = (Math.random() - 0.5) * st.r0 * 0.9, z = (Math.random() - 0.5) * st.r0 * 0.9;
        const th = Math.atan2(Math.hypot(y, z), st.r0);
        const hit = new THREE.Vector3(mp(th) * Math.cos(th), y, z);
        flash(F, new THREE.Vector3(st.r0 * 3.2, y, z), col, n.id === 'speed' ? 3.2 : 2.4, 1.6, F.group, { grow: 1.0, attack: 0.05,
          move: (u, o) => o.position.set(st.r0 * 3.2 + (hit.x - st.r0 * 3.2) * u, y, z) });
        setTimeout(() => flash(F, hit, col, 2.6, 1.4, F.group, { grow: 1.8, alpha: 0.55 }), 1400);
      } else if (n.id === 'kp' || n.id === 'ap') {
        // auroral rings at both poles of the small Earth
        const lat = THREE.MathUtils.degToRad(ovalEdge(Math.min(9, n.id === 'kp' ? n.v : 3)) + 4);
        for (const sgn of [1, -1]) ring(F, new THREE.Vector3(0, sgn * Math.sin(lat) * 1.03, 0), UP, col, Math.cos(lat) * 1.03, Math.cos(lat) * 1.25, 2.6, { alpha: 1 });
        flash(F, new THREE.Vector3(0, 0, 0), col, 3.2, 2.0, F.group, { alpha: 0.3 });
      } else {
        flash(F, new THREE.Vector3(st.xbs + 4, 0, 0), col, 22, 3, F.group, { alpha: 0.35, grow: 1.2 });
      }
    },
    oval(n, col, s) {
      const F = fx.oval, H = s.hooks, RE = H.RE;
      const onSphere = (latDeg, mlt, rr2 = 1.012) => { const la = THREE.MathUtils.degToRad(latDeg); return new THREE.Vector3(Math.cos(la) * Math.cos(mlt), Math.sin(la), Math.cos(la) * Math.sin(mlt)).multiplyScalar(RE * rr2); };
      if (n.id === 'sr') { flash(F, onSphere(5, (Math.random() - 0.5) * 2.4, 1.0), col, 1.4, 1.6, F.group, { alpha: 0.4 }); return; } // a far-off tropical storm
      if (n.id === 'xr') { flash(F, new THREE.Vector3(RE * 1.02, 0, 0), col, RE * 0.7, 2.0, F.group, { alpha: 0.15, grow: 1.1 }); return; }
      if (n.id === 'kp' || n.id === 'ap') {
        const kp = s.hooks.U.uKp.value;
        const pts = [];
        for (let q = 0; q < 180; q++) {
          const mlt = (q / 180) * Math.PI * 2, mid = 0.5 - 0.5 * Math.cos(mlt);
          const eq = (76.5 - kp) + ((66 - 2 * kp) - (76.5 - kp)) * mid, width = (2.5 + 0.3 * kp) + ((5.5 + 0.9 * kp) - (2.5 + 0.3 * kp)) * mid;
          pts.push(onSphere(eq + width * 0.5, mlt));
        }
        const p = F.loop(pts, 0.55); p.material.color.copy(col).multiplyScalar(0.45);
        F.add(p, 2.8, (u, o) => { o.material.opacity = env(u, 0.08) * 0.45; o.scale.setScalar(1 + 0.012 * u); }, (o) => { F.group.remove(o); o.geometry.dispose(); o.material.dispose(); });
        H.kick = Math.min(0.45, H.kick + (n.id === 'kp' ? 0.1 : 0.15) * n.vel);
      } else if (n.id === 'bz') {
        flash(F, onSphere(78, 0, 1.02), col, 3.2, 1.8, F.group, { grow: 1.6 }); // dayside cusp
        flash(F, onSphere(78, 0, 1.02), col, 1.2, 1.2, F.group, { grow: 1.0 });
      } else if (n.id === 'speed' || n.id === 'dens') {
        const mlt = (Math.random() - 0.5) * 1.6;
        flash(F, onSphere(74 + Math.random() * 3, mlt, 1.02), col, 2.6, 2.0, F.group, { grow: 1.4 });
      } else {
        flash(F, new THREE.Vector3(RE * 1.02, RE * 0.2, 0), col, RE * 0.8, 3.0, F.group, { alpha: 0.12, grow: 1.1 }); // dayglow
      }
    },
    curtain(n, col, s) {
      const F = fx.curtain, H = s.hooks;
      if (n.id === 'sr') { const ang = (Math.random() - 0.5) * 2.6; flash(F, new THREE.Vector3(Math.sin(ang) * 600, 8, -Math.cos(ang) * 600), col, 40, 0.9, F.group, { alpha: 0.35 }); return; } // distant lightning on the horizon
      if (n.id === 'xr') { flash(F, new THREE.Vector3(0, 420, -200), col, 140, 2.0, F.group, { alpha: 0.06, grow: 1.1 }); return; }
      if (n.id === 'kp' || n.id === 'ap') {
        H.kick = Math.min(1, H.kick + 0.25 * n.vel); if (H.tint.r + H.tint.g + H.tint.b < 0.15) H.tint.add(col.clone().multiplyScalar(0.025));
        // a vertical ray inside one of the visible curtains
        const c = H.curtains[(rr++) % H.curtains.length];
        const z = c.material.uniforms.uZ.value, x = c.position.x + (Math.random() - 0.5) * 300;
        const base = c.material.uniforms.uBase.value, h = c.material.uniforms.uH.value;
        const sp = flash(F, new THREE.Vector3(x, base + h * 0.45, z), col, 1, 2.6, F.group, { alpha: 0.9, grow: 1 });
        F.live[F.live.length - 1].fn = (u, o) => { const e = env(u, 0.1); o.material.opacity = e * 0.3; o.scale.set(12 + 6 * u, h * 1.1, 1); };
        void sp;
      } else if (n.id === 'bz') {
        const ang = (Math.random() - 0.5) * 1.8, d = 260, x = Math.sin(ang) * d, z = -Math.cos(ang) * d;
        flash(F, new THREE.Vector3(x, 120 + Math.random() * 60, z), col, 30, 2.0, F.group, { grow: 1.5, alpha: 0.8 });
      } else if (n.id === 'speed' || n.id === 'dens') {
        const ang = (Math.random() - 0.5) * 2.2, d = 320;
        const p0 = new THREE.Vector3(Math.sin(ang) * d, 200 + Math.random() * 80, -Math.cos(ang) * d);
        flash(F, p0, col, 16, 2.4, F.group, { grow: 1.0, move: (u, o) => o.position.set(p0.x, p0.y - 90 * u, p0.z) });
      } else {
        flash(F, new THREE.Vector3(0, 420, -200), col, 160, 3.2, F.group, { alpha: 0.1, grow: 1.1 });
      }
    },
    schumann(n, col, s) {
      const F = fx.schumann, H = s.hooks, U = H.U, ax = U.uAxis.value.clone().normalize();
      const css = '#' + col.clone().multiplyScalar(1 / 1.6).getHexString();
      if (n.id === 'sr') {
        // the modes this note sounds swell, in its color; a sferic races around from the main storm region
        for (let k = 0; k < Math.max(1, n.modes || 1); k++) { H.boost[k] = Math.min(0.9, H.boost[k] + 0.55 * n.vel * (k === (n.modes || 1) - 1 ? 1.4 : 0.6)); H.col[k] = css; }
        U.uHiCol.value.copy(col).multiplyScalar(0.6);
        H.sferic(ax, col, 2.4, 0.32);
      } else if (n.id === 'xr') {
        U.uFlare.value = Math.min(1.2, U.uFlare.value + 0.25 * n.vel);
        flash(F, U.uSun.value.clone().multiplyScalar(1.12), col, 0.5, 1.6, F.group, { alpha: 0.5, grow: 1.6 });
      } else if (n.id === 'kp' || n.id === 'ap') {
        for (const sg of [1, -1]) ring(F, new THREE.Vector3(0, sg * 1.04, 0), UP, col, 0.3, 0.55, 2.4, { alpha: 0.7 });
      } else if (n.id === 'f107' || n.id === 'sn') {
        flash(F, U.uSun.value.clone().multiplyScalar(1.13), col, 0.9, 2.6, F.group, { alpha: 0.25, grow: 1.2 });
      } else {
        ring(F, new THREE.Vector3(), null, col, 1.12, 1.3, 1.8, { alpha: 0.35 });
      }
    },
  };
  // ---- chain-of-events stages: a bigger, longer version of the matching reaction, in a fixed "event" color
  const STAGE_COL = { flare: [1, 0.85, 0.5], cme: [1, 0.6, 0.35], sid: [0.85, 0.8, 1], sep: [1, 0.4, 0.6], pca: [1, 0.4, 0.6], bz: [1, 0.35, 0.3],
    reconnect: [1, 0.45, 0.35], shock: [1, 0.7, 0.4], expand: [0.35, 1, 0.6], substorm: [0.4, 1, 0.6], storm: [0.5, 1, 0.65] };
  function stage(st, sc) {
    const col = new THREE.Color(...(STAGE_COL[st.fx] || [1, 1, 1])).multiplyScalar(1.8);
    const F = fx[sc.id]; if (!F) return;
    const big = (id, vel, extra = {}) => { const n = { id, midi: 60, v: extra.v ?? 0, j: 3, vel, T: st.t, modes: 5, ...extra }; for (let q = 0; q < 3; q++) setTimeout(() => { try { R[sc.id](n, col, sc); } catch (_e) { /* scene busy */ } }, q * 260); };
    if (sc.id === 'sun') {
      const H = sc.hooks, i = 1 % H.nar(); H.flare(i, 9);
      flash(F, H.ar[i].clone().multiplyScalar(H.R * 1.04), col, 22, 4, H.sun, { grow: 1.8 });
      if (st.fx === 'cme') for (let q = 0; q < 3; q++) ring(F, new THREE.Vector3(), null, col, H.R * 1.1, H.R * (3 + q), 5 + q, { alpha: 0.45 });
    } else if (sc.id === 'wind') {
      const H = sc.hooks, AU = H.AU;
      if (st.fx === 'cme') ring(F, new THREE.Vector3(), UP, col, AU * 0.2, AU * 1.15, 6, { alpha: 0.7 });
      else big('bz', 1, { v: -15 });
      big(st.fx === 'cme' ? 'speed' : 'dens', 1, { v: 700 });
    } else if (sc.id === 'magneto') {
      big('bz', 1, { v: -15 }); big('speed', 1, { v: 700 });
      flash(F, new THREE.Vector3(sc.state.r0, 0, 0), col, 9, 3.5, F.group, { alpha: 0.6, grow: 1.6 });
    } else if (sc.id === 'oval') {
      big('kp', 1, { v: 7 }); if (sc.hooks) sc.hooks.kick = Math.min(1, (sc.hooks.kick || 0) + 0.5);
    } else if (sc.id === 'curtain') {
      big('kp', 1, { v: 7 }); sc.hooks.kick = 1;
    } else if (sc.id === 'schumann') {
      const U = sc.hooks.U;
      if (st.fx === 'sid') U.uFlare.value = 1.0; else if (st.fx === 'sep') U.uPCA.value = 1.0; else U.uStorm.value = 1;
      big('sr', 1, { v: 1 });
    }
    stats.stages = (stats.stages || 0) + 1;
  }

  return {
    stats, fx, stage,
    // fire a note's reaction in each of the given scenes (current, plus the incoming one during a fade)
    note(n, active) {
      const col = noteColor3(n.midi);
      for (const s of active) {
        try { R[s.id](n, col, s); } catch (e) { console.warn('reaction', s.id, e); continue; }
        stats.total++; stats.byScene[s.id] = (stats.byScene[s.id] || 0) + 1; stats.bySet[n.id] = (stats.bySet[n.id] || 0) + 1;
      }
    },
    update(dt) { for (const s of scenes) fx[s.id].update(dt, s.camera); },
    liveCount() { return Object.values(fx).reduce((a, F) => a + F.live.length, 0); },
  };
}
