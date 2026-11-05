# Space Weather Ethereal

Created by Jeff Dumps · https://github.com/jdak907

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
| 6 | **Schumann resonances (MODELED)**: Earth with real continents, the ionosphere as a glowing shell, standing-wave modes 1 to 5 (Legendre patterns P1 to P5) breathing between the two, lightning flashing where afternoon storms are for the UTC hour, and a live spectrum panel | A model, labeled "MODELED" everywhere: lightning by time of day from a Natural Earth land mask, plus published space weather shifts driven by live NOAA GOES X-rays and ≥10 MeV protons (see below) | Spectrograms from ELF stations such as Tomsk, Hylaty and Sierra Nevada |

Throughout, you get a deep procedural star field with parallax, bloom, slow drifting camera
paths, and an auto tour that cross-fades between scenes.

**Controls:**
- Drag to orbit, and scroll or pinch to zoom. In the ground view, drag to look around.
- Use the scene buttons at the top to jump between scenes.
- Keys: ←/→ or 1–6 change the scene, **T** toggles the tour, **R** toggles replay, **S** plays or pauses the orchestra, **O** opens the Orchestra panel, **B** toggles the Bartels strip, **H** hides the text, **I** opens About.
- **Replay** sweeps through the last ~135 days of Kp, Ap, F10.7 and sunspot number in about four minutes. Solar wind data only covers the last 24 hours, so replay keeps the latest wind values and says so on screen.
- **Sound** is off by default and starts only after a click (browsers block audio until you interact). It plays the full **Space Weather Sonifier** orchestra, described below.

## Orchestra: the Sonifier, built in

The Space Weather Sonifier's sound engine runs inside the visualizer (`js/orchestra.js`), and
every note shows up in the sky.

- **Nine players, one per data set:** Kp, Ap, F10.7, sunspot number, solar wind speed, density, Bz, GOES X-rays, and Schumann resonance (modeled). Each one has On, Solo and Mute, a voice, a playing pattern (every step, every 2nd/4th/8th, only when it changes, or held as a drone), an octave, a pitch shift, a volume and a pan.
- **Voices** in the spirit of Brian Eno: airport piano, slow pad with a filter sweep, shimmer glass, soft choir, long bell, simple glass, and pluck.
- **Rhythm:** tempo from 40 to 160 BPM. Note lengths run from half notes to sixteenth triplets. Groupings of 2, 3, 4, 5 (3+2), 6/8, and 7 (2+2+3) accent the first beat of each group.
- **Space:** a convolution reverb made in code (45% mix, 9-second tail by default) and a tempo-synced delay (1/4 note, 35% repeats, 25% mix by default).
- **Presets:** Ambient orchestra (the default), Solo Kp, Storm ensemble, Everything on, and Schumann cavity.
- **Timing:** one shared UTC timeline (see "Timeline and delays" below). The solar wind sets only cover about the last 24 hours, so they are silent before that.
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
The strip opens at its small (minimum) size. To enlarge it, click the ⤢ button in its corner,
press **E**, or double-click its header. Enlarged, it spans most of the screen width (nearly
full width on phones), with tall rows, day ticks, and big lit cells, so the note colors are easy
to read. The same controls shrink it back. The size animates, and the page remembers it.

**Tour follows solo:** with the tour on, soloing a set keeps the tour in that set's scenes
(Kp and Ap go to the aurora scenes, F10.7 and sunspots to the Sun, wind speed and density to the
solar wind and magnetosphere, and Bz to the magnetosphere and solar wind).

URL options:
- `?scene=sun|wind|magneto|oval|curtain|schumann` opens a specific scene.
- `?demo=1` starts the **Typical storm demo** (illustrative, not real data). `?event=1` turns on event mode. `?window=1d|3d|7d|27d|all` and `?bars=4` set the timeline window and compression.
- `?tour=0` starts with the tour off.
- `?live=0` uses only the bundled snapshot.
- `?quality=low` turns on reduced effects. Phones and touch devices get this automatically.
- `?orch=1` opens the Orchestra panel. `?strip=0` hides the Bartels strip. `?follow=0` keeps the scenes on the latest data while music plays.
- `?dwell=12` sets the tour's time per scene in seconds (default 42).

## Spatial audio: stereo, headphones 3D, 5.1 and 7.1

