# SMILE UVI QuickLook access

Checked 2026-11-07, anonymous, with no ESA login. This is a record of what the archive returned that day. It is not a promise that the service stays the same. The loader treats the format and the endpoints as configuration (`tools/fetch_uvi.py --tap --product --format`).

The page at the repository root does not call these hosts. Real files go to `local/uvi/`, which is gitignored.

## Data policy

ESA's SMILE data policy (KX-05-GZ-YJ-01, 21/03/2022) is on https://www.cosmos.esa.int/web/smile/archive.

QuickLook products checked here are preliminary and uncalibrated. Cite:

- Wang, C., Branduardi-Raymont, G., Escoubet, C.P. et al. Solar Wind Magnetosphere Ionosphere Link Explorer (SMILE): Science and Mission Overview. Space Sci Rev 221, 9 (2025). https://doi.org/10.1007/s11214-024-01126-6
- Zhang, XX., Wang, YM., He, F. et al. Ultraviolet Imager (UVI) for the SMILE Mission. Space Sci Rev 221, 31 (2025). https://doi.org/10.1007/s11214-025-01160-y

The HelioPhysics Archive says these QuickLook plots have not been verified by the Principal Investigators.

## What answered

| Item | Result |
|---|---|
| TAP | `https://emds.esac.esa.int/service/tap/sync`, ADQL, `FORMAT=json`. HTTP 200, no login. |
| QuickLook view | `smile.v_ql_data_file` and `smile.v_ql_data_file_latest`. |
| UVI rows | 60,820 with `instrument_name='UVI'` and `descriptor='AURORA'`, level `QL`. Versions in the full view: V01 60,340, V02 480. |
| Science view | `smile.v_data_file` grouped by instrument and level returned only `GSS` / `AUX` (1,788). No public UVI CDF in that view. |
| Filename | `SMILE_UVI_QL_AURORA_20261104T110508_V01.png` |
| Server path | `/smile/smileps/SMILE/quicklook/2026/11` (not an HTTP path) |
| Product id | `SMILE_GSS_L0d_UVI-SCI-FRAME_20261104T11_V01` (hourly L0d parent) |
| Item id | `SMILE_UVI_QL_AURORA_20261104T110508` |
| Download | `GET https://emds.esac.esa.int/service/data?retrieval_type=PRODUCT&QUERY=SELECT filename, filepath FROM smile.v_ql_data_file_latest WHERE ql_data_item_id='<id>'&FORMAT=PNG` |
| Body | `Content-Type: image/png`, 320,488 bytes, PNG 512×512, 8-bit RGBA (color type 6), not interlaced. |
| CORS | No `Access-Control-Allow-Origin` on that GET for `Origin: https://jdak907.github.io`. `OPTIONS` on `/service/data` returned 403. |
| Script on Cosmos | The public TAP example linked from https://www.cosmos.esa.int/web/smile/programmatic-access redirects (302) to a Cosmos login. TAP itself did not. |
| HPA | https://hpa.esa.int/hpa/ sets `showSMILEData = true` and builds the same `emds` product URL. The EMDS landing page still says "HPA access coming soon" for Smile. |

Columns used on `smile.v_ql_data_file`: `ql_data_item_id`, `filename`, `filepath`, `filesize`, `begin_time`, `end_time`, `ingestion_date`, `instrument_name`, `descriptor`, `item_version`, `product_id`, `processing_level_name`.

## Time

`begin_time` matches the timestamp in the filename. On every file in the days that were fully read (2026-09-26, 2026-10-10, 2026-11-03, 2026-11-04), `end_time` is `begin_time` plus 1.0 second. That is not the gap to the next file.

Inter-frame spacing of `begin_time`, from `smile.v_ql_data_file_latest`:

| Day (UTC) | Frames | Typical spacing | Ingest delay (observation to `ingestion_date`) |
|---|---|---|---|
| 2026-09-26 | 2,880 | 30 s (2,877 of 2,879 steps) | about 736–760 h (bulk load, not operational) |
| 2026-10-10 | 295 | 60 s, plus one 776 s hole | about 420–425 h (same bulk load) |
| 2026-11-03 | 1,852 | mixed: 1,022 steps at 60 s, 826 at 30 s, one 114 s step | about 23.6–47.5 h |
| 2026-11-04 | 631, last at 11:05:08Z | mostly 60 s; 13 holes of 162–789 s | about 12.5–23.6 h |

Daily counts from 2026-09-23 through 2026-11-04 run from 111 to 2,880. 2026-11-05, 2026-11-06, and 2026-11-07 had zero rows at about 00:17 UTC on 2026-11-07. First `begin_time` in the view: 2026-09-23T00:00:10Z.

The panel stores `begin_time` as the observation, `ingestion_date` as the retrieval time, and `end_time` as metadata only. The display window is the gap to the next frame when that gap is at most `maxHoldMs` (default 90 s). Otherwise the frame lasts `nominalCadenceMs` (default 60 s) and the rest is "no SMILE coverage".

## Not confirmed

- Whether the 1.0 s `end_time` is the exposure, a timestamp quantisation, or a placeholder. The instrument paper's default cadence is one minute (30 s in storms), from coadded 2–5 s frames. That was not re-measured from pixels or from a CDF.
- A single delay from observation to public QuickLook. The newest product was about 12.5 h old when it was ingested, and the view then had nothing newer for more than two days.
- What the PNG shows (labels, color bar, raw counts). The file was not opened as a picture.
- Login-only products, what V02 replaces, and whether the download URL stays stable.
- CORS for any origin other than `https://jdak907.github.io`.
- Calibrated L2 map-projected CDF products. They were not in the public science-file view. The proprietary period in the data policy is one year.

## Literature, separate from the archive check

Zhang et al. 2025: N₂ LBH about 160–180 nm, 512×512 detector, default one-minute images (30 s in storms), auroral viewing once the spacecraft is above about 50,000 km, for more than 40 hours of a roughly 50-hour orbit, with science downlink near perigee. QuickLook images are made from L0, before the calibrations that produce L1. The paper says science products are stored as CDF and points to a user manual that would accompany the scientific release. The public QuickLook files checked here are PNG, not CDF.
