# Space Weather Ethereal

A slow, ambient Three.js journey along the chain of physics behind space weather: from the
active Sun, through the solar wind and Earth's magnetic shield, down to the aurora. Every scene
is driven by real measurements: the same data that plays in the Space Weather Sonifier.

It is a static site: plain `index.html` plus ES modules. Three.js r170 loads from the jsDelivr
CDN through an import map, so there's no build step.

## Scenes

| # | Scene | What drives it | Visual style it evokes |
|---|-------|----------------|------------------------|
| 1 | **The active Sun**: an animated chromosphere, active regions, glowing loops and occasional flares | F10.7 radio flux (overall activity) and sunspot number (how many regions and loops) | Extreme-UV 304 Å false color (He II, ~50,000 K), as in SDO/AIA and SOHO/EIT |
| 2 | **Solar wind and the Parker spiral**: plasma streaming from the Sun past Earth | Solar wind speed (particle speed and spiral pitch), density (particle count) and IMF Bz (field color and tilt near Earth: blue is north, red is south) | In-situ plasma and magnetometer data from the L1 monitors |
| 3 | **Earth's magnetosphere**: magnetopause, bow shock, compressed dipole and tail, solar wind flowing around it | Magnetopause distance from the **Shue et al. (1998)** model using measured dynamic pressure and Bz; field-line stretch and glow follow Kp | Model view (missions like THEMIS, Cluster and MMS map this region) |
| 4 | **Auroral oval in ultraviolet**: Earth seen from above the North Pole | Kp sets the oval's size and brightness (equatorward edge ≈ 66° − 2°×Kp magnetic latitude, an approximate rule) | Far-UV false color like NASA IMAGE FUV/WIC and Polar UVI |
| 5 | **Auroral curtains from the ground**: looking north from a high-latitude site | Kp sets the brightness, how high the curtains climb, and the mix of red and violet | Oxygen 557.7 nm (green) and 630.0 nm (red), nitrogen 427.8 nm (violet) |

Throughout, you get a deep procedural star field with parallax, bloom, slow drifting camera
paths, and an auto tour that cross-fades between scenes.

**Controls:**
- Drag to orbit, and scroll or pinch to zoom. In the ground view, drag to look around.
- Use the scene buttons at the top to jump between scenes.
- Keys: ←/→ or 1–5 change the scene, **T** toggles the tour, **R** toggles replay, **S** plays or pauses the orchestra, **O** opens the Orchestra panel, **B** toggles the Bartels strip, **H** hides the text, **I** opens About.
- **Replay** sweeps through the last ~135 days of Kp, Ap, F10.7 and sunspot number in about four minutes. Solar wind data only covers the last 24 hours, so replay keeps the latest wind values and says so on screen.
- **Sound** is off by default and starts only after a click (browsers block audio until you interact). It plays the full **Space Weather Sonifier** orchestra, described below.

## Orchestra: the Sonifier, built in

The Space Weather Sonifier's sound engine runs inside the visualizer (`js/orchestra.js`), and
every note shows up in the sky.

- **Seven players, one per data set:** Kp, Ap, F10.7, sunspot number, solar wind speed, density, and Bz. Each one has On, Solo and Mute, a voice, a playing pattern (every step, every 2nd/4th/8th, only when it changes, or held as a drone), an octave, a pitch shift, a volume and a pan.
- **Voices** in the spirit of Brian Eno: airport piano, slow pad with a filter sweep, shimmer glass, soft choir, long bell, simple glass, and pluck.
- **Rhythm:** tempo from 40 to 160 BPM. Note lengths run from half notes to sixteenth triplets. Groupings of 2, 3, 4, 5 (3+2), 6/8, and 7 (2+2+3) accent the first beat of each group.
- **Space:** a convolution reverb made in code (45% mix, 9-second tail by default) and a tempo-synced delay (1/4 note, 35% repeats, 25% mix by default).
- **Presets:** Ambient orchestra (the default), Solo Kp, Storm ensemble, and Everything on.
- **Timing:** one step is one 3-hour Kp reading, oldest to newest. Daily sets hold for the 8 steps of their day. The solar wind sets only cover the last 24 hours, so they loop (one 10-minute reading per step).
- **Pitch:** each reading is scaled low to high and snapped to the chosen scale across three octaves from A2 (110 Hz).
- **Color:** hue = pitch class × 30° on the HSL wheel, with C anchored at red. Lightness by octave is 34/45/56/67%. That puts the primaries red, green and blue on C, E and G#, and the secondaries yellow, cyan and magenta on D, F# and A#.

