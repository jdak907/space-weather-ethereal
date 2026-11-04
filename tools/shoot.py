#!/usr/bin/env python3
"""Headless smoke test: load each scene, collect console errors, save screenshots.
Needs Playwright (pip install playwright) and a local server:
  python3 -m http.server 8931   (from the app folder)
  python3 tools/shoot.py [--base http://localhost:8931/] [--mobile]
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

SCENES = ["sun", "wind", "magneto", "oval", "curtain"]
ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8931/")
ap.add_argument("--wait", type=float, default=9)
ap.add_argument("--mobile", action="store_true")
ap.add_argument("--scenes", default=",".join(SCENES))
ap.add_argument("--chrome", default=None, help="path to a Chrome/Chromium binary")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots"))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
problems, report = [], {}
with sync_playwright() as p:
    kw = {"args": args, "headless": True}
    if a.chrome: kw["executable_path"] = a.chrome
    b = p.chromium.launch(**kw)
    vp = {"width": 390, "height": 844} if a.mobile else {"width": 1440, "height": 900}
    ctx = b.new_context(viewport=vp, device_scale_factor=2 if a.mobile else 1, has_touch=a.mobile, is_mobile=a.mobile)
    for sc in a.scenes.split(","):
        pg = ctx.new_page()
        errs = []
        pg.on("console", lambda m, errs=errs: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e, errs=errs: errs.append(f"pageerror: {e}"))
        pg.on("requestfailed", lambda r, errs=errs: errs.append(f"requestfailed: {r.url} {r.failure}"))
        pg.goto(f"{a.base}?scene={sc}&tour=0", wait_until="load")
        time.sleep(a.wait)
        info = pg.evaluate("""() => { const s = window.__spacewx; return s ? {live: s.D && s.D.live, errors: s.D && s.D.errors,
            badge: document.getElementById('badge').innerText, P: s.P} : null }""")
        fps = pg.evaluate("""() => new Promise(r => { let n=0; const t0=performance.now();
            function f(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(f); else r(n/((performance.now()-t0)/1000)); } requestAnimationFrame(f); })""")
        name = f"{sc}{'-mobile' if a.mobile else ''}.png"
        pg.screenshot(path=os.path.join(a.out, name))
        report[sc] = {"errors": errs, "info": info, "fps_headless": round(fps, 1), "shot": os.path.join(a.out, name)}
        pg.close()
    b.close()
print(json.dumps(report, indent=1, default=str))