Pick the **Output** in the Orchestra panel: Auto, Stereo, Headphones 3D, 5.1 or 7.1. The choice is
remembered on this device. **Speaker test** pings each channel in turn and shows its name.

- **Stereo** (the fallback, and what Auto picks on ordinary speakers and phones): each voice uses
  its Pan knob, as before.
- **Headphones 3D:** every voice becomes a Web Audio `PannerNode` (`panningModel: 'HRTF'`, inverse
  distance law) placed where its data lives in the scene on screen, and the listener rides the
  camera every frame, so orbiting, panning and zooming move the sound. The Pan knobs do nothing in
  this mode. Browsers cannot tell headphones from speakers, so Auto never turns this on by itself.
- **5.1 / 7.1:** offered only when the browser reports enough output channels
  (`AudioContext.destination.maxChannelCount` of at least 6 or 8; otherwise the options are greyed out).
  The output is set to discrete channels, and each voice is panned with 2D vector-based amplitude
  panning (VBAP) to the ITU speaker angles: L 30°, R −30°, C 0°, Ls 110°, Rs −110° for 5.1; side
  90°/−90° and rear 135°/−135° for 7.1. Sources high overhead spread across all speakers. The
  Schumann drone also feeds the subwoofer (LFE) through a 150 Hz low-pass at about −6 dB.
- **Reverb and delay** stay shared: every voice sends to them before panning. Their return goes
  to the front pair (stereo and 3D), or to the fronts plus the surrounds (5.1 and 7.1).

| Scene | Where the voices sit |
|---|---|
| Sun | X-rays at the flaring region, sunspots at an active region, F10.7 at the disk, wind leaving the corona, Kp/Ap/Schumann off toward Earth |
| Solar wind | Speed and density ride pulses out along the Parker spiral; Bz at the field near Earth; the Sun's sets at the Sun; Kp/Ap at Earth |
| Magnetosphere | Wind at the bow-shock nose, Bz at the magnetopause nose, Kp and Ap over the north and south poles, Schumann at Earth, the Sun's sets far sunward |
| UV oval | Kp on the midnight side of the oval, Ap at dawn, Bz at the dayside cusp, the Sun's sets toward the Sun (to the right) |
| Aurora | Kp and Ap in the curtains, Bz overhead, wind high in the north, Schumann underfoot, the Sun's sets low in the south behind you |
| Schumann | The drone over the busiest storm region, Kp/Ap at the poles, the Sun's sets toward the subsolar point |

**How to hear it:**
- **3D:** wear headphones (any kind) and choose *Headphones 3D*. Drag to orbit and scroll to
  zoom, and the voices move around your head.
- **Surround:** use Chrome or Edge on a desktop computer. Connect HDMI to an AV receiver (or use a
  multichannel USB interface), and set the receiver to **multichannel PCM**, not a stereo
  "upmix" mode. Set the computer's speaker configuration to 5.1 or 7.1 (Windows Sound settings, or
  macOS Audio MIDI Setup). Reload the page, open the Orchestra panel, pick 5.1 or 7.1, and run
  *Speaker test*.
- Channel order: Web Audio's 6-channel order is L R C LFE SL SR. For 8 channels Chrome uses
  L R C LFE BL BR SL SR (the back pair before the side pair; Chromium `media/base/channel_layout.cc`,
  the same as the WAVE order). Whether your OS, driver and receiver route those to the right
  speakers depends on the system. [VERIFY] it with Speaker test.
- If a device reports more channels than it accepts, the page falls back to stereo.

## Phones, the silent switch, and AirPlay

iPhone Safari treats web audio as "ambient" sound, so the ringer switch on silent mutes it and AirPlay ignores it. The site now asks for media playback instead (`js/audiounlock.js`):

- **Safari 17+:** `navigator.audioSession.type = 'playback'`, set inside the Sound tap. Sound plays with the switch on silent and follows the phone's output (AirPlay, Bluetooth).
- **Older iOS:** a silent, looping `<audio playsinline>` starts inside the tap, which moves the page into the playback category.
- **Play as media (Orchestra → Output):** the whole mix plays through an `<audio x-webkit-airplay="allow">` element fed by a `MediaStreamAudioDestinationNode`. That element is what the **AirPlay** button (shown only when Safari reports an AirPlay target) opens the picker for, and it carries lock-screen title and play/pause (Media Session). This route is stereo; Headphones 3D still works, 5.1/7.1 fall back to stereo.
- The audio context is created and resumed inside the tap, and resumed again after an interruption (call, Siri) or when the page comes back to the front.

