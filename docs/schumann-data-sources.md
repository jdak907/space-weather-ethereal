# Schumann resonance data sources (for Space Weather Ethereal)

Researched Nov 4, 2026 (PT). Items marked [VERIFY] need checking before anything relies on them.

## The short answer

There is no open, live, numeric Schumann resonance feed that a public web page can call directly.
Every live source I found posts pictures (spectrograms). The numeric data that *is* open is
archival: a few years of research data on Zenodo and university repositories. So the visualizer
uses a clearly labeled **model**: lightning by time of day plus a small space weather effect
driven by live NOAA GOES X-ray and proton data. The NOAA data is open and allows browser access.

## Station by station

| Source | Numbers or just pictures? | Format | Update rate | License / terms | Browser access (CORS) | URL |
|---|---|---|---|---|---|---|
| **Tomsk State University, Space Observing System** (Russia) | Mostly pictures. A 3-day spectrogram (0 to 40 Hz). The site also describes daily `.afq` files with amplitude, frequency and Q for modes 1 to 4, which would be numeric. | Spectrogram image; `.afq` daily table [VERIFY: whether the `.afq` files are public and downloadable] | Spectrogram about every 20 to 30 min (per a third-party site) [VERIFY] | No license or reuse terms found [VERIFY] | Not tested. The site timed out from my computer twice. | https://sos70.ru (the old sosrff.tsu.ru now points there; the old `sosrff.tsu.ru/new/shm.jpg` image froze on Sep 1, 2025, per ressonanciaschumannhoje.com [VERIFY]) |
| **HeartMath Global Coherence Initiative (GCMS)** | Pictures for the public: daily spectrograms (1 to 50 Hz) and an hourly "24-hour total power" chart (0.32 to 36 Hz). No public API. | Images; an interactive chart that loads its data from an undocumented internal endpoint | Hourly (power chart), daily (spectrograms) | HeartMath says it supplies data "for scientific exploration" and for subscribing sites; no open license found [VERIFY]. Using the chart's hidden data feed from another site would not be a sanctioned use. | Not offered | https://nocc.heartmath.org/spectrogram/index.php · https://nocc.heartmath.org/power_levels/public/charts/power_levels.html · https://www.heartmath.org/gci/gcms/ |
| HeartMath raw data, Lithuania 2016 to 2017 (released by a partner university, with HeartMath's permission) | **Numbers** (archive) | MATLAB `.mat`, raw time series about 130 Hz, East-West only | Static archive | Zenodo record (check the record's license) [VERIFY] | Zenodo files download, but this is raw data, not a feed | https://doi.org/10.5281/zenodo.3739547 |
| **Hylaty ELF station** (Poland, Jagiellonian University) | Live data: none public. Raw data "available for scientific purposes upon request." Two open samples: Jan 15, 2022 (CC0) and September 2023. | Text files of raw 3 kHz samples, 5 minutes per file | Static archives | Jan 15, 2022 set is **CC0**; September 2023 set license [VERIFY] | Repository downloads, not a live feed | https://www.oa.uj.edu.pl/elf/index/data4.htm · https://doi.org/10.57903/UJ/NSRSLE · https://doi.org/10.57903/uj/logpp8 |
| **Nagycenk, Széchenyi István Geophysical Observatory** (Hungary) | Long records since 1993 (electric) and 1997 (magnetic). Hourly mode frequencies and amplitudes have been available **on request** (G. Sátori). There's an "automatic display" of ELF measurements (pictures) [VERIFY]. | On request | Not public live | On request | No | https://gor.epss.hu/issues/GOR2002-2004.6/ · https://doi.org/10.55855/gor2020.5 |
| **Moshiri, Japan** (Nagoya University ISEE) | **Numbers** (archive): calibrated VLF/ELF magnetic field data, 40 kHz sampling | CDF files via ERG Science Center | Archive (not real time) [VERIFY latency] | ISEE data policy applies (usually free for research with acknowledgement) [VERIFY] | No feed for browsers | https://www.isee.nagoya-u.ac.jp/doi/10.34515/DATA_GND-0032-0002-0201_v01.html · https://stdb2.isee.nagoya-u.ac.jp/vlf/vlf_stations.html |
| **Sierra Nevada ELF station** (Spain, University of Granada) | **Numbers** (best open archive). Raw hourly time series (Zenodo) plus processed Schumann parameters every 10 minutes for modes 1 to 3: peak amplitude, frequency, width, and the power integral. Mar 2013 to Feb 2017. | Raw: binary hourly files (about 2.6 GB per month). Processed: NumPy `.npz`, one per month and sensor (about 43 MB each). Python processing code published. | Static archive | Processed data: **CC BY-NC-ND 3.0** (non-commercial, no derivatives, so publishing derived values on the site is doubtful) [VERIFY]. Raw Zenodo data: check each record's license [VERIFY]. | Zenodo/Digibug downloads, not a live feed | https://zenodo.org/records/6348691 (2014), 10.5281/zenodo.6348773 (2015), 10.5281/zenodo.6348838 (2016), 10.5281/zenodo.6348929 (2013 and 2017) · https://digibug.ugr.es/handle/10481/71563 · paper: https://www.sciencedirect.com/science/article/pii/S0098300422001030 |
| **Mitzpe Ramon** (Israel, Tel Aviv University, C. Price) | Records 1998 to 2015 (HEW, HNS, Ez) in `.txt`/`.tdms`. No public download found. | On request | Not live | On request | No | https://www.atmospheric-electricity-net.eu/sites/default/files/2020-01/STSM_CA15211_Bozoki_to_Tel_Aviv_Univ_IL.pdf |
| **Cumiana** (Italy, Renato Romero, vlf.it) | Pictures. Electric-field spectrogram 1 to 105 Hz (last 8 h) and a trace plot that includes the 2nd Schumann mode frequency. The magnetic station was shut down in 2024 (solar-farm interference). | Images | Every 30 min | Hobby station. A third-party site says it reuses the image "non-commercially with credit as its terms allow" [VERIFY the actual terms on vlf.it] | Images can be linked, not read as numbers | http://www.vlf.it/cumiana/livedata.html |
| Zenodo / PANGAEA in general | Zenodo has the Sierra Nevada, Lithuania and similar archives. I found no Schumann series on PANGAEA [VERIFY]. | Various | Static | Per record | Zenodo files download, not a feed | https://zenodo.org |
| Open spectrogram APIs | None found. Sites that show live "Schumann numbers" (for example ressonanciaschumannhoje.com) say they read colors off the Tomsk picture. That is uncalibrated and not an official measurement. | n/a | n/a | n/a | n/a | https://ressonanciaschumannhoje.com/en/methodology |
| **INTERMAGNET** (geomagnetic observatories) | Numbers, but **too slow for Schumann**. Its fastest standard product is 1 sample per second. The highest frequency you can see in 1-second data is 0.5 Hz (the Nyquist limit), and the anti-alias filter removes everything above about 0.2 Hz. The first Schumann mode is 7.8 Hz, about 16 times above that limit. | IAGA-2002, CDF | 1 s and 1 min | INTERMAGNET terms | n/a | https://tech-man.intermagnet.org/stable/chapters/onesecondimos/samplingfiltering.html |

