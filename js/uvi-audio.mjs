// Stub for a future UVI sound voice. It is not registered with the orchestra,
// so Kp, Ap, F10.7, sunspots, solar wind, IMF Bz, GOES, and the modeled
// Schumann tones keep their current mappings. Disabled: always silent.
export function createUviVoice() {
  return {
    id: 'uvi',
    enabled: false,
    mapped: false,
  };
}

// Returns a note descriptor, or null for silence. Gaps and the disabled flag
// both return null. Even if enabled, there is no pitch mapping yet.
export function uviSample(voice, coverage) {
  if (!voice || !voice.enabled || !voice.mapped) return null;
  if (!coverage || coverage.state !== 'frame' || !coverage.frame) return null;
  return null;
}
