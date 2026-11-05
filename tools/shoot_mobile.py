#!/usr/bin/env python3
"""Mobile layout + solar-wind close-up screenshots (iPhone emulation and desktop).
  python3 tools/shoot_mobile.py --tag after   ->  screenshots/mobile-layout-after.png, wind-after.png, ...
Checks that no control, the time readout, or the Bartels labels fall outside the viewport."""
import argparse, json, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8931/")
ap.add_argument("--tag", default="after")
ap.add_argument("--live", default="0")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots"))
a = ap.parse_args()
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"]
CLIP = """() => { const W = innerWidth, out = [];
  const sel = ['#controls button', '#replay-bar', '#replay-date', '#strip-wrap', '#strip-size', '#readout', '#caption'];
  for (const s of sel) for (const e of document.querySelectorAll(s)) { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    if (r.left < -0.5 || r.right > W + 0.5) out.push({ el: s + (e.id ? '#' + e.id : '') + ' ' + (e.textContent || '').trim().slice(0, 24), left: Math.round(r.left), right: Math.round(r.right), W }); }
  const d = document.getElementById('replay-date'); const clipped = d && d.scrollWidth > d.clientWidth + 1;
  const ctl = document.getElementById('controls').getBoundingClientRect(), bar = document.getElementById('replay-bar').getBoundingClientRect();
  const btns = [...document.querySelectorAll('#controls button')].map((b) => b.getBoundingClientRect());
  const overlap = btns.some((r) => !(r.right <= bar.left || r.left >= bar.right || r.bottom <= bar.top || r.top >= bar.bottom));
  const st = window.__spacewx.strip; return { offscreen: out, timeTextClipped: clipped, timeText: d && d.textContent, barOverlapsButtons: overlap,
    stripLabelPad: st && st.padL, controlsBox: [ctl.left, ctl.top, ctl.right, ctl.bottom].map(Math.round),
    timelineEndsHoursBeforeNow: +((Date.now() - window.__spacewx.orch.timeOf(window.__spacewx.orch.N - 1)) / 3600e3).toFixed(2), timelineDays: +((window.__spacewx.orch.timeOf(window.__spacewx.orch.N - 1) - window.__spacewx.orch.timeOf(0)) / 864e5).toFixed(2) }; }"""
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=args, headless=True)
    iphone = dict(p.devices["iPhone 13"])  # 390x844, Mobile Safari UA, touch
    iphone.pop("default_browser_type", None)
    extra = {f"w{w}": dict(iphone, viewport={"width": w, "height": h}) for w, h in ((375, 667), (430, 932), (260, 563))}  # 260 = 150% text zoom on a 390 phone
    for name, kw in (("mobile", iphone), *extra.items(), ("desktop", {"viewport": {"width": 1440, "height": 900}})):
        ctx = b.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
        pg.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" else None)
        pg.goto(a.base + "?scene=sun&tour=0&live=" + a.live, wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(2)
        pg.click("#btn-sound"); time.sleep(4)
        res[name] = pg.evaluate(CLIP); res[name]["errors"] = errs
        pg.screenshot(path=os.path.join(a.out, f"{name}-layout-{a.tag}.png"))
        if name.startswith("w"):
            ctx.close(); continue
        # solar wind scene, camera close to Earth so the near-Earth plasma is visible
        pg.evaluate("() => window.__spacewx.go(1, true)"); time.sleep(1)
        pg.evaluate("""() => { const s = window.__spacewx, sc = s.scenes[1], c = sc.controls; sc.lastUser = 1e9;
          c.target.set(57, 0, 0); sc.camera.position.set(44, 9, 22); c.update(); }"""); time.sleep(5)
        pg.screenshot(path=os.path.join(a.out, f"wind{'-mobile' if name == 'mobile' else ''}-{a.tag}.png"))
        if name == "desktop":
            pg.evaluate("() => window.__spacewx.go(2, true)"); time.sleep(5)
            pg.screenshot(path=os.path.join(a.out, f"magneto-flow-{a.tag}.png"))
        ctx.close()
    b.close()
print(json.dumps(res, indent=1))
