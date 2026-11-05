#!/usr/bin/env python3
"""Build the Earth textures in assets/ from NASA originals (public domain, NASA Earth Observatory):
  world.topo.bathy.200409.3x5400x2700.jpg  Blue Marble Next Generation, Sept 2004, topography + bathymetry
  world.200409.3x5400x2700.jpg             Blue Marble Next Generation, Sept 2004, base (flat ocean color -> water mask)
  BlackMarble_2016_01deg_gray.jpg          Black Marble 2016 night lights, grayscale, 0.1 deg
Download them (URLs in assets/README.md) into one folder and run:  python3 tools/make_earth_textures.py <folder>
Outputs (equirectangular, x=0 at 180 W, y=0 at 90 N, same as the originals):
  assets/earth_day_4096.jpg, assets/earth_day_2048.jpg   day color
  assets/earth_aux_2048.jpg   R = water mask (255 water, for ocean glint and coastlines), G = night lights, B = spare (0)"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
src = sys.argv[1] if len(sys.argv) > 1 else '.'
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')
day = Image.open(os.path.join(src, 'world.topo.bathy.200409.3x5400x2700.jpg')).convert('RGB')
for w, q in ((4096, 82), (2048, 85)):
    day.resize((w, w // 2), Image.LANCZOS).save(os.path.join(out, f'earth_day_{w}.jpg'), quality=q, optimize=True, progressive=True)
base = np.asarray(Image.open(os.path.join(src, 'world.200409.3x5400x2700.jpg')).convert('RGB')).astype(np.int32)
water = (np.abs(base[..., 0] - 2) + np.abs(base[..., 1] - 5) + np.abs(base[..., 2] - 20) < 18).astype(np.uint8) * 255
W = Image.fromarray(water).resize((2048, 1024), Image.BOX).filter(ImageFilter.GaussianBlur(0.6))
night = Image.open(os.path.join(src, 'BlackMarble_2016_01deg_gray.jpg')).convert('L').resize((2048, 1024), Image.LANCZOS)
relief = Image.new('L', (2048, 1024), 0)  # spare channel (the day image already has shaded relief)
Image.merge('RGB', (W, night, relief)).save(os.path.join(out, 'earth_aux_2048.jpg'), quality=85, optimize=True)
for f in sorted(os.listdir(out)): print(f, os.path.getsize(os.path.join(out, f)))
