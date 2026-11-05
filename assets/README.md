# Earth imagery

All three images are NASA Earth Observatory products. NASA imagery is not copyrighted in the United States and may be reused and redistributed freely; NASA asks for credit (NASA image use guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/). It must not be used to imply NASA endorsement.

| File | Size | What it is | Made from |
| --- | --- | --- | --- |
| `earth_day_4096.jpg` | 4096 × 2048, ~0.97 MB | Day color (desktop) | Blue Marble: Next Generation with Topography and Bathymetry, September 2004, `world.topo.bathy.200409.3x5400x2700.jpg` |
| `earth_day_2048.jpg` | 2048 × 1024, ~0.32 MB | Day color (phones) | same |
| `earth_aux_2048.jpg` | 2048 × 1024, ~0.18 MB | R = water mask (ocean glint, coastlines in the UV oval scene); G = night lights; B unused | water: Blue Marble: Next Generation base map, September 2004, `world.200409.3x5400x2700.jpg` (flat ocean color thresholded); lights: Black Marble 2016 grayscale, 0.1°, `BlackMarble_2016_01deg_gray.jpg` |

Credits:
- Blue Marble: Next Generation: Reto Stöckli, NASA Earth Observatory (NASA Goddard Space Flight Center), with topography and bathymetry shading by Jesse Allen, NASA Earth Observatory, using GEBCO data from the British Oceanographic Data Centre.
- Black Marble 2016: NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA Goddard Space Flight Center.

Sources (downloaded 2026-11-05):
- https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/september/world.topo.bathy.200409.3x5400x2700.jpg
- https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/september/world.200409.3x5400x2700.jpg
- https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg
(pages: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ and https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/)

Rebuild with `python3 tools/make_earth_textures.py <folder with the three originals>`.

Layout: equirectangular (plate carrée), column 0 at 180° W, top row at 90° N. On a three.js `SphereGeometry` the default uv puts u = 0.5 (0° longitude) at +x and 90° W at +z, which matches the Schumann scene's land mask (`js/landmask.js`, Natural Earth); a check of the water mask against that mask agrees on 96.6% of 1° cells at zero offset (69% if mirrored).
