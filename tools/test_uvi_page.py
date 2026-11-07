#!/usr/bin/env python3
"""Browser checks for the SMILE UVI panel. Does not contact ESA.

  python3 -m http.server 8931
  python3 tools/test_uvi_page.py --base http://127.0.0.1:8931/ --out /tmp/uvi-shots
"""
import argparse, os, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:8931/")
ap.add_argument("--out", default="/tmp/uvi-shots")
ap.add_argument("--chrome", default="/usr/local/bin/google-chrome")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
ESA = ("emds.esac.esa.int", "hpa.esa.int", "cosmos.esa.int")
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
problems = []

def shot(page, name):
    path = os.path.join(a.out, name)
    page.screenshot(path=path)
    print("shot", path)
    return path

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=a.chrome, headless=True, args=args)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    hits, errs = [], []
    pg.on("request", lambda r: hits.append(r.url))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(a.base + "?scene=oval&tour=0&live=0", wait_until="load")
    pg.wait_for_function("() => document.body.classList.contains('uvi-on') && document.getElementById('uvi').innerText.includes('pending Science Working Team')")
    pg.wait_for_timeout(2500)
    text = pg.inner_text("#uvi")
    if "SMILE UVI feed pending Science Working Team agreement" not in text:
        problems.append("placeholder text missing")
    if "preliminary" not in text or "uncalibrated" not in text or "ESA / CAS" not in text:
        problems.append("labels missing: " + text[:240])
    if "Wang" not in text or "Zhang" not in text:
        problems.append("citations not in the panel")
    readout = pg.inner_text("#readout")
    if "Kp" not in readout or "Oval edge" not in readout:
        problems.append("Kp model readout missing: " + readout)
    if "pending SWT" not in readout:
        problems.append("readout UVI status: " + readout)
    cap = pg.inner_text("#caption")
    if "Kp model" not in cap and "Model layer" not in cap:
        problems.append("globe not labeled as the model")
    badge = pg.inner_text("#badge")
    if "LIVE" in badge and "UVI" in badge:
        problems.append("badge treats UVI as live: " + badge)
    shot(pg, "uvi-placeholder.png")

    pg.locator("#uvi .uvi-opt").evaluate("el => { el.open = true }")
    pg.click("#uvi button[data-uvi=synthetic]")
    pg.wait_for_function("() => { const img = document.querySelector('#uvi img'); return img && !img.hidden && img.getAttribute('src'); }")
    pg.wait_for_timeout(1500)
    alt = pg.get_attribute("#uvi img", "alt") or ""
    if "Synthetic" not in alt:
        problems.append("alt: " + alt)
    syn = pg.inner_text("#uvi")
    if "latest available, age" not in syn or "SYNTHETIC" not in syn or "Wang" not in syn or "Zhang" not in syn:
        problems.append("synthetic status: " + syn[:500])
    ro2 = pg.inner_text("#readout")
    if "Kp" not in ro2 or "age" not in ro2:
        problems.append("readout after synthetic: " + ro2)
    if "no SMILE coverage" in pg.inner_text("#uvi [data-uvi-ph]"):
        problems.append("current synthetic frame is blank")
    shot(pg, "uvi-synthetic.png")

    pg.click("#uvi button[data-uvi=zoom]")
    pg.wait_for_selector("#uvi-zoom[open]")
    pg.wait_for_timeout(300)
    if "Global timeline unchanged" not in pg.inner_text("#uvi-zoom"):
        problems.append("zoom window did not say the global timeline is unchanged")
    if "Wang" not in pg.inner_text("#uvi-zoom") or "Zhang" not in pg.inner_text("#uvi-zoom"):
        problems.append("zoom citations missing")
    shot(pg, "uvi-zoom.png")

    gap = pg.evaluate("""() => {
      const u = window.__spacewx.uvi;
      const frames = u.catalog.frames;
      let hole = null;
      for (let i = 0; i < frames.length - 1; i++) {
        if (frames[i + 1].validFrom - frames[i].validTo > 60000) {
          hole = (frames[i].validTo + frames[i + 1].validFrom) / 2;
          break;
        }
      }
      const play = window.__spacewx.clockT();
      u.seek(hole);
      const z = document.getElementById('uvi-zoom');
      const side = document.getElementById('uvi');
      return {
        hole,
        zoom: z.innerText.slice(0, 320),
        zoomImg: !z.querySelector('img').hidden,
        sideImg: !side.querySelector('img').hidden,
        sideState: side.dataset.uviState,
        playSame: Math.abs(play - window.__spacewx.clockT()) < 2000,
        slot: window.__spacewx.orch.slotMs,
        audio: side.dataset.uviAudio,
        stored: Object.keys(localStorage).filter(k => /uvi/i.test(k)),
      };
    }""")
    print("gap", gap)
    if "no SMILE coverage" not in gap["zoom"]:
        problems.append("gap did not blank the zoom window")
    if gap["zoomImg"]:
        problems.append("gap still shows an image")
    if not gap["sideImg"] or gap["sideState"] != "frame":
        problems.append("side panel left the global clock: " + str(gap))
    if not gap["playSame"]:
        problems.append("scrubbing moved the global clock")
    if gap["slot"] and abs(gap["slot"] - 45 * 60 * 1000) > 1:
        problems.append("slotMs changed: " + str(gap["slot"]))
    if gap["audio"] != "silent":
        problems.append("UVI audio not silent")
    if gap["stored"]:
        problems.append("uvi persisted: " + str(gap["stored"]))
    shot(pg, "uvi-gap.png")

    future = pg.evaluate("""() => {
      const u = window.__spacewx.uvi;
      const ahead = u.catalog.frames.find(f => f.obsTime > Date.now());
      const side = document.getElementById('uvi');
      const z = document.getElementById('uvi-zoom');
      if (!ahead) return { skipped: true, side: side.dataset.uviState, sideImg: !side.querySelector('img').hidden };
      const play = window.__spacewx.clockT();
      u.seek(ahead.obsTime + 1000);
      return {
        skipped: false,
        side: side.dataset.uviState,
        sideImg: !side.querySelector('img').hidden,
        zoom: z.querySelector('[data-uvi-status]').innerText,
        playSame: Math.abs(play - window.__spacewx.clockT()) < 2000,
      };
    }""")
    print("future", future)
    if future["side"] != "frame" or not future["sideImg"]:
        problems.append("future scrub changed the current panel")
    if not future.get("skipped") and "Ahead of now" not in future.get("zoom", ""):
        problems.append("future frame not labeled: " + str(future))

    pg.click("#uvi-zoom button[data-uvi=zoom-close]")
    # existing orchestra sets, and no UVI voice in the mixer
    pg.click("#btn-orch")
    pg.wait_for_selector("#orch .o-name")
    names = pg.eval_on_selector_all("#orch .o-name", "els => els.map(e => e.innerText.split('\\n')[0])")
    print("channels", names)
    for need in ("Kp", "Ap", "F10.7", "Sunspots", "Wind speed", "Density", "Bz", "X-rays", "Schumann"):
        if not any(need in n for n in names):
            problems.append("missing channel " + need)
    if any("UVI" in n or "SMILE" in n for n in names):
        problems.append("UVI was added to the orchestra: " + str(names))
    if len(names) != 9:
        problems.append("channel count " + str(len(names)))

    esa = [u for u in hits if any(h in u for h in ESA)]
    if esa:
        problems.append("page contacted ESA: " + str(esa[:5]))
    if errs:
        problems.append("pageerror: " + str(errs))

    sun = ctx.new_page()
    sun.goto(a.base + "?scene=sun&tour=0&live=0", wait_until="load")
    sun.wait_for_function("() => document.getElementById('badge-mode').innerText && document.getElementById('badge-mode').innerText !== 'loading'")
    sun.wait_for_timeout(2000)
    if "uvi-on" in (sun.evaluate("() => document.body.className") or ""):
        problems.append("UVI panel shown on the Sun")
    sun_read = sun.inner_text("#readout")
    if "F10.7" not in sun_read:
        problems.append("sun readout missing F10.7: " + sun_read)
    shot(sun, "sun-unchanged.png")
    b.close()

if problems:
    print("FAIL")
    for x in problems:
        print(" -", x)
    sys.exit(1)
print("page test ok")
