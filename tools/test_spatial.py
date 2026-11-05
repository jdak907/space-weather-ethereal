#!/usr/bin/env python3
"""Spatial audio tests (headless Chromium): panner graph, listener follows camera, output-mode logic for
maxChannelCount 2/6/8, and OfflineAudioContext renders that check which channels carry energy for
sources at known angles. Also takes screenshots/audio-output-panel.png."""
import argparse, json, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8931/")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots"))
a = ap.parse_args()
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"]

# rendered in the page: a Spatial stage on an OfflineAudioContext with n channels; one tone per angle
OFFLINE = r'''async ([n, mode, cases]) => {
  const { Spatial, LAYOUTS } = window.__spacewx.spatial; const THREE = window.__spacewx.THREE;
  const out = [];
  for (const az of cases) {
    const ctx = new OfflineAudioContext(n, 48000 * 0.5, 48000);
    const comp = ctx.createGain(); comp.connect(ctx.destination); // plain gain instead of the compressor: linear energy
    const master = ctx.createGain(); master.connect(comp);
    const dryOut = ctx.createGain(); dryOut.connect(master); const wetIn = ctx.createGain();
    const sp = new Spatial(ctx, { dryOut, wetIn, master, comp }); const got = sp.setMode(mode);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100); cam.position.set(0, 0, 0); cam.lookAt(0, 0, -1); cam.updateMatrixWorld();
    const id = az === 'lfe' ? 'sr' : 'x';
    const ang = az === 'lfe' ? 0 : az * Math.PI / 180;
    const p = new THREE.Vector3(-Math.sin(ang) * 2, 0, -Math.cos(ang) * 2);
    const o = ctx.createOscillator(); o.frequency.value = az === 'lfe' ? 60 : 440; o.connect(sp.input(id)); o.start();
    sp.setRefDistance(2); sp.update(cam, () => p, 0);
    const buf = await ctx.startRendering();
    const rms = []; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; rms.push(+Math.sqrt(s / d.length).toFixed(4)); }
    const L = LAYOUTS[got], names = L ? L.short : ['L', 'R'];
    const order = rms.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
    out.push({ az, mode: got, rms, loudest: names[order[0][1]], second: order[1] && order[1][0] > 0.01 ? names[order[1][1]] : null, kinds: sp.describe().voices });
  }
  return out; }'''

def expect(results, want):
    bad = []
    for r, w in zip(results, want):
        if w is None: continue
        ok = r["loudest"] in w if isinstance(w, (list, tuple)) else r["loudest"] == w
        if not ok: bad.append(f'az {r["az"]}: loudest {r["loudest"]} want {w}')
    return bad

report = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=args, headless=True)

    def page(mock=None, vp=(1440, 900)):
        ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]})
        if mock:
            # pretend the audio device has `mock` output channels (only the reported maximum is faked)
            ctx.add_init_script(f"Object.defineProperty(AudioDestinationNode.prototype, 'maxChannelCount', {{ get() {{ return {mock}; }} }});")
        pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        return ctx, pg, errs

    # 1. live page: HRTF graph and listener following the camera
    ctx, pg, errs = page()
    pg.goto(a.base + "?scene=magneto&tour=0&live=0", wait_until="load")
    pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(2)
    pg.click("#btn-sound"); time.sleep(1.5)
    r = {"default": pg.evaluate("() => window.__spacewx.orch.outputInfo()")}
    pg.evaluate("() => window.__spacewx.orch.setOutput('hrtf')"); time.sleep(1.0)
    r["graph"] = pg.evaluate('''() => { const sp = window.__spacewx.orch.rig.sp; const v = Object.values(sp.voices);
      return { mode: sp.mode, n: v.length, hrtf: v.filter((x) => x.p && x.p.panningModel === 'HRTF' && x.p.distanceModel === 'inverse').length,
        ids: Object.keys(sp.voices), refDistance: sp.refDist, anchors: Object.fromEntries(Object.entries(sp.voices).map(([k, x]) => [k, x.pos && x.pos.map((q) => +q.toFixed(1))])) } }''')
    cam_check = '''() => { const s = window.__spacewx, sc = s.scenes[s.shown], c = sc.camera, L = s.orch.rig.ctx.listener;
      const lp = [L.positionX.value, L.positionY.value, L.positionZ.value], cp = c.position.toArray();
      const e = c.matrixWorld.elements, f = [-e[8], -e[9], -e[10]], lf = [L.forwardX.value, L.forwardY.value, L.forwardZ.value];
      const dist = Math.hypot(...lp.map((x, i) => x - cp[i])), fd = Math.hypot(...lf.map((x, i) => x - f[i]));
      return { scene: sc.id, listener: lp.map((x) => +x.toFixed(2)), camera: cp.map((x) => +x.toFixed(2)), posErr: +dist.toFixed(3), fwdErr: +fd.toFixed(3), updates: s.orch.rig.sp.stats.listenerUpdates } }'''
    r["before"] = pg.evaluate(cam_check)
    # orbit + zoom: move the camera to the other side and closer, the listener has to follow
    pg.evaluate("() => { const s = window.__spacewx, sc = s.scenes[s.shown]; sc.camera.position.set(-30, 10, -25); sc.controls.update(); sc.lastUser = 1e9; }")
    time.sleep(1.0)
    r["after"] = pg.evaluate(cam_check)
    # switch scene: listener moves into the Schumann scene's camera frame
    pg.evaluate("() => window.__spacewx.go(5, true)"); time.sleep(4)
    r["schumann"] = pg.evaluate(cam_check)
    r["srAnchor"] = pg.evaluate("() => { const v = window.__spacewx.orch.rig.sp.voices.sr; return v && v.pos }")
    pg.evaluate("() => window.__spacewx.orch.setOutput('stereo')"); time.sleep(0.5)
    r["backToStereo"] = pg.evaluate("() => window.__spacewx.orch.outputInfo()")
    r["errors"] = errs
    r["ok"] = (r["graph"]["mode"] == "hrtf" and r["graph"]["hrtf"] == r["graph"]["n"] and r["graph"]["n"] >= 9
               and r["after"]["posErr"] < 0.5 and r["after"]["fwdErr"] < 0.05 and r["before"]["camera"] != r["after"]["camera"]
               and r["schumann"]["posErr"] < 0.5 and r["backToStereo"]["mode"] == "stereo" and not errs)
    report["hrtf_listener"] = r

    # 2. offline renders: which channels carry the energy
    off = {}
    pg.evaluate("() => { if (!window.__spacewx.THREE) throw new Error('THREE not exposed') }")
    off["5.1"] = pg.evaluate(OFFLINE, [6, "5.1", [30, -30, 0, 110, -110, 180, "lfe"]])
    off["5.1_bad"] = expect(off["5.1"], ["L", "R", "C", "Ls", "Rs", ["Ls", "Rs"], ["C", "LFE"]])
    off["5.1_lfe_share"] = round(off["5.1"][-1]["rms"][3] / max(off["5.1"][-1]["rms"]), 3)
    off["7.1"] = pg.evaluate(OFFLINE, [8, "7.1", [30, -30, 0, 90, -90, 135, -135, "lfe"]])
    off["7.1_bad"] = expect(off["7.1"], ["L", "R", "C", "Ls", "Rs", "Lb", "Rb", ["C", "LFE"]])
    off["7.1_lfe_share"] = round(off["7.1"][-1]["rms"][3] / max(off["7.1"][-1]["rms"]), 3)
    off["hrtf"] = pg.evaluate(OFFLINE, [2, "hrtf", [90, -90]])
    off["hrtf_bad"] = expect(off["hrtf"], ["L", "R"])
    off["stereo"] = pg.evaluate(OFFLINE, [2, "stereo", [90]])
    # Auto with a 2-channel offline context stays stereo; auto with 6 or 8 picks surround
    off["auto"] = pg.evaluate('''() => { const { Spatial } = window.__spacewx.spatial; const r = {};
      for (const n of [2, 6, 8]) { const ctx = new OfflineAudioContext(n, 128, 48000); const g = () => ctx.createGain();
        const m = g(), c = g(); c.connect(ctx.destination); m.connect(c); const d = g(); d.connect(m);
        const sp = new Spatial(ctx, { dryOut: d, wetIn: g(), master: m, comp: c }); const info = sp.describe();
        r[n] = { auto: info.mode, available: info.available, destCount: info.destCount, destInterp: info.destInterp, order: info.order }; }
      return r; }''')
    off["auto_ok"] = off["auto"]["2"]["auto"] == "stereo" and off["auto"]["6"]["auto"] == "5.1" and off["auto"]["8"]["auto"] == "7.1" \
        and not off["auto"]["2"]["available"]["5.1"] and off["auto"]["6"]["available"]["5.1"] and not off["auto"]["6"]["available"]["7.1"] and off["auto"]["8"]["available"]["7.1"] \
        and off["auto"]["6"]["destInterp"] == "discrete"
    off["errors"] = errs
    report["offline"] = off

    # 3. the panel on this (2-channel) machine: surround disabled; screenshot
    pg.evaluate("() => window.__spacewx.orch.setOutput('hrtf')")
    pg.click("#btn-orch"); time.sleep(0.8)
    pg.evaluate("() => document.getElementById('o-out').scrollIntoView({ block: 'center' })"); time.sleep(0.3)
    pg.click("#o-sptest"); time.sleep(1.4)
    report["panel_2ch"] = pg.evaluate('''() => { const s = document.getElementById('o-out-sel');
      return { options: [...s.options].map((o) => ({ v: o.value, label: o.textContent, disabled: o.disabled })), value: s.value, label: document.getElementById('o-sptest-l').textContent } }''')
    pg.screenshot(path=os.path.join(a.out, "audio-output-panel.png"))
    report["panel_2ch"]["errors"] = errs
    ctx.close()

    # 4. mocked maxChannelCount 6 and 8: which options the panel offers and what Auto picks
    for n in (6, 8):
        ctx, pg, errs = page(mock=n)
        pg.goto(a.base + "?scene=sun&tour=0&live=0", wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(1.5)
        pg.evaluate("() => { try { localStorage.removeItem('swe.out') } catch (e) {} }")
        pg.click("#btn-orch"); time.sleep(0.8)
        res = pg.evaluate('''() => { const s = document.getElementById('o-out-sel'), info = window.__spacewx.orch.outputInfo();
          return { info, options: [...s.options].map((o) => ({ v: o.value, disabled: o.disabled, label: o.textContent })) } }''')
        res["errors"] = errs
        if n == 8:
            pg.evaluate("() => document.getElementById('o-out').scrollIntoView({ block: 'center' })"); time.sleep(0.3)
            pg.screenshot(path=os.path.join(a.out, "audio-output-panel-7.1-mock.png"))
        report[f"mock_{n}"] = res
        ctx.close()
    b.close()
print(json.dumps(report, indent=1, default=str))