Whether AirPlay picks up the MediaStream-fed element on a real Apple TV, and how much delay it adds, is [VERIFY] on a device. `tools/test_audio_unlock.py` checks the code path in emulation.

## Schumann resonance (modeled)

There's no open, live, numeric Schumann resonance feed a web page can use. Stations post
spectrogram pictures, and the numeric data that is open is archival (details and links in
[`docs/schumann-data-sources.md`](docs/schumann-data-sources.md)). So scene 6 and
the Schumann player use a **model**, labeled "MODELED" in the scene, the spectrum panel, the readout and the panel:

- **Intensity:** thunderstorms peak around 4 PM local time over tropical land. The model adds that
  up over a real 1° land mask (Natural Earth 1:110m, public domain, `js/landmask.js`, built by
  `tools/make_landmask.py`), with the storm belt following the Sun north and south through the year.
  That gives the "three chimneys": SE Asia around 08 UTC, Africa around 14 to 15 UTC, the Americas around 20 UTC.
- **Frequencies:** 7.83, 14.3, 20.8, 27.3 and 33.8 Hz, shifted by live NOAA GOES data:
  X-ray flares raise mode 1 up to +0.2 Hz (C1 → 0, M1 → +0.1, X1 and up → +0.2; Roldugin et al. 2004),
  and proton events (≥10 MeV ≥ 10 pfu) lower it by 0.15 to 0.4 Hz (Roldugin et al. 2001). Higher modes
  shift more (mode 2 about 1.75×; modes 3 to 5 are extrapolated [VERIFY]).
- **Kp** only broadens the peaks a little (illustrative; storm effects on Schumann resonance are small and uncertain).
- **Sound:** the "Cavity drone" voice plays all five mode frequencies **× 16 (4 octaves up)**:
  125.3, 228.8, 332.8, 436.8 and 540.8 Hz, as one continuous drone. More lightning = louder and
  more modes ring (1 mode at the daily low, 5 at the peak). A +0.2 Hz flare shift becomes +3.2 Hz you can hear.
  The note color is the highest ringing mode's nearest note (B2, A#3, E4, A4, C#5).
- **Visual reactions:** Schumann notes make the mode patterns and spectrum peaks swell in the note's
  color and send a sferic ring around the cavity. Elsewhere they make a small glow (a ring at Earth,
  far-off lightning on the aurora horizon, a faint tropical flash on the UV globe).

## Timeline and delays (cause, then effect)

All data sets sit on **one UTC clock, as experienced at Earth**. Each set keeps its true cadence
and is held only over its own interval (Kp 3-hourly, Ap, F10.7 and sunspots daily, solar wind
10-minute means of 1-minute data, GOES X-rays 10-minute maxima so no flare is skipped). Where a
set has no reading, its player is silent. Nothing is interpolated across gaps.

