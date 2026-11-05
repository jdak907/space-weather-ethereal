#!/usr/bin/env python3
"""Earth screenshots: python3 tools/shoot_earth.py --tag after -> screenshots/earth-<tag>.png (magnetosphere),
earth-closeup-<tag>.png, earth-schumann-<tag>.png, earth-wind-<tag>.png, earth-oval-<tag>.png, earth-mobile-<tag>.png"""
import argparse, json, os, time
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument("--base", default="http://localhost:8931/"); ap.add_argument("--tag", default="after")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots"))
a = ap.parse_args()
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
HIDE = "() => { document.getElementById('ui').style.display = 'none'; }"
def cam(i, target, pos):
    return f"""() => {{ const s = window.__spacewx; s.go({i}, true); const sc = s.scenes[{i}], c = sc.controls; sc.lastUser = 1e9;
      c.target.set({target}); sc.camera.position.set({pos}); c.update(); }}"""
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=args)
    for name, kw in (("desk", {"viewport": {"width": 1280, "height": 800}}), ("mobile", {**{k: v for k, v in p.devices["iPhone 13"].items() if k != "default_browser_type"}})):
        ctx = b.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
        pg.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" else None)
        pg.goto(a.base + "?scene=magneto&tour=0&live=0", wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(5)
        if name == "mobile":
            pg.screenshot(path=os.path.join(a.out, f"earth-mobile-{a.tag}.png"))
        else:
            pg.screenshot(path=os.path.join(a.out, f"earth-{a.tag}.png"))
            pg.evaluate(HIDE)
            # close-up: Earth from the sunward side (Sun toward +x in the magnetosphere scene)
            pg.evaluate(cam(2, "0, 0, 0", "2.6, 1.1, 1.6")); time.sleep(4)
            pg.screenshot(path=os.path.join(a.out, f"earth-closeup-{a.tag}.png"))
            pg.evaluate(cam(5, "0, 0, 0", "0.6, 1.2, 3.0")); time.sleep(4)
            pg.screenshot(path=os.path.join(a.out, f"earth-schumann-{a.tag}.png"))
            pg.evaluate(cam(1, "60, 0, 0", "55, 3, 5")); time.sleep(4)
            pg.screenshot(path=os.path.join(a.out, f"earth-wind-{a.tag}.png"))
            pg.evaluate("() => window.__spacewx.go(3, true)"); time.sleep(4)
            pg.screenshot(path=os.path.join(a.out, f"earth-oval-{a.tag}.png"))
            res["tex"] = pg.evaluate("() => window.__spacewx.earthTex ? window.__spacewx.earthTex.status() : null")
        res[name + "_errors"] = errs; ctx.close()
    b.close()
print(json.dumps(res, indent=1))
