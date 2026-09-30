"""Side-by-side (reference | build) and a 50% overlay for each frame.
   python3 verify/compare.py [frames...]  -> verify/out/cmp-0N.png, verify/out/ovl-0N.png"""
import sys, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'verify', 'out')
frames = [int(a) for a in sys.argv[1:]] or list(range(1, 10))
suffix = os.environ.get('SUFFIX', '')
for f in frames:
    ref = Image.open(os.path.join(ROOT, 'source-assets', f'0{f}.png')).convert('RGB')
    shot_p = os.path.join(OUT, f'frame-0{f}{suffix}.png')
    if not os.path.exists(shot_p):
        continue
    shot = Image.open(shot_p).convert('RGB').resize(ref.size, Image.LANCZOS)
    w, h = ref.size
    s = 1000 / w
    a = ref.resize((1000, int(h * s)), Image.LANCZOS)
    b = shot.resize((1000, int(h * s)), Image.LANCZOS)
    cmp_ = Image.new('RGB', (2010, a.size[1]), 'black')
    cmp_.paste(a, (0, 0)); cmp_.paste(b, (1010, 0))
    cmp_.save(os.path.join(OUT, f'cmp-0{f}{suffix}.png'))
    Image.blend(ref, shot, 0.5).resize((1500, int(h * 1500 / w)), Image.LANCZOS).save(os.path.join(OUT, f'ovl-0{f}{suffix}.png'))
    print('ok', f)
