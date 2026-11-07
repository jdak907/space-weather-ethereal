#!/usr/bin/env python3
"""Offline SMILE UVI QuickLook fetch, plus labeled synthetic frames.

The browser page does not call ESA. This script writes a timestamped catalog
and images into a directory you choose. The default directory is local/uvi/,
which is gitignored. Real QuickLook PNGs must not be committed. The page
stays off until a catalog is loaded. GitHub Pages cannot read the product
endpoint directly: it sends no CORS header for that origin, and OPTIONS
returns 403.

What was confirmed on 2026-11-07 (see docs/smile-uvi.md) is the default, and
every URL and the file format are flags so a change at the archive does not
require editing the page:

  python3 tools/fetch_uvi.py --synthetic --out data/uvi-synthetic --allow-tracked
  python3 tools/fetch_uvi.py --fetch --max-frames 24
  python3 tools/fetch_uvi.py --probe
  python3 tools/fetch_uvi.py --self-test

--fetch refuses --allow-tracked. --probe prints one product's type and size
and does not write a file.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import struct
import subprocess
import sys
import urllib.parse
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_TAP = "https://emds.esac.esa.int/service/tap/sync"
DEFAULT_PRODUCT = "https://emds.esac.esa.int/service/data"
UA = "space-weather-ethereal-uvi-fetch/1 (local; not the public site)"

# 5x7 glyphs. Used only to stamp SYNTHETIC diagrams.
FONT = {
    " ": ["00000"] * 7,
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "S": ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png_encode(w: int, h: int, rgba: bytes) -> bytes:
    if len(rgba) != w * h * 4:
        raise ValueError("rgba size")
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + png_chunk(b"IEND", b"")


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def png_decode_rgba(blob: bytes):
    """Decode a non-interlaced 8-bit RGBA PNG. Returns (w, h, rgba) or raises."""
    if not blob.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a png")
    i, w, h, idat = 8, None, None, []
    while i < len(blob):
        (ln,) = struct.unpack(">I", blob[i:i + 4])
        tag, data = blob[i + 4:i + 8], blob[i + 8:i + 8 + ln]
        i += 12 + ln
        if tag == b"IHDR":
            w, h, bit, color, comp, filt, inter = struct.unpack(">IIBBBBB", data)
            if (bit, color, comp, filt, inter) != (8, 6, 0, 0, 0):
                raise ValueError(f"unsupported png {w}x{h} bit={bit} color={color} interlace={inter}")
        elif tag == b"IDAT":
            idat.append(data)
        elif tag == b"IEND":
            break
    if w is None:
        raise ValueError("missing IHDR")
    raw = zlib.decompress(b"".join(idat))
    bpp, stride = 4, w * 4
    expect = h * (stride + 1)
    if len(raw) < expect:
        raise ValueError("short idat")
    out = bytearray(h * stride)
    p = 0
    for y in range(h):
        f, p = raw[p], p + 1
        row, p = raw[p:p + stride], p + stride
        for x in range(stride):
            left = out[y * stride + x - bpp] if x >= bpp else 0
            up = out[(y - 1) * stride + x] if y else 0
            ul = out[(y - 1) * stride + x - bpp] if y and x >= bpp else 0
            v = row[x]
            if f == 0:
                val = v
            elif f == 1:
                val = (v + left) & 255
            elif f == 2:
                val = (v + up) & 255
            elif f == 3:
                val = (v + ((left + up) // 2)) & 255
            elif f == 4:
                val = (v + paeth(left, up, ul)) & 255
            else:
                raise ValueError("bad filter")
            out[y * stride + x] = val
    return w, h, bytes(out)


def png_thumbnail(blob: bytes, side: int = 128) -> bytes:
    w, h, rgba = png_decode_rgba(blob)
    tw = th = side
    out = bytearray(tw * th * 4)
    for y in range(th):
        sy = min(h - 1, int(y * h / th))
        for x in range(tw):
            sx = min(w - 1, int(x * w / tw))
            s = (sy * w + sx) * 4
            d = (y * tw + x) * 4
            out[d:d + 4] = rgba[s:s + 4]
    return png_encode(tw, th, bytes(out))


def assign_validity(frames, nominal_ms=60_000, max_hold_ms=90_000):
    """Same rule as js/uvi.mjs assignValidity. Keep the two copies in step."""
    ordered = sorted((f for f in frames if isinstance(f.get("obsTime"), (int, float))), key=lambda f: f["obsTime"])
    out = []
    for i, f in enumerate(ordered):
        nxt = ordered[i + 1]["obsTime"] if i + 1 < len(ordered) else None
        gap = (nxt - f["obsTime"]) if nxt is not None else math.inf
        hold = gap if gap <= max_hold_ms else min(nominal_ms, max_hold_ms)
        g = dict(f)
        g["validFrom"] = f["obsTime"]
        g["validTo"] = f["obsTime"] + hold
        out.append(g)
    return out


def blit(buf, w, h, text, x, y, scale, color):
    cx = x
    for ch in text:
        glyph = FONT.get(ch, FONT[" "])
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit != "1":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        px, py = cx + col * scale + dx, y + row * scale + dy
                        if 0 <= px < w and 0 <= py < h:
                            i = (py * w + px) * 4
                            buf[i:i + 4] = color
        cx += 6 * scale


def synthetic_png(index: int, n: int = 8) -> bytes:
    w = h = 256
    buf = bytearray(w * h * 4)
    hue = index / n
    ring = bytes((int(40 + 180 * hue), int(220 - 80 * hue), int(255 - 140 * hue), 255))
    mark = bytes((255, 210, 80, 255))
    fg = bytes((236, 242, 255, 255))
    for y in range(h):
        for x in range(w):
            buf[(y * w + x) * 4:(y * w + x) * 4 + 4] = bytes((7, 10, 18, 255))
    cx = cy = 128
    ang0 = (index / n) * math.tau
    for y in range(h):
        for x in range(w):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            d = (ang - ang0 + math.pi) % math.tau - math.pi
            i = (y * w + x) * 4
            if 78 <= r <= 108:
                buf[i:i + 4] = ring
            if r <= 108 and abs(d) < 0.38 and r > 40:
                buf[i:i + 4] = mark
            if abs(dx) < 1 or abs(dy) < 1:
                if buf[i] < 30:
                    buf[i:i + 4] = bytes((40, 48, 64, 255))
    blit(buf, w, h, "SYNTHETIC", 16, 14, 3, fg)
    blit(buf, w, h, "NOT ESA", 40, 210, 3, mark)
    blit(buf, w, h, f"{index:02d}", 108, 116, 3, fg)
    return png_encode(w, h, bytes(buf))


def synthetic_offsets():
    """60 s frames, a gap, a frame that covers offset 0, and one future frame."""
    slots = [-30 * 60_000 + i * 60_000 for i in range(5)]
    slots += [-11 * 60_000 + i * 60_000 for i in range(12)]
    slots.append(5 * 60_000)
    return slots


def write_synthetic(out: str) -> dict:
    os.makedirs(os.path.join(out, "frames"), exist_ok=True)
    nimg = 8
    for i in range(nimg):
        path = os.path.join(out, "frames", f"syn-{i}.png")
        with open(path, "wb") as f:
            f.write(synthetic_png(i, nimg))
    frames = []
    for k, off in enumerate(synthetic_offsets()):
        frames.append({
            "id": f"syn-{k:02d}",
            "offsetMs": off,
            "obsEndOffsetMs": off + 1000,
            "retrievedOffsetMs": 0,
            "image": f"frames/syn-{k % nimg}.png",
            "synthetic": True,
            "label": "SYNTHETIC placeholder, not ESA data",
        })
    cat = {
        "schema": 1,
        "synthetic": True,
        "anchor": "now",
        "format": "png",
        "endpoint": None,
        "nominalCadenceMs": 60_000,
        "maxHoldMs": 90_000,
        "label": "SYNTHETIC placeholder frames, not ESA SMILE data",
        "publication": "Synthetic diagrams generated in this repository. Not ESA imagery.",
        "frames": frames,
    }
    with open(os.path.join(out, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(cat, f, indent=2)
        f.write("\n")
    return cat


def inside_repo(path: str) -> bool:
    root = os.path.realpath(ROOT)
    return os.path.commonpath([root, os.path.realpath(path)]) == root


def git_ignored(path: str) -> bool:
    r = subprocess.run(["git", "check-ignore", "-q", "--", path], cwd=ROOT)
    return r.returncode == 0


def assert_safe_out(out: str, fetch: bool, allow_tracked: bool):
    if fetch and allow_tracked:
        raise SystemExit("refusing --fetch with --allow-tracked: real QuickLook files stay out of git")
    if not inside_repo(out):
        print(f"note: {out} is outside the repo", file=sys.stderr)
        return
    # Judge the directory, not the QuickLook filename pattern. That pattern
    # matches anywhere, so it must not count as permission to write into the repo.
    catalog = os.path.join(out, "catalog.json")
    ignored = git_ignored(out) or git_ignored(catalog)
    if fetch:
        if not ignored:
            raise SystemExit(f"refusing --fetch into {out}: catalog.json is not gitignored")
        return
    if allow_tracked or ignored:
        return
    raise SystemExit(f"refusing to write {out}: it is inside the repo and not gitignored. Use local/uvi/ or pass --allow-tracked for synthetic frames only.")


def http_json(url: str, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def http_bytes(url: str, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/png,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.headers, r.read()


def tap_query(tap: str, query: str):
    url = tap + "?" + urllib.parse.urlencode({
        "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "json", "MAXREC": "10000", "QUERY": query,
    })
    data = http_json(url)
    cols = [c["name"] for c in data["metadata"]]
    return [dict(zip(cols, row)) for row in data["data"]]


def product_url(product: str, item_id: str, fmt: str) -> str:
    query = f"SELECT filename, filepath FROM smile.v_ql_data_file_latest WHERE ql_data_item_id='{item_id}'"
    return product + "?" + urllib.parse.urlencode({
        "retrieval_type": "PRODUCT", "QUERY": query, "TAPCLIENT": "space-weather-ethereal", "FORMAT": fmt.upper(),
    })


def parse_utc(s: str) -> int:
    s = s.strip().replace("Z", "")
    if " " in s:
        s = s.replace(" ", "T")
    if "." in s:
        head, frac = s.split(".", 1)
        digits = "".join(ch for ch in frac if ch.isdigit())
        s = head + "." + (digits + "000000")[:6]
    when = dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc)
    return int(when.timestamp() * 1000)


def iso(ms: int) -> str:
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def fetch_catalog(args) -> dict:
    where = "instrument_name='UVI' AND descriptor='AURORA'"
    if args.since:
        where += f" AND begin_time>='{args.since}'"
    q = (
        "SELECT TOP {n} ql_data_item_id, filename, filepath, filesize, begin_time, end_time, "
        "ingestion_date, item_version, product_id FROM smile.v_ql_data_file_latest "
        "WHERE {where} ORDER BY begin_time DESC"
    ).format(n=int(args.max_frames), where=where)
    if args.dry_run:
        print(q)
        print(product_url(args.product, "SMILE_UVI_QL_AURORA_EXAMPLE", args.format))
        return {"dryRun": True}
    rows = tap_query(args.tap, q)
    rows.sort(key=lambda r: r["begin_time"])
    frame_dir = os.path.join(args.out, "frames")
    thumb_dir = os.path.join(args.out, "thumbs")
    os.makedirs(frame_dir, exist_ok=True)
    os.makedirs(thumb_dir, exist_ok=True)
    frames = []
    for row in rows:
        name = row["filename"]
        if "SMILE_UVI" not in name or not name.lower().endswith(".png"):
            print("skip unexpected filename", name, file=sys.stderr)
            continue
        dest = os.path.join(frame_dir, os.path.basename(name))
        headers, blob = http_bytes(product_url(args.product, row["ql_data_item_id"], args.format))
        ctype = headers.get("Content-Type", "")
        if "png" not in ctype.lower() and not blob.startswith(b"\x89PNG"):
            raise SystemExit(f"expected a PNG for {name}, got {ctype}")
        with open(dest, "wb") as f:
            f.write(blob)
        image = "frames/" + os.path.basename(name)
        try:
            thumb = png_thumbnail(blob, 128)
            tname = os.path.splitext(os.path.basename(name))[0] + ".png"
            with open(os.path.join(thumb_dir, tname), "wb") as f:
                f.write(thumb)
            image = "thumbs/" + tname
        except Exception as e:
            print("thumbnail skipped:", name, e, file=sys.stderr)
        obs = parse_utc(row["begin_time"])
        frames.append({
            "id": row["ql_data_item_id"],
            "filename": name,
            "obsTime": iso(obs),
            "obsEndMeta": iso(parse_utc(row["end_time"])),
            "retrievedAt": iso(parse_utc(row["ingestion_date"])),
            "image": image,
            "full": "frames/" + os.path.basename(name),
            "synthetic": False,
            "label": "ESA/CAS SMILE UVI QuickLook, preliminary, uncalibrated.",
            "productId": row.get("product_id"),
            "itemVersion": row.get("item_version"),
            "bytes": len(blob),
        })
    stamped = []
    for f in frames:
        g = dict(f)
        g["obsTime"] = parse_utc(f["obsTime"])
        stamped.append(g)
    valid = {g["id"]: g for g in assign_validity(stamped, args.nominal_cadence_ms, args.max_hold_ms)}
    for f in frames:
        f["validFrom"] = iso(valid[f["id"]]["validFrom"])
        f["validTo"] = iso(valid[f["id"]]["validTo"])
    cat = {
        "schema": 1,
        "synthetic": False,
        "format": args.format,
        "endpoint": args.tap,
        "productEndpoint": args.product,
        "nominalCadenceMs": args.nominal_cadence_ms,
        "maxHoldMs": args.max_hold_ms,
        "generatedUtc": iso(int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)),
        "label": "Local SMILE UVI QuickLook catalog. Preliminary and uncalibrated.",
        "publication": "Local QuickLook catalog. Preliminary and uncalibrated. Do not commit these image files.",
        "frames": frames,
    }
    with open(os.path.join(args.out, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(cat, f, indent=2)
        f.write("\n")
    print(f"wrote {len(frames)} frames to {args.out}")
    return cat


def probe(args):
    rows = tap_query(args.tap, (
        "SELECT TOP 1 ql_data_item_id, filename, filesize, begin_time, end_time, ingestion_date "
        "FROM smile.v_ql_data_file_latest WHERE instrument_name='UVI' AND descriptor='AURORA' "
        "ORDER BY begin_time DESC"
    ))
    if not rows:
        print("no UVI QuickLook rows")
        return 1
    row = rows[0]
    url = product_url(args.product, row["ql_data_item_id"], args.format)
    headers, blob = http_bytes(url)
    info = {"row": row, "contentType": headers.get("Content-Type"), "bytes": len(blob), "cors": headers.get("Access-Control-Allow-Origin")}
    try:
        w, h, _ = png_decode_rgba(blob)
        info["png"] = {"w": w, "h": h}
    except Exception as e:
        info["png"] = str(e)
    print(json.dumps(info, indent=2))
    return 0


def self_test() -> int:
    # 30 s and 60 s holds follow the next frame. A 114 s hole keeps 60 s, then a gap.
    base = 1_700_000_000_000
    frames = [{"id": str(i), "obsTime": base + t} for i, t in enumerate([0, 30_000, 90_000, 204_000])]
    got = assign_validity(frames, 60_000, 90_000)
    holds = [g["validTo"] - g["validFrom"] for g in got]
    if holds != [30_000, 60_000, 60_000, 60_000]:
        raise SystemExit(f"validity holds {holds}")
    # gap: 90_000+60_000 = 150_000 is inside neither frame (next starts 204_000)
    if any(g["validFrom"] <= base + 150_000 < g["validTo"] for g in got):
        raise SystemExit("gap was bridged")
    blob = synthetic_png(1)
    w, h, rgba = png_decode_rgba(blob)
    if (w, h) != (256, 256) or len(rgba) != 256 * 256 * 4:
        raise SystemExit("synthetic png decode failed")
    thumb = png_thumbnail(blob, 32)
    tw, th, _ = png_decode_rgba(thumb)
    if (tw, th) != (32, 32):
        raise SystemExit("thumbnail size")
    offs = synthetic_offsets()
    if 0 not in offs or 5 * 60_000 not in offs:
        raise SystemExit("synthetic timeline missing now or future")
    # the hole between -26 min and -11 min is wider than max hold
    if -18 * 60_000 not in range(offs[4] + 60_000, offs[5]):
        # offs[4] is -26 min, offs[5] is -11 min
        pass
    if offs[5] - (offs[4] + 60_000) < 90_000:
        raise SystemExit("synthetic gap is too short")
    text = open(os.path.join(ROOT, ".gitignore"), encoding="utf-8").read()
    if "local/uvi/" not in text or "SMILE_UVI_QL" not in text:
        raise SystemExit("gitignore is missing the UVI rules")

    def refused(fn, needle):
        try:
            fn()
        except SystemExit as e:
            if needle not in str(e):
                raise SystemExit(f"expected refusal {needle!r}, got {e}")
        else:
            raise SystemExit(f"expected refusal {needle!r}")

    refused(lambda: assert_safe_out(os.path.join(ROOT, "data", "not-ignored"), True, False), "refusing --fetch")
    refused(lambda: assert_safe_out(os.path.join(ROOT, "data", "uvi-synthetic"), False, False), "not gitignored")
    assert_safe_out(os.path.join(ROOT, "local", "uvi"), True, False)
    assert_safe_out(os.path.join(ROOT, "data", "uvi-synthetic"), False, True)
    print("uvi self-test ok")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Fetch SMILE UVI QuickLook products into a local, gitignored catalog.")
    p.add_argument("--synthetic", action="store_true", help="write labeled synthetic frames (no ESA contact)")
    p.add_argument("--fetch", action="store_true", help="download real QuickLook products from ESA")
    p.add_argument("--probe", action="store_true", help="print one product's format; write nothing")
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--out", default=os.path.join(ROOT, "local", "uvi"))
    p.add_argument("--allow-tracked", action="store_true", help="allow --synthetic to write inside the repo")
    p.add_argument("--max-frames", type=int, default=24)
    p.add_argument("--since", default="", help="UTC begin_time lower bound, archive format, optional")
    p.add_argument("--tap", default=DEFAULT_TAP)
    p.add_argument("--product", default=DEFAULT_PRODUCT)
    p.add_argument("--format", default="png")
    p.add_argument("--nominal-cadence-ms", type=int, default=60_000)
    p.add_argument("--max-hold-ms", type=int, default=90_000)
    a = p.parse_args(argv)
    if a.self_test:
        return self_test()
    if a.probe:
        return probe(a)
    if a.synthetic and a.fetch:
        raise SystemExit("choose one of --synthetic or --fetch")
    if not a.synthetic and not a.fetch:
        p.print_help()
        return 2
    assert_safe_out(a.out, a.fetch, a.allow_tracked)
    if a.synthetic:
        cat = write_synthetic(a.out)
        print(f"wrote {len(cat['frames'])} synthetic frames to {a.out}")
        return 0
    fetch_catalog(a)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
