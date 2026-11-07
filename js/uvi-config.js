// SMILE UVI loader settings. The deployed page does not contact ESA.
// Real QuickLook images load only after an explicit opt-in:
//   ?uvi=local          gitignored local/uvi/catalog.json (from tools/fetch_uvi.py)
//   the panel's URL box a catalog URL for this browser session, not saved
//   ?uvi=synthetic      labeled diagrams shipped for tests and demos
// Setting loadLocalCatalog true is a local-checkout switch. It still reads
// only the local catalog, never an ESA host.
export const UVI_CONFIG = {
  loadLocalCatalog: false,
  localCatalog: 'local/uvi/catalog.json',
  syntheticCatalog: 'data/uvi-synthetic/catalog.json',
  // Confirmed QuickLook container on 2026-11-07. Overridden by a catalog's own "format".
  format: 'png',
  // Display window when the next frame is farther than maxHoldMs. Not an exposure measurement.
  nominalCadenceMs: 60_000,
  // A longer gap is "no SMILE coverage". 90 s covers the 30 s and 60 s cadences we measured
  // and does not bridge the multi-minute holes in the public archive.
  maxHoldMs: 90_000,
  // Browser endpoint stays empty. tools/fetch_uvi.py holds the ESA TAP URL.
  endpoint: null,
};
