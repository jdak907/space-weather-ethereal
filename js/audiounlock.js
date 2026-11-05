// Mobile audio: make the orchestra play like media on iPhone/iPad (ringer switch on silent,
// AirPlay, lock-screen controls) while desktop keeps the direct, multichannel-capable path.
//
// iOS treats Web Audio as "ambient" sound by default, so the ringer/silent switch mutes it and
// AirPlay ignores it. Three layers, newest first:
//   1. navigator.audioSession.type = 'playback' (Safari 17+): Web Audio becomes media playback,
//      so it ignores the silent switch and follows the system output route (AirPlay, Bluetooth).
//   2. A silent, looping <audio> element started inside the tap (older iOS): while a media element
//      plays, WebKit moves the page's audio session to the playback category, with the same effect.
//   3. Optional "media element" route: the whole mix goes AudioContext -> MediaStreamDestination ->
//      a playing <audio playsinline x-webkit-airplay="allow">. That element is what the AirPlay
//      picker (webkitShowPlaybackTargetPicker) and Media Session controls attach to. Stereo only.
// Every step that needs a user gesture (creating/resuming the context, element.play()) runs
// synchronously inside the Sound/Play tap.

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// iPadOS reports a Mac UA; tell it apart by touch points
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const isWebKit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
export const hasAudioSession = () => typeof navigator !== 'undefined' && !!navigator.audioSession;
export const airplaySupported = () => typeof window !== 'undefined' && !!window.WebKitPlaybackTargetAvailabilityEvent;

// 0.1 s of silence, 8 kHz mono 8-bit WAV (built once; no network)
function silentWav() {
  const n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

const stats = { session: null, silentLoop: 'off', route: 'direct', elementPlay: null, resumes: 0, interrupted: 0, airplayAvailable: null, picker: 0, mediaSession: false };
export const unlockStats = stats;

// 1) before (or right after) the AudioContext exists
export function prepareSession() {
  if (hasAudioSession()) {
    try { navigator.audioSession.type = 'playback'; stats.session = navigator.audioSession.type; } catch (e) { stats.session = 'error: ' + e.message; }
  }
  return stats.session;
}

export function mkAudio(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('audio'); el.id = id;
    el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.setAttribute('x-webkit-airplay', 'allow');
    el.preload = 'auto'; el.style.display = 'none'; document.body.appendChild(el);
  }
  return el;
}

// 2) silent loop: only where the session API is missing (it would otherwise be redundant)
let silent = null;
function startSilentLoop() {
  if (hasAudioSession()) return;          // Safari 17+: the session API covers it
  if (!isIOS && !isWebKit) return;        // Chrome/Firefox/Android ignore the ringer switch anyway
  if (!silent) { silent = mkAudio('swe-silent'); silent.loop = true; silent.src = silentWav(); silent.volume = 0.01; }
  const p = silent.play(); stats.silentLoop = 'starting';
  if (p && p.then) p.then(() => { stats.silentLoop = 'playing'; }, (e) => { stats.silentLoop = 'blocked: ' + e.name; });
}

// 3) media element route
export const OUT_ID = 'swe-out';
export class MediaRoute {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out; this.mode = 'direct'; this.el = null; this.dest = null;
    this.out.connect(ctx.destination);
  }
  get element() { return this.el; }
  // call inside a user gesture
  useElement(on) {
    const ctx = this.ctx;
    if (on && !ctx.createMediaStreamDestination) on = false;
    if (on === (this.mode === 'element')) { if (on) this.playEl(); return this.mode; }
    if (on) {
      if (!this.dest) { this.dest = ctx.createMediaStreamDestination(); this.dest.channelCount = 2; }
      this.el = mkAudio(OUT_ID); this.el.srcObject = this.dest.stream; this.el.muted = false;
      try { this.out.disconnect(ctx.destination); } catch (_e) { /* not connected */ }
      this.out.connect(this.dest); this.mode = 'element'; this.playEl();
    } else {
      try { this.out.disconnect(this.dest); } catch (_e) { /* not connected */ }
      this.out.connect(ctx.destination); this.mode = 'direct';
      if (this.el) this.el.pause();
    }
    stats.route = this.mode;
    return this.mode;
  }
  playEl() {
    if (!this.el) return;
    const p = this.el.play(); stats.elementPlay = 'starting';
    // if the element is refused, fall back to the direct path so there is still sound
    if (p && p.then) p.then(() => { stats.elementPlay = 'playing'; }, (e) => { stats.elementPlay = 'blocked: ' + e.name; this.useElement(false); });
  }
}

// lock-screen / Control Center metadata and play/pause buttons
export function setMediaSession(handlers, playing) {
  const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
  if (!ms) return;
  try {
    if (!ms.metadata && window.MediaMetadata) {
      ms.metadata = new window.MediaMetadata({ title: 'Space Weather Ethereal', artist: 'Jeff Dumps', album: 'Live space weather, as music' });
      for (const [k, f] of Object.entries(handlers || {})) { try { ms.setActionHandler(k, f); } catch (_e) { /* unsupported action */ } }
    }
    ms.playbackState = playing ? 'playing' : 'paused';
    stats.mediaSession = true;
  } catch (_e) { /* old browser */ }
}

// everything the Sound/Play tap must do synchronously; returns nothing async-critical
export function unlockInGesture(ctx) {
  prepareSession();
  startSilentLoop();
  if (!ctx) return;
  if (ctx.state !== 'running' && ctx.state !== 'closed') { stats.resumes++; ctx.resume().catch(() => {}); }
  // older WebKit only unlocks after a source starts inside the gesture: play one silent sample
  try { const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); stats.bufferKick = (stats.bufferKick || 0) + 1; } catch (_e) { /* closed */ }
}

// keep the context alive: iOS puts it in 'interrupted' (calls, Siri, other apps) or 'suspended'
// (background). Resume when the page comes back or on the next tap anywhere.
export function keepAlive(ctx, wantPlaying, route) {
  const kick = () => {
    if (!wantPlaying()) return;
    if (ctx.state !== 'running' && ctx.state !== 'closed') { stats.resumes++; ctx.resume().catch(() => {}); }
    if (route && route.mode === 'element' && route.el && route.el.paused) route.playEl();
    if (silent && silent.paused && stats.silentLoop !== 'off') silent.play().catch(() => {});
  };
  ctx.addEventListener('statechange', () => { if (ctx.state === 'interrupted') stats.interrupted++; if (ctx.state !== 'running' && document.visibilityState === 'visible') setTimeout(kick, 300); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  addEventListener('pageshow', kick);
  ['touchend', 'pointerup', 'keydown'].forEach((ev) => addEventListener(ev, kick, { passive: true }));
}

// AirPlay picker: shown only where WebKit says AirPlay targets exist
export function watchAirPlay(el, onChange) {
  if (!airplaySupported() || !el) return;
  el.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => { stats.airplayAvailable = e.availability === 'available'; onChange(stats.airplayAvailable); });
}
export function showAirPlayPicker(el) {
  if (el && el.webkitShowPlaybackTargetPicker) { try { el.webkitShowPlaybackTargetPicker(); stats.picker++; return true; } catch (e) { stats.pickerError = e.message; } }
  return false;
}
