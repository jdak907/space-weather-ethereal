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
      "solo_tour": ("?scene=sun&live=%s" % a.live, lambda pg: (click_sound(pg), pg.evaluate("() => { const o = window.__spacewx.orch; o.ch.bz.on = true; o.ch.bz.solo = true; o.refresh(); }")), [6], ["combo-solo-bz.png"]),
    }
    for name, (url, setup, waits, shots) in jobs.items():
        if a.only and name not in a.only.split(","): continue
        run(name, url, setup, waits, shots)
    if not a.only or "mobile" in a.only:
        run("mobile", "?scene=curtain&tour=0&orch=1&live=%s" % a.live, lambda pg: pg.click("#orch .o-play"), [6], ["combo-mobile-panel.png"], vp=(390, 844), mobile=True)
    b.close()
print(json.dumps(report, indent=1, default=str))
