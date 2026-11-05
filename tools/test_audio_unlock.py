#!/usr/bin/env python3
"""Checks the mobile audio unlock path in headless Chromium with iPhone emulation and mocks for the
WebKit-only APIs (navigator.audioSession, AirPlay availability/picker). Real iOS behavior (silent
switch, AirPlay routing) can only be confirmed on a device.
  python3 tools/test_audio_unlock.py [--base http://localhost:8931/]"""
import argparse, json, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument("--base", default="http://localhost:8931/"); a = ap.parse_args()
args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
MOCK_SESSION = "Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });"
MOCK_AIRPLAY = """window.WebKitPlaybackTargetAvailabilityEvent = function () {};
  window.__picker = 0; HTMLMediaElement.prototype.webkitShowPlaybackTargetPicker = function () { window.__picker++; window.__pickerEl = this.id; };"""
ST = "() => window.__spacewx.orch.audioStatus()"
fails, out = [], {}
def check(name, cond, info=None):
    if not cond: fails.append(name + (': ' + json.dumps(info) if info is not None else ''))
with sync_playwright() as p:
    b = p.chromium.launch(args=args)
    iphone = dict(p.devices["iPhone 13"]); iphone.pop("default_browser_type", None)
    def page(init):
        ctx = b.new_context(**iphone); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for s in init: pg.add_init_script(s)
        pg.goto(a.base + "?scene=sun&tour=0&live=0", wait_until="load")
        pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(1)
        return ctx, pg, errs

    # 1) iOS 17+: audioSession becomes 'playback' inside the Sound tap; context runs; direct route
    ctx, pg, errs = page([MOCK_SESSION, MOCK_AIRPLAY])
    check("no AirPlay button before availability", pg.evaluate("() => document.getElementById('btn-airplay').hidden"))
    before = pg.evaluate("() => navigator.audioSession.type")
    pg.tap("#btn-sound"); time.sleep(1.5)
    s1 = pg.evaluate(ST); out["session"] = {"before": before, **s1}
    check("audioSession set to playback", s1["session"] == "playback", s1)
    check("context running after tap", s1["ctx"] == "running", s1)
    check("direct route by default", s1["route"] == "direct", s1)
    check("buffer kick played in gesture", (s1.get("bufferKick") or 0) >= 1, s1)
    check("no silent loop when audioSession exists", s1["silentLoop"] == "off", s1)
    # 2) interruption / background: resume on visibilitychange
    pg.evaluate("() => window.__spacewx.orch.rig.ctx.suspend()"); time.sleep(0.5)
    pg.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(0.8)
    s2 = pg.evaluate(ST); out["resume"] = s2
    check("resumed after suspend + visibilitychange", s2["ctx"] == "running", s2)
    # 3) AirPlay available -> button shows -> tap moves the mix onto the <audio> element and opens the picker
    pg.evaluate("""() => { const e = new Event('webkitplaybacktargetavailabilitychanged'); e.availability = 'available'; document.getElementById('swe-out').dispatchEvent(e); }""")
    vis = pg.evaluate("() => !document.getElementById('btn-airplay').hidden")
    check("AirPlay button shown when a target is available", vis)
    pg.evaluate("() => window.__spacewx.orch.setOutput('hrtf')")
    pg.tap("#btn-airplay"); time.sleep(1.2)
    s3 = pg.evaluate(ST); out["airplay"] = {**s3, "picker": pg.evaluate("() => [window.__picker, window.__pickerEl]"), "spatial": pg.evaluate("() => window.__spacewx.orch.outputInfo()")}
    check("route switched to media element", s3["route"] == "element", s3)
    check("element is playing a MediaStream", s3["element"] and s3["element"]["hasStream"] and not s3["element"]["paused"], s3)
    check("element allows AirPlay and plays inline", s3["element"] and s3["element"]["airplay"] == "allow" and s3["element"]["playsinline"], s3)
    check("picker opened on the output element", out["airplay"]["picker"] == [1, "swe-out"], out["airplay"]["picker"])
    check("media route stays stereo-capable (HRTF ok, maxCh 2)", out["airplay"]["spatial"]["maxCh"] == 2 and out["airplay"]["spatial"]["mode"] == "hrtf", out["airplay"]["spatial"])
    ms = pg.evaluate("() => navigator.mediaSession && navigator.mediaSession.metadata ? { title: navigator.mediaSession.metadata.title, artist: navigator.mediaSession.metadata.artist, state: navigator.mediaSession.playbackState } : null")
    out["mediaSession"] = ms
    check("media session metadata", ms and ms["title"] == "Space Weather Ethereal", ms)
    # back to direct
    pg.evaluate("() => window.__spacewx.orch.setRoute('direct')"); time.sleep(0.3)
    check("back to direct route", pg.evaluate(ST)["route"] == "direct")
    pg.evaluate("() => localStorage.removeItem('swe.route'); localStorage.removeItem('swe.out')")
    out["errors1"] = errs; check("no page errors (iOS 17 mock)", not errs, errs); ctx.close()

    # 4) older iOS (no audioSession): the silent looping <audio> starts inside the tap
    ctx, pg, errs = page([])
    pg.tap("#btn-sound"); time.sleep(1.5)
    s4 = pg.evaluate(ST); out["oldIOS"] = s4
    check("silent loop started (no audioSession)", s4["silentLoop"] in ("playing", "starting"), s4)
    check("silent element is inline + looping", pg.evaluate("() => { const e = document.getElementById('swe-silent'); return !!e && e.loop && e.hasAttribute('playsinline') && !e.paused }"), None)
    check("context running (old iOS path)", s4["ctx"] == "running", s4)
    out["errors2"] = errs; check("no page errors (old iOS)", not errs, errs); ctx.close()

    # 5) desktop Chrome: nothing iOS-specific runs
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    pg.goto(a.base + "?scene=sun&tour=0&live=0"); pg.wait_for_function("() => window.__spacewx && window.__spacewx.orch.S", timeout=40000); time.sleep(1)
    pg.click("#btn-sound"); time.sleep(1.2)
    s5 = pg.evaluate(ST); out["desktop"] = s5
    check("desktop: direct route, no silent loop", s5["route"] == "direct" and s5["silentLoop"] == "off" and s5["ctx"] == "running", s5)
    check("desktop: no AirPlay button", pg.evaluate("() => document.getElementById('btn-airplay').hidden"))
    ctx.close(); b.close()
print(json.dumps(out, indent=1))
print("FAILS:" if fails else "ALL AUDIO UNLOCK CHECKS PASSED", *fails, sep="\n  ")
sys.exit(1 if fails else 0)