**What each note does on screen** (always in its note color):

| Data set | Sun | Solar wind | Magnetosphere | UV oval | Aurora |
|---|---|---|---|---|---|
| F10.7, sunspots | An active region lights up; F10.7 also triggers a flare and lights its loops | The Sun pulses | Sunward glow | Dayglow pulse | Soft sky wash |
| Wind speed, density | A puff leaves the corona | Glowing pulses ride the Parker spiral from the Sun to Earth (speed takes the line through Earth) | A parcel of wind flies in and hits the magnetopause | Glint on the dayside oval | Drifting glow high in the sky |
| Bz | A field loop ring | Ripple through the field near Earth, tilted by Bz | A ripple runs from the magnetopause nose down the flanks | Flash at the dayside cusp | Burst in the sky |
| Kp, Ap | A corona ring | Earth glows and rings | Auroral rings flash at both poles | A ring traces the oval and the substorm glow brightens | Curtains brighten, a ray lights up, the sky picks up the note's tint |

**Playhead:** while the orchestra plays, the scenes follow the playhead through the data (the
readout and the bar at the bottom show the date; click the bar to jump). Turn off "Scenes follow
playhead" in the panel to keep the latest conditions on screen instead.

**Bartels strip:** a small light-up strip at the top, like the Sonifier's Bartels view. Each row is
one 27-day Bartels rotation (or 6 hours for the solar wind sets), each stem is a reading, played
stems keep their note color, and the current one glows. Pick the set in the panel; soloing a
set switches the strip to it.

**Tour follows solo:** with the tour on, soloing a set keeps the tour in that set's scenes
(Kp and Ap go to the aurora scenes, F10.7 and sunspots to the Sun, wind speed and density to the
solar wind and magnetosphere, and Bz to the magnetosphere and solar wind).

URL options:
- `?scene=sun|wind|magneto|oval|curtain` opens a specific scene.
- `?tour=0` starts with the tour off.
- `?live=0` uses only the bundled snapshot.
- `?quality=low` turns on reduced effects. Phones and touch devices get this automatically.
- `?orch=1` opens the Orchestra panel. `?strip=0` hides the Bartels strip. `?follow=0` keeps the scenes on the latest data while music plays.
- `?dwell=12` sets the tour's time per scene in seconds (default 42).

## Honesty rules

- **No data is invented.** Missing readings (`-999`) are skipped. If no reading exists, the display shows "—".
- **Measured vs. modeled is labeled.** Purple values in the readout are model estimates: dynamic pressure, magnetopause distance and the oval edge.
- **Visuals are procedural and stylized.** Sizes and distances aren't to scale. Flare timing, active-region positions, substorm brightenings and curtain shapes are illustrative. The captions say so in each scene.
- **No images are used.** Everything is generated in shaders. SOHO, SDO, IMAGE and Polar are named only as visual-style references.

## Data

| Source | What | How it's used |
|--------|------|---------------|
| **NOAA Space Weather Prediction Center (SWPC)**, services.swpc.noaa.gov | Planetary K-index (`products/noaa-planetary-k-index.json`), real-time solar wind plasma and magnetic field (`json/rtsw/rtsw_wind_1m.json`, `json/rtsw/rtsw_mag_1m.json`), 10.7 cm flux (`json/f107_cm_flux.json`), SWPC sunspot number (`json/solar-cycle/swpc_observed_ssn.json`) | Fetched **live in the browser** on every load. These endpoints allow cross-origin requests. Solar wind is averaged into 10-minute means from the active spacecraft, the same way the sonifier does it. |
| **GFZ Helmholtz Centre for Geosciences, Potsdam** (kp.gfz.de) | Kp history, Ap, F10.7 observed, international sunspot number (SILSO) | Included in the **bundled snapshot** `data.json` |

