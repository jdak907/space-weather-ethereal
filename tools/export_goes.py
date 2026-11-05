#!/usr/bin/env python3
"""Add a NOAA GOES snapshot to data.json for the Schumann model's space weather adjustment:
  xr  = GOES X-ray flux, 0.1-0.8 nm (W/m^2), 10-minute maxima, last 7 days
  p10 = GOES integral protons >= 10 MeV (pfu), 10-minute maxima, last 7 days
Source: NOAA SWPC (US Government, public domain), services.swpc.noaa.gov/json/goes/primary/.
Usage: python3 tools/export_goes.py   (run after tools/export_data.py, which rewrites data.json)
"""
import datetime as dt, json, os, urllib.request
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://services.swpc.noaa.gov/json/goes/primary/"
STEP = 600

def get(name):
    with urllib.request.urlopen(urllib.request.Request(BASE + name, headers={"User-Agent": "space-weather-ethereal"}), timeout=60) as r:
        return json.load(r)

def binned(rows, keep):
    b = {}
    for r in rows:
        if not keep(r) or r.get("flux") is None: continue
        t = int(dt.datetime.strptime(r["time_tag"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()) // STEP * STEP
        b[t] = max(b.get(t, 0), float(r["flux"]))
    t0, t1 = min(b), max(b)
    v = [b.get(t, -999) for t in range(t0, t1 + STEP, STEP)]
    return {"start": dt.datetime.fromtimestamp(t0, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "stepH": STEP / 3600,
            "v": [x if x == -999 else float("%.4g" % x) for x in v]}

path = os.path.join(APP, "data.json")
d = json.load(open(path))
d["goes"] = {
    "xr": binned(get("xrays-7-day.json"), lambda r: r.get("energy") == "0.1-0.8nm"),
    "p10": binned(get("integral-protons-7-day.json"), lambda r: r.get("energy") == ">=10 MeV"),
    "generatedUtc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
d.setdefault("meta", {}).setdefault("sources", {})["goes"] = "NOAA SWPC GOES primary: X-ray 0.1-0.8 nm and >=10 MeV integral protons, 10-min maxima, last 7 days"
json.dump(d, open(path, "w"), separators=(",", ":"))
print("goes snapshot:", len(d["goes"]["xr"]["v"]), "x-ray bins,", len(d["goes"]["p10"]["v"]), "proton bins")
