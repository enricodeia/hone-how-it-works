"""python3 verify/dom-compare.py <baseline tag>[,<baseline tag>...] <candidate tag>

Per-shot regression check of dom-diff.mjs runs. A candidate pixel passes when it lies within +-8 of the
range of the baseline pixels in its 3x3 neighbourhood (union of all baseline runs), so sub-pixel
anti-aliasing jitter from GPU compositing passes, while any real change (a shift of 2 px or more, a
colour, a missing or added element) fails. Reports failing pixels per shot and their bounding box."""
import sys, os, glob
import numpy as np
from PIL import Image
import cv2
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'dom')
bases, cand = sys.argv[1].split(','), sys.argv[2]
k = np.ones((3, 3), np.uint8)
total_bad = 0
for pa in sorted(glob.glob(os.path.join(D, f'{bases[0]}-*.png'))):
    name = os.path.basename(pa)[len(bases[0]) + 1:]
    pc = os.path.join(D, f'{cand}-{name}')
    if not os.path.exists(pc): print(f'{name:12s} MISSING'); total_bad += 1; continue
    B = [np.asarray(Image.open(os.path.join(D, f'{t}-{name}')).convert('RGB')) for t in bases]
    C = np.asarray(Image.open(pc).convert('RGB')).astype(np.int16)
    lo = np.min([cv2.erode(b, k) for b in B], axis=0).astype(np.int16)
    hi = np.max([cv2.dilate(b, k) for b in B], axis=0).astype(np.int16)
    bad = ((C < lo - 8) | (C > hi + 8)).any(axis=2)
    n = int(bad.sum()); total_bad += n
    box = ''
    if n:
        ys, xs = np.nonzero(bad); box = f'  bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}'
    print(f'{name:12s} failing px: {n}{box}')
print('TOTAL FAILING PX', total_bad)
