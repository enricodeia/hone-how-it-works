"""Zoomed side-by-side of one region: python3 verify/crop.py FRAME x0 y0 x1 y1 [width]  (displayed 2000-wide coords)"""
import sys, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = int(sys.argv[1]); x0, y0, x1, y1 = map(float, sys.argv[2:6]); W = int(sys.argv[6]) if len(sys.argv) > 6 else 900
suffix = os.environ.get('SUFFIX', '')
ref = Image.open(os.path.join(ROOT, 'source-assets', f'0{f}.png')).convert('RGB')
shot = Image.open(os.path.join(ROOT, 'verify', 'out', f'frame-0{f}{suffix}.png')).convert('RGB').resize(ref.size, Image.LANCZOS)
s = ref.size[0] / 2000
box = tuple(int(v * s) for v in (x0, y0, x1, y1))
a, b = ref.crop(box), shot.crop(box)
k = W / a.size[0]
a = a.resize((W, int(a.size[1] * k)), Image.LANCZOS); b = b.resize((W, int(b.size[1] * k)), Image.LANCZOS)
out = Image.new('RGB', (W * 2 + 10, a.size[1]), 'black'); out.paste(a, (0, 0)); out.paste(b, (W + 10, 0))
p = os.path.join(ROOT, 'verify', 'out', f'crop-0{f}{suffix}.png'); out.save(p); print(p)