If the live fetch fails, the app uses `data.json`. The badge at the top shows **LIVE** (green)
or **SNAPSHOT** (amber) and "data as of …". Hover over it, or open About, to see the status of
each source.

The SWPC sunspot number is on a different scale from the international (SILSO) number. The app
uses SILSO when it's current and labels SWPC's number when it uses that instead.

### Refreshing the bundled snapshot

```bash
python3 tools/export_data.py            # copy /workspace/spacewx/data.json (refresh.py output)
python3 tools/export_data.py --refresh  # run the sonifier's refresh.py first, then export
```

Commit the new `data.json` to update what visitors see when the live fetch isn't available.

## Run locally

```bash
cd space-weather-ethereal      # this folder
python3 -m http.server 8000
# open http://localhost:8000/
```

ES modules don't load from `file://`, so serve the folder over HTTP. The first load needs
internet access for the Three.js CDN.

Headless smoke test with screenshots (optional, needs `pip install playwright`):

```bash
python3 -m http.server 8931 &
python3 tools/shoot.py            # desktop, writes screenshots/*.png
python3 tools/shoot.py --mobile   # phone-sized viewport
python3 tools/test_combo.py       # orchestra + reactions test, writes screenshots/combo-*.png
python3 tools/record_tour.py http://localhost:8931/ 120   # silent tour video, screenshots/combo-tour.webm (convert to mp4 with ffmpeg)
```

## Deploy to GitHub Pages

**Option A (recommended): its own repo**, for example `jdak907/space-weather-ethereal`.
1. Create the repo and push the contents of this folder to `main`. `index.html` goes at the repo root, and `.nojekyll` is included.
2. On GitHub, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. After a minute or so, the site is live at `https://jdak907.github.io/space-weather-ethereal/`.
4. Optionally, link it from the portfolio.

**Option B: a subfolder of the portfolio repo.** Copy this folder to
`portfolio/space-weather-ethereal/`. It's then served at
`https://jdak907.github.io/portfolio/space-weather-ethereal/`. All paths are relative, so it
works either way.

To keep the bundled snapshot fresh on Pages, you can schedule a GitHub Action to run
`tools/export_data.py --refresh` and commit `data.json` (optional). The live NOAA fetch already
keeps Kp and the solar wind current for visitors.

## Performance

- The device pixel ratio is capped at 2 on desktop and 1.5 on phones.
- Particles are drawn on the GPU: 40k on desktop, 14k on phones. Phones also get fewer stars, lighter bloom and no MSAA.
- Scenes that aren't visible aren't rendered. Rendering pauses while the tab is hidden.
- Note flashes reuse a small pool of sprites and rings per scene. The audio caps itself at 72 voices sounding at once, as the Sonifier does.

## Credits

- Data: NOAA SWPC; GFZ Potsdam (Kp/Ap: Matzka et al. 2021, doi:10.5880/Kp.0001); SILSO, Royal Observatory of Belgium (sunspot number); DRAO Penticton (F10.7).
- Magnetopause model: Shue, J.-H., et al. (1998), J. Geophys. Res., 103(A8), 17691–17700.
- 3D: [Three.js](https://threejs.org) (MIT). Simplex noise GLSL: Ian McEwan and Ashima Arts, [webgl-noise](https://github.com/ashima/webgl-noise) (MIT).
- Visual style references only (no imagery used): NASA SDO/AIA, ESA/NASA SOHO/EIT, NASA IMAGE FUV, NASA Polar UVI.
- Made by Jeff Dumps ([@jdak907](https://github.com/jdak907)). Code is under the MIT License (see `LICENSE`).