## Lightning: the engine behind it, and possible stand-ins

Schumann intensity follows global lightning, so lightning data can stand in for it.

- **Blitzortung.org**: volunteer network. There's no public API. Raw data only goes to participants or approved projects, which must be non-commercial, credit the source, and use their own data server. Live websocket use from high-traffic sites is not allowed. **Not usable for a public GitHub Pages site without their permission.** https://www.blitzortung.org/en/contact.php
- **WWLLN** (World Wide Lightning Location Network, University of Washington): live data is licensed (paid or research agreements). Its climatologies are free for **non-commercial research** use with citation. https://wwlln.net/climate/ [VERIFY whether a public art/education page counts]
- **Vaisala GLD360**: commercial and restricted. Not usable.
- **NASA LIS/OTD lightning climatology** (satellite, 1995 to 2015): **no use restrictions**. It includes a 2.5° diurnal climatology: flash rate by hour of day on a 144 × 72 grid. This is the best legal basis for a modeled stand-in. Credit the NASA LIS/OTD Science Team and GHRC. https://ghrc.nsstc.nasa.gov/uso/ds_docs/lis_climatology/lolrdc_dataset.html

**The daily "three chimneys" pattern:** most of Earth's lightning happens over tropical land in the
late afternoon, local time. As Earth turns, the global total peaks three times a day (UTC):
Southeast Asia and the Maritime Continent around 08 to 09 UTC, Africa around 14 to 15 UTC (usually
the strongest), and the Americas around 20 to 21 UTC. The exact timing and heights depend on the
station, the sensor direction, and the season. The related Carnegie curve (the global fair-weather
electric field) peaks near 19 UTC. Sources: Price 2016, *Atmosphere* 7(9):116
(https://www.mdpi.com/2073-4433/7/9/116); Bozóki PhD thesis, doi:10.14232/phd.11320; Harrison 2013,
the Carnegie Curve, *Surveys in Geophysics* (https://link.springer.com/article/10.1007/s10712-012-9210-2).

## How Schumann resonance reacts to space weather

The cavity's "ceiling" is the bottom of the ionosphere, roughly 60 to 90 km up. Anything that
changes the ionization there moves the resonance slightly.

- **Solar X-ray flares** add ionization high in the D region (about 70 to 80 km). The **first mode's frequency rises about 0.2 Hz** for as long as the X-ray burst lasts, and the second mode rises about 0.3 to 0.4 Hz. Roldugin et al. 2004, *JGR* 109, A01216, doi:10.1029/2003JA010019 (https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2003JA010019). See also Dyrda et al. 2015 and Sátori et al. 2016, *Radio Science*, doi:10.1029/2018RS006554 [VERIFY exact authors and year for the 2018RS006554 paper].
- **Solar proton events** push ionization lower (about 40 to 50 km), and the **first mode's frequency drops about 0.15 to 0.4 Hz**. Roldugin et al. 2001, *JGR*, doi:10.1029/2000JA900118, and Roldugin et al. 2003 (14 July 2000 event), doi:10.1029/2002JA009495.
- **The 11-year solar cycle** in X-rays shifts frequencies and Q-factors slowly. Sátori et al. 2005, *JASTP*, doi:10.1016/j.jastp.2004.12.006.
- **Geomagnetic storms** affect it less clearly. At Sierra Nevada during the St. Patrick's Day storms (2013 and 2015), Salinas et al. 2016 (*JGR Space Physics*, doi:10.1002/2016JA023253) saw changes in peak amplitudes and frequencies, but cautioned that lightning and interference make it hard to pin the cause on the storm. A Mexican station study found higher amplitudes on disturbed days, with the same caution (https://www.sciencedirect.com/science/article/abs/pii/S1364682618306916). Overall: small, uncertain effects. **Damping** (Q-factor, about 4 to 6 for the cavity) can also change when the lower ionosphere is disturbed.
- The mode frequencies are about **7.8, 14.3, 20.8, 27.3 and 33.8 Hz**. An ideal lossless cavity would ring at c / (2πa) × √(n(n+1)) ≈ 10.6, 18.4, 26.0, 33.5 and 41.1 Hz. The real values are lower because the ionosphere ceiling leaks energy.

## Recommendation

1. **Live in the browser from GitHub Pages, legally:** only the NOAA SWPC data. **GOES X-ray flux** (`json/goes/primary/xrays-1-day.json` and `-7-day`) and **GOES integral protons** (`json/goes/primary/integral-protons-1-day.json` and `-7-day`) are US government public data and send `Access-Control-Allow-Origin: *` (I checked this today). They drive the *space weather adjustment* to the model, not the Schumann signal itself.
2. **Refresh with a GitHub Action:** the same NOAA files (for a snapshot fallback), and possibly the Tomsk `.afq` numeric files *if* they're public and Tomsk allows reuse. That needs their permission first [VERIFY; I'd ask them before using it]. HeartMath data would need a data agreement.
3. **Modeled stand-in (what's built):** a daily intensity curve built from where tropical land sees late-afternoon storms (three chimneys), plus the published flare (+0.2 Hz) and proton-event (−0.15 to −0.4 Hz) frequency shifts. The UI labels this **MODELED** everywhere. Next step: replace the simple daily curve with the NASA LIS/OTD diurnal climatology (no use restrictions) using a one-time offline export.
4. **Archive "real" option:** use a Sierra Nevada month as a looped historical sample. But the processed data is CC BY-NC-ND (no derivatives), so check with the authors first [VERIFY].

## Timeline delays used in the visualizer

Everything sits on one UTC clock, as experienced at Earth. Measured-at-Earth data (Kp, Ap, GOES
X-rays and protons, F10.7, sunspots) are not shifted. Only solar wind from L1 is moved.

| Link | Delay | Source / confidence |
|---|---|---|
| Flare light, Sun → Earth | 8.3 min (1 AU ÷ c = 499 s). The Sun scene shows emission time. | Physics |
| X-rays → ionosphere (sudden ionospheric disturbance) and the Schumann frequency rise | About 0 (simultaneous with the GOES reading) | Roldugin et al. 2004 |
| Flare → ≥10 MeV protons at Earth | Tens of minutes to hours. Uses the measured GOES onset. | [VERIFY typical range; depends on magnetic connection] |
| L1 → bow shock | (1.5 million km − 90,000 km) ÷ measured speed: about 59 min at 400 km/s, about 29 min at 800 km/s. Today's data gave 55 to 72 min. | [VERIFY: L1 spacecraft sit 1.4 to 1.6 million km out; the bow shock is 10 to 20 Earth radii upstream] |
| CME transit | 1 to 4 days (demo uses about 2 days) | [VERIFY: NOAA SWPC] |
| Southward Bz → aurora / Kp | About 30 min to 3 h. The chain uses +45 min (oval) and +90 min (curtains), illustrative. | [VERIFY: substorm growth phase ~30 to 60 min] |
| Protons → Schumann frequency drop | +10 min after onset (illustrative) | Roldugin et al. 2001 |

## Sidereal time check

GMST = 18.697374558 + 24.06570982441908 × D hours (D = days since 2000-01-01 12:00 UT, UTC used for UT1).
`tools/test_time.mjs` passes against J2000.0 (18h41m50.548s) and Meeus, *Astronomical Algorithms*,
Examples 12.a (1987-04-10 0h UT → 13h10m46.3668s) and 12.b (19:21 UT → 8h34m57.0896s), within 0.002 s.
