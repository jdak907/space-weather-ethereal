import { noteColor, norm, timeAt, MISSING, BARTELS_EPOCH } from './orchestra.js';

// A small Bartels light-up strip, like the Sonifier's: one row per 27-day Bartels rotation
// (or per 6 hours for the 24-hour solar wind sets), a stem per reading, played stems tinted in
// their note color and the current one glowing.
export class BartelsStrip {
  constructor(canvas, orch) {
    this.cv = canvas; this.o = orch; this.id = 'kp'; this.played = new Set(); this.cur = -1; this.flash = 0;
    this.dirty = true; this.key = '';
  }
  setSet(id) { this.id = id; this.played.clear(); this.cur = -1; this.dirty = true; }
  reset() { this.played.clear(); this.cur = -1; this.dirty = true; }
  geom() {
    const ds = this.o.S[this.id], n = ds.v.length, cyc = ds.cycleH * 3600e3;
    const epoch = ds.cycleH > 24 ? BARTELS_EPOCH : 0;
    const rot = (i) => Math.floor((timeAt(ds, i) - epoch) / cyc);
    const k0 = rot(0), rows = rot(n - 1) - k0 + 1, perTurn = Math.round(ds.cycleH / ds.stepH);
    return { ds, n, cyc, epoch, k0, rows, perTurn };
  }
  // mark the reading under the playhead
  step(k, fired) {
    if (!this.o.S) return;
    const j = this.o.mapIdx(this.id, k);
    if (j >= 0) { this.cur = j; this.played.add(j); }
    const f = fired && fired.find((x) => x.id === this.id);
    if (f) this.flash = 1;
    this.dirty = true;
  }
  draw(dt) {
    if (!this.o.S || this.cv.offsetParent === null) return;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 2.2); this.dirty = true; }
    if (!this.dirty) return; this.dirty = false;
    const { ds, n, cyc, epoch, k0, rows, perTurn } = this.geom();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = this.cv.clientWidth, RH = W < 420 ? 15 : 19, TOP = 16, L = W < 420 ? 50 : 62, H = TOP + rows * RH + 4;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.cv.style.height = H + 'px'; }
    const g = this.cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const plotW = W - L - 6, slot = plotW / perTurn;
    g.font = '10px system-ui, sans-serif'; g.fillStyle = 'rgba(200,210,230,.65)'; g.textBaseline = 'middle';
    const daily = ds.cycleH > 24;
    g.fillText(daily ? 'Bartels rotation' : '6-hour rows (PT)', 0, 7);
    g.textAlign = 'right'; g.fillText(this.o.S[this.id].short + (daily ? ' · day 1 → 27' : ' · 0 → 6 h'), W - 4, 7); g.textAlign = 'left';
    for (let r = 0; r < rows; r++) {
      const y0 = TOP + r * RH, yb = y0 + RH - 3;
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(L, y0, plotW, RH - 2);
      const lab = daily ? 'BR ' + (k0 + r + 1) : new Date(epoch + (k0 + r) * cyc).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric' });
      g.fillStyle = 'rgba(200,210,230,.6)'; g.fillText(lab, 0, y0 + RH / 2);
    }
    const sw = Math.max(1, Math.min(4, slot * 0.6));
    let curXY = null;
    for (let i = 0; i < n; i++) {
      const v = ds.v[i]; if (!(v > MISSING)) continue;
      const t = timeAt(ds, i) - epoch, kk = Math.floor(t / cyc), pos = (t - kk * cyc) / cyc;
      const x = L + pos * plotW + slot / 2, yb = TOP + (kk - k0) * RH + RH - 3, h = 1.5 + norm(ds, v) * (RH - 6);
      const midi = this.o.midiFor(this.id, v);
      if (i === this.cur) curXY = { x, yb, h, midi };
      g.fillStyle = this.played.has(i) ? noteColor(midi, 0.75) : 'rgba(170,185,210,.32)';
      g.fillRect(x - sw / 2, yb - h, sw, h);
    }
    if (curXY) {
      const c = noteColor(curXY.midi);
      g.save(); g.shadowColor = c; g.shadowBlur = 8 + 10 * this.flash; g.fillStyle = c;
      g.fillRect(curXY.x - sw, curXY.yb - curXY.h, sw * 2, curXY.h);
      g.beginPath(); g.arc(curXY.x, curXY.yb - curXY.h, 2.5 + 3 * this.flash, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
}
