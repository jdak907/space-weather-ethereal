#!/usr/bin/env python3
"""Export the Space Weather Sonifier data snapshot for the Space Weather Ethereal web app.

Reuses the output of the sonifier's refresh script (refresh.py), which pulls
NOAA SWPC (Kp 7-day, real-time solar wind + IMF) and GFZ Potsdam (Kp history, Ap,
F10.7 observed, sunspot number) and writes data.json.

Usage:
  python3 tools/export_data.py                 # copy the existing refresh.py output
  python3 tools/export_data.py --refresh       # run refresh.py first, then export
  python3 tools/export_data.py --src other/data.json

Writes ./data.json (next to index.html). Missing readings stay as -999.
No values are invented: this only copies and adds metadata.
"""
import argparse, datetime as dt, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
DEFAULT_SRC = "/workspace/spacewx/data.json"
REFRESH = "/workspace/spacewx/refresh.py"

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=DEFAULT_SRC, help="refresh.py output (data.json)")
    ap.add_argument("--refresh", action="store_true", help="run refresh.py first")
    ap.add_argument("--out", default=os.path.join(APP, "data.json"))
    a = ap.parse_args()
    if a.refresh:
        subprocess.run([sys.executable, REFRESH], check=True)
    d = json.load(open(a.src))
    for k in ("asOf", "kp", "ap", "f107", "sn", "sw"):
        if k not in d:
            sys.exit(f"source is missing '{k}'")
    mtime = dt.datetime.fromtimestamp(os.path.getmtime(a.src), dt.timezone.utc)
    d["meta"] = {
        "generatedUtc": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "missing": -999,
        "sources": {
            "kp": "GFZ Potsdam Kp (history) + NOAA SWPC planetary K-index (last 7 days), 3-hourly",
            "ap": "GFZ Potsdam Ap, daily",
            "f107": "GFZ Potsdam F10.7 observed (Fobs, Penticton/DRAO), daily, sfu",
            "sn": "GFZ Potsdam international sunspot number (SILSO), daily",
            "sw": "NOAA SWPC real-time solar wind (RTSW) 1-min data, active L1 spacecraft, 10-min means, last 24 h",
        },
    }
    json.dump(d, open(a.out, "w"), separators=(",", ":"))
    print("wrote", a.out, "| snapshot as of", d["asOf"], "| generated", d["meta"]["generatedUtc"])

if __name__ == "__main__":
    main()
