#!/usr/bin/env python3
"""Headless test of the visualizer + orchestra: console errors, audio graph, scheduled notes,
visual reactions, and screenshots. Needs Playwright and a local server on --base."""
import argparse, json, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8931/")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots"))
ap.add_argument("--live", default="1")
ap.add_argument("--only", default="")
a = ap.parse_args()
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"]
STATE = """() => { const s = window.__spacewx; const o = s.orch; return {
  ctx: o.rig ? o.rig.ctx.state : null, sampleRate: o.rig ? o.rig.ctx.sampleRate : null, playing: o.playing,
  stats: o.stats, reactions: s.reactions.stats, liveFx: s.reactions.liveCount(), playK: s.playK, N: o.N,
  cur: s.scenes[s.cur].id, live: s.D.live, errors: s.D.errors, activeVoices: o.rig ? o.rig.active : 0,
  strip: s.opt.strip } }"""
report = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=args, headless=True)
    def run(name, url, setup, waits, shots, vp=(1440, 900), mobile=False):
        ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile)
        pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        pg.goto(a.base + url, wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000)
        time.sleep(2)
        setup(pg)
        out = {"states": []}
        for i, w in enumerate(waits):
            time.sleep(w)
            out["states"].append(pg.evaluate(STATE))
            if i < len(shots) and shots[i]:
                pg.screenshot(path=os.path.join(a.out, shots[i]))
        out["errors"] = errs
        report[name] = out
        ctx.close()

    def click_sound(pg):
        pg.click("#btn-sound")  # a real user click starts the AudioContext

    def scene_setup(scene):
        def f(pg):
            click_sound(pg)
        return f

    jobs = {
      "sun": ("?scene=sun&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('all'); }"), click_sound(pg)), [7, 1.2], ["", "combo-sun.png"]),
      "wind": ("?scene=wind&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('storm'); }"), click_sound(pg)), [7, 0.9], ["", "combo-wind.png"]),
      "magneto": ("?scene=magneto&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('storm'); }"), click_sound(pg)), [7, 1.0], ["", "combo-magneto.png"]),
      "aurora": ("?scene=curtain&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('ambient'); }"), click_sound(pg)), [7, 1.0], ["", "combo-aurora.png"]),
      "oval": ("?scene=oval&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('ambient'); }"), click_sound(pg)), [7, 1.0], ["", "combo-oval.png"]),
      "panel": ("?scene=wind&tour=0&orch=1&live=%s" % a.live, lambda pg: (pg.click("#orch .o-presets button[data-preset='all']"), pg.click("#orch .o-play")), [6, 1], ["", "combo-orchestra-panel.png"]),
      "schumann": ("?scene=schumann&tour=0&live=%s" % a.live, lambda pg: (pg.evaluate("() => { const o = window.__spacewx.orch; o.applyPreset('ambient'); }"), click_sound(pg)), [8, 1.0], ["", "schumann.png"]),
      "schumann_orch": ("?scene=schumann&tour=0&orch=1&live=%s" % a.live, lambda pg: (pg.click("#orch .o-presets button[data-preset='schumann']"), pg.click("#orch .o-play")), [7, 1], ["", "schumann-orchestra.png"]),
      "solo_tour": ("?scene=sun&live=%s" % a.live, lambda pg: (click_sound(pg), pg.evaluate("() => { const o = window.__spacewx.orch; o.ch.bz.on = true; o.ch.bz.solo = true; o.refresh(); o.seek(o.kAtTime(o.S.bz.start)); }")), [6], ["combo-solo-bz.png"]),
    }
    for name, (url, setup, waits, shots) in jobs.items():
        if a.only and name not in a.only.split(","): continue
        run(name, url, setup, waits, shots)
    if not a.only or "schumann_mobile" in a.only:
        run("schumann_mobile", "?scene=schumann&tour=0&live=%s" % a.live, click_sound, [7], ["schumann-mobile.png"], vp=(390, 844), mobile=True)

    # ---- timeline checks on real data: one clock, L1 shift, causal stage order
    def timeline_checks(pg):
        return pg.evaluate('''() => { const s = window.__spacewx, o = s.orch, D = s.D, bad = [];
          for (const id of Object.keys(o.R)) if (Array.isArray(o.R[id]) && o.R[id].length !== o.N) bad.push('R.' + id + ' length');
          for (let k = 1; k < o.N; k++) if (o.T[k] <= o.T[k - 1]) { bad.push('T not increasing at ' + k); break; }
          const lags = D.swE.lag.filter((x) => x > -900);
          const lagMin = Math.min(...lags), lagMax = Math.max(...lags);
          if (lags.length && (lagMin < 15 || lagMax > 110)) bad.push('L1 lag out of range ' + lagMin + '..' + lagMax);
          for (const c of o.chains) for (let i = 1; i < c.stages.length; i++) if (c.stages[i].t < c.stages[i - 1].t) bad.push('stage order ' + c.e.type);
          return { bad, N: o.N, slotMin: o.slotMs / 60e3, events: o.chains.map((c) => c.e.type), lagMin, lagMax, windShiftedPoints: lags.length }; }''')
    if not a.only or "timeline_real" in a.only:
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        pg.goto(a.base + "?scene=wind&tour=0&live=%s" % a.live, wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S && window.__spacewx.orch.chains", timeout=40000); time.sleep(6)
        report["timeline_real"] = {"checks": timeline_checks(pg), "errors": errs}; ctx.close()

    # ---- the Typical storm demo in event mode, with the tour following the chain of events
    if not a.only or "timeline_demo" in a.only:
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        pg.goto(a.base + "?scene=sun&demo=1&event=1&dwell=90&autoplay=0&live=%s" % a.live, wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.D && window.__spacewx.D.demo", timeout=40000); time.sleep(2)
        pg.click("#btn-sound")
        out = {"shots": [], "errors": errs, "checks": timeline_checks(pg)}
        # jump to just before each stage, let the chain play, and photograph it
        targets = [("flare", "sun", "timeline-1-flare-sun.png"), ("flare", "schumann", "timeline-2-xray-schumann.png"),
                   ("cme", "magneto", "timeline-3-cme-arrival-magnetosphere.png"), ("bzs", "oval", "timeline-4-oval.png"), ("bzs", "curtain", "timeline-5-curtains.png")]
        for typ, sc, name in targets:
            info = pg.evaluate('''([typ, sc]) => { const s = window.__spacewx, o = s.orch;
              const c = o.chains.find((c) => c.e.type === typ && c.stages.some((x) => x.scene === sc)); const st = c.stages.find((x) => x.scene === sc);
              o.seek(Math.max(0, o.kAtTime(st.t - 25 * 60e3))); return { t: st.t, label: st.label }; }''', [typ, sc])
            # wait until the tour has carried the camera to that stage's scene, then let the effect land
            for _ in range(40):
                time.sleep(0.5)
                if pg.evaluate("(sc) => { const s = window.__spacewx; return s.scenes[s.cur].id === sc && s.chainLog.some((x) => x.scene === sc) }", sc): break
            time.sleep(1.2)
            st = pg.evaluate("() => { const s = window.__spacewx; return { cur: s.scenes[s.cur].id, T: new Date(s.clockT()).toISOString(), log: s.chainLog.slice(-4).map((x) => x.type + ':' + x.fx + '@' + x.scene) } }")
            pg.screenshot(path=os.path.join(a.out, name))
            out["shots"].append({"want": sc, "stage": info["label"], **st, "shot": name})
        out["order"] = pg.evaluate("() => { const L = window.__spacewx.chainLog; let ok = true; for (let i = 1; i < L.length; i++) if (L[i].t < L[i-1].t && L[i].wall - L[i-1].wall < 1) ok = false; return { n: L.length, ok } }")
        report["timeline_demo"] = out; ctx.close()

    if not a.only or "mobile" in a.only:
        run("mobile", "?scene=curtain&tour=0&orch=1&live=%s" % a.live, lambda pg: pg.click("#orch .o-play"), [6], ["combo-mobile-panel.png"], vp=(390, 844), mobile=True)
    b.close()
print(json.dumps(report, indent=1, default=str))