| Link in the chain | Delay used | How | Source / confidence |
|---|---|---|---|
| Flare light (X-rays, EUV), Sun → Earth | **8.3 min** | The Sun scene shows the Sun at emission time (playhead − 8.3 min). GOES measures at Earth, so no shift. | 1 AU ÷ c = 499 s |
| X-rays → dayside ionosphere (sudden ionospheric disturbance) → Schumann frequency up | about 0 | Same time as the GOES reading | Roldugin et al. 2004 |
| Flare → solar energetic protons (≥10 MeV) at Earth | **tens of minutes to hours**, measured | Uses GOES proton onset time; the chain says how long after the flare | Depends on magnetic connection [VERIFY typical range] |
| Protons → Schumann frequency down | +10 min after onset (illustrative) | | Roldugin et al. 2001, 2003 |
| Solar wind, L1 → Earth's bow shock | **(1.5 million km − 90,000 km) ÷ measured speed**, about 30 to 60 min | Every L1 reading is moved to its arrival time (shown in the readout as "L1 → Earth delay") | L1 distance and bow-shock standoff vary [VERIFY per spacecraft and conditions] |
| CME, Sun → Earth | **1 to 4 days** | Demo only (real CME tracking isn't connected) | NOAA SWPC [VERIFY] |
| Southward Bz at the magnetosphere → aurora / Kp | **about 30 min to 3 h** | Chain shows the oval at +45 min and curtains at +90 min (illustrative). Measured Kp is already on Earth time, so it's not shifted. | Substorm growth phase ~30 to 60 min [VERIFY] |

**Events** found in the data: flares ≥ M1 (GOES), proton events ≥ 10 pfu, southward Bz ≤ −5 nT for
30 min or more (at Earth arrival), and Kp ≥ 5− (4.67). They appear as colored markers on the playhead bar.
When the playhead passes one, a **Chain of events** panel lists the cause and each effect with its delay,
the scenes show each stage, and with the tour on, the camera follows the chain from scene to scene.

**Musical time:** in the Orchestra panel, choose the window (24 hours to everything) and the
compression (1 day = 1 to 32 bars). One step = 1 day ÷ (bars × steps per bar). The default is
4 bars a day with eighth notes in 4, so one step is 45 minutes. **Event mode** runs quiet stretches
3× faster and the hours around events 8× slower (at least 2 minutes per step). The notes stay in time order.

**Typical storm demo** (Orchestra panel or `?demo=1`): an illustrative textbook sequence, **not
real data**, labeled DEMO in the badge, a banner, the bar and the readout. An X2 flare, protons
about an hour later, a CME arriving about 2 days later with a strong southward Bz, Kp climbing to 7
with the aurora moving toward mid-latitudes, then recovery. Real data stays the default.

## Times

Every time on screen is shown three ways, in this order: your **local time** with its zone
(from the browser), **UTC**, and **Greenwich Mean Sidereal Time** (GMST), for example
`Nov 4, 4:31 PM PST · 00:31 UTC Nov 5 · GMST 03:28`. Phones get a shorter form. GMST uses the standard formula
GMST = 18.697374558 + 24.06570982441908 × D hours (D = days since 2000-01-01 12:00 UT), with UTC
in place of UT1 (under 1 s difference). To also see **Local Sidereal Time**, type your longitude in
About. The app never asks for your location. Test: `node tools/test_time.mjs`, which checks
J2000.0 (18h41m50.548s) and Meeus, *Astronomical Algorithms*, examples 12.a and 12.b.

## Honesty rules

- **No data is invented.** Missing readings (`-999`) are skipped. If no reading exists, the display shows "—".
- **Measured vs. modeled is labeled.** Purple values in the readout are model estimates: dynamic pressure, magnetopause distance and the oval edge.
- **Visuals are procedural and stylized.** Sizes and distances aren't to scale. Flare timing, active-region positions, substorm brightenings and curtain shapes are illustrative. The captions say so in each scene.
- **No images are used.** Everything is generated in shaders. SOHO, SDO, IMAGE and Polar are named only as visual-style references.

## Data

| Source | What | How it's used |
|--------|------|---------------|
| **NOAA Space Weather Prediction Center (SWPC)**, services.swpc.noaa.gov | Planetary K-index (`products/noaa-planetary-k-index.json`), real-time solar wind plasma and magnetic field (`json/rtsw/rtsw_wind_1m.json`, `json/rtsw/rtsw_mag_1m.json`), 10.7 cm flux (`json/f107_cm_flux.json`), SWPC sunspot number (`json/solar-cycle/swpc_observed_ssn.json`) | Fetched **live in the browser** on every load. These endpoints allow cross-origin requests. Solar wind is averaged into 10-minute means from the active spacecraft, the same way the sonifier does it. |
| **NOAA SWPC GOES** | X-ray flux 0.1 to 0.8 nm (`json/goes/primary/xrays-1-day.json`) and ≥10 MeV integral protons (`integral-protons-1-day.json`) | Live in the browser (cross-origin allowed); 7-day snapshot in `data.json` from `tools/export_goes.py`. Drives flare and proton-event shifts in the Schumann model and the X-rays player. |
| **Natural Earth** | 1:110m land polygons (public domain) | Continents in the Schumann scene (`tools/make_landmask.py`) |
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
python3 tools/export_goes.py            # then add the 7-day GOES X-ray + proton snapshot
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
python3 tools/test_spatial.py     # HRTF graph, listener follows camera, 2/6/8-channel logic, OfflineAudioContext channel energy
node tools/test_time.mjs          # GMST/LST unit test
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
