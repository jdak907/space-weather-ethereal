#!/usr/bin/env python3
"""Record a short silent video of the auto tour with the orchestra playing (visual reactions only;
headless video has no audio track). Output: screenshots/combo-tour.webm"""
import os, shutil, sys, time, glob
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8931/"
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 70
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots")
tmp = "/tmp/spacewx-video"; shutil.rmtree(tmp, ignore_errors=True)
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
with sync_playwright() as p:
    b = p.chromium.launch(args=args, headless=True)
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, record_video_dir=tmp, record_video_size={"width": 1280, "height": 720})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(base + "?scene=sun&dwell=11&quality=low", wait_until="load")
    pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000)
    pg.evaluate("() => window.__spacewx.orch.applyPreset('all')")
    pg.click("#btn-sound")
    time.sleep(secs)
    st = pg.evaluate("() => ({stats: window.__spacewx.orch.stats, fx: window.__spacewx.reactions.stats})")
    ctx.close(); b.close()
v = glob.glob(tmp + "/*.webm")[0]
shutil.move(v, os.path.join(out, "combo-tour.webm"))
print(st, errs)
