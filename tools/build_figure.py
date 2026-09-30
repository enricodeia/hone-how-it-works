"""
Build the particle man from the reference frame itself.

Reads source-assets/01.png (the "Design your health" frame, 3012x1690 = 1506x845 CSS @2x),
extracts every dot of the figure (position, size, tone), splits merged clusters, adds a
density-matched fill layer for the denser later states, and inflates the silhouette into a
2.5D bust (row ellipses capped by a 2D distance field, smoothed, plus a nose ridge) so the
figure can turn toward the cursor with real parallax.

Output (figure-local units = reference CSS px, origin = figure box centre, +y up):
  public/data/figure.bin   Float32 interleaved, STRIDE floats per particle
  public/data/figure.json  meta: count, stride, layout, box, hero placement, markers, neck
"""
import json, os
import numpy as np
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source-assets', '01.png')
OUT_BIN = os.path.join(ROOT, 'public', 'data', 'figure.bin')
OUT_JSON = os.path.join(ROOT, 'public', 'data', 'figure.json')
DEBUG = os.environ.get('FIG_DEBUG')

rng = np.random.default_rng(7)

im = cv2.imread(SRC)                       # BGR, 2x
H, W = im.shape[:2]
gray = im.mean(axis=2)
sat = im.max(axis=2).astype(int) - im.min(axis=2).astype(int)

# figure region (2x px)
X0, X1, Y0, Y1 = 1000, 2050, 250, 1450
G = gray[Y0:Y1, X0:X1]
SA = sat[Y0:Y1, X0:X1]
local_bg = cv2.dilate(G.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(float)
contrast = local_bg - G
dots = ((contrast > 12) & (SA < 35)).astype(np.uint8)

# ---- silhouette: density of the dot cloud (sparse background dust falls below it) ----
strong = ((contrast > 22) & (SA < 35)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(strong, 8)
keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 5
strong = keep[lab].astype(np.float32)
dens0 = cv2.GaussianBlur(strong, (0, 0), 16)
sil = (dens0 > 0.035).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(sil, 8)
big = 1 + np.argmax(st[1:, 4])
sil = (lab == big).astype(np.uint8)
# fill holes
ff = sil.copy() * 255
mask = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
cv2.floodFill(ff, mask, (0, 0), 128)
sil = ((ff == 255) | (ff == 0)).astype(np.uint8)
# the bottom of the torso fades into light, sparse dots the density test misses:
# carry the torso width of a solid row straight down to the lowest figure dot.
ROW_SOLID = 880
cols = np.nonzero(sil[ROW_SOLID])[0]
tx0, tx1 = cols.min(), cols.max()
low = np.nonzero(dots[:, tx0:tx1 + 1].any(axis=1))[0]
y_bottom = int(low.max())
for y in range(ROW_SOLID, y_bottom + 1):
    sil[y, tx0:tx1 + 1] = 1
sil = cv2.GaussianBlur(sil.astype(np.float32), (0, 0), 4) > 0.5
sil = sil.astype(np.uint8)

ys, xs = np.nonzero(sil)
bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
# box centre in region px (2x)
bcx, bcy = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0
box_w, box_h = (bx1 - bx0) / 2.0, (by1 - by0) / 2.0          # CSS px
print('silhouette box css', round(box_w), round(box_h))

# ---- depth field ---------------------------------------------------------------------
Hs, Ws = sil.shape
dist = cv2.distanceTransform(sil, cv2.DIST_L2, 5)
z_row = np.zeros_like(dist)
half_w_row = np.zeros_like(dist)
centre_row = np.zeros_like(dist)
for y in range(Hs):
    row = sil[y]
    if not row.any():
        continue
    xs_r = np.nonzero(row)[0]
    # split into runs
    splits = np.nonzero(np.diff(xs_r) > 1)[0]
    starts = np.r_[xs_r[0], xs_r[splits + 1]]
    ends = np.r_[xs_r[splits], xs_r[-1]]
    for a, b in zip(starts, ends):
        c = (a + b) / 2.0
        hw = max(1.0, (b - a) / 2.0)
        xx = np.arange(a, b + 1)
        z_row[y, a:b + 1] = np.sqrt(np.maximum(0, hw * hw - (xx - c) ** 2))
        half_w_row[y, a:b + 1] = hw
        centre_row[y, a:b + 1] = c

# body part weights by height (region px, 2x). Neck ~ displayed y 470 -> full 708 -> region 458
yy = np.arange(Hs)[:, None].repeat(Ws, 1).astype(np.float32)
chin_y, shoulder_y = 430.0, 520.0
head_w = 1.0 - np.clip((yy - chin_y) / (shoulder_y - chin_y), 0, 1)
head_w = head_w * head_w * (3 - 2 * head_w)
depth_scale = 0.95 * head_w + 0.42 * (1 - head_w)
z = z_row * depth_scale
# cap by the 2D distance so shoulder tops / every edge roll back smoothly
z = np.minimum(z, 1.35 * np.sqrt(dist * 70.0))
z = cv2.GaussianBlur(z, (0, 0), 9)
z *= sil
# nose ridge + brow + slight eye sockets (face centre from the head run centres)
head_rows = [y for y in range(int(by0), int(chin_y)) if sil[y].any()]
head_cx = float(np.median([centre_row[y][sil[y] > 0].mean() for y in head_rows]))
face_top = by0 + 0.30 * (chin_y - by0)
nose_y = by0 + 0.66 * (chin_y - by0)
gx = (np.arange(Ws)[None, :] - head_cx)
nose = 26.0 * np.exp(-(gx ** 2) / (2 * 11 ** 2) - ((yy - nose_y) ** 2) / (2 * 26 ** 2))
brow = 10.0 * np.exp(-(gx ** 2) / (2 * 40 ** 2) - ((yy - (face_top + 40)) ** 2) / (2 * 14 ** 2))
eyes = -9.0 * (np.exp(-((gx - 30) ** 2) / (2 * 14 ** 2) - ((yy - (face_top + 62)) ** 2) / (2 * 10 ** 2))
               + np.exp(-((gx + 30) ** 2) / (2 * 14 ** 2) - ((yy - (face_top + 62)) ** 2) / (2 * 10 ** 2)))
z = z + (nose + brow + eyes) * head_w * sil

# outward normal (from distance gradient) & rim
dsm = cv2.GaussianBlur(dist, (0, 0), 6)
gy_, gx_ = np.gradient(dsm)
nrm = np.sqrt(gx_ ** 2 + gy_ ** 2) + 1e-6
nx_f = -gx_ / nrm          # outward = against increasing distance
ny_f = -gy_ / nrm
rim_f = 1.0 - np.clip((dist - 6.0) / 80.0, 0, 1)   # silhouette sits ~15px outside the dots, so a wide band

# tone field for fill dots: blurred darkness of the dot pixels
dark = np.clip((255 - G) / 255.0, 0, 1) * dots
dens = cv2.GaussianBlur(dots.astype(np.float32), (0, 0), 9)
tone_f = cv2.GaussianBlur(dark.astype(np.float32), (0, 0), 9) / np.maximum(dens, 1e-3)


def sample(field, x, y):
    xi = int(np.clip(round(x), 0, Ws - 1)); yi = int(np.clip(round(y), 0, Hs - 1))
    return float(field[yi, xi])


def nearest_in_sil(x, y):
    xi = int(np.clip(round(x), 0, Ws - 1)); yi = int(np.clip(round(y), 0, Hs - 1))
    return sil[yi, xi] > 0


# ---- extracted dots ---------------------------------------------------------------------
n, lab, st, cent = cv2.connectedComponentsWithStats(dots, 8)
SINGLE = 34.0
parts = []   # (x, y, radius2x, darkness, kind)
for i in range(1, n):
    area = st[i, 4]
    cx, cy = cent[i]
    if area < 3 or not nearest_in_sil(cx, cy):
        continue
    comp = (lab == i)
    g_min = G[comp].min()
    darkness = float(np.clip((255 - g_min) / 255.0, 0, 1))
    if area > 2.1 * SINGLE:
        kk = int(round(area / SINGLE))
        pts = np.column_stack(np.nonzero(comp)[::-1]).astype(np.float32)
        kk = max(2, min(kk, len(pts)))
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
        _, labels, centers = cv2.kmeans(pts, kk, None, crit, 2, cv2.KMEANS_PP_CENTERS)
        for j in range(kk):
            a = float((labels.ravel() == j).sum())
            parts.append((centers[j][0], centers[j][1], np.sqrt(a / np.pi), darkness, 0))
    else:
        parts.append((cx, cy, np.sqrt(area / np.pi), darkness, 0))

n_main = len(parts)
print('extracted dots', n_main)

# ---- fill dots (hidden in the first frame, fade in for the denser later states) ------------
N_FILL = int(n_main * 1.6)
prob = np.clip(dens / dens.max(), 0, 1) ** 0.8 * sil
flat = prob.ravel() / prob.sum()
idx = rng.choice(flat.size, size=N_FILL, p=flat)
fy, fx = np.divmod(idx, Ws)
for x, y in zip(fx + rng.random(N_FILL) - 0.5, fy + rng.random(N_FILL) - 0.5):
    t = np.clip(sample(tone_f, x, y), 0.05, 1)
    parts.append((x, y, rng.uniform(1.3, 2.6), t, 1))

# ---- pack ----------------------------------------------------------------------------------
STRIDE = 12
buf = np.zeros((len(parts), STRIDE), np.float32)
y_top_css = (by0 - bcy) / 2.0
for i, (x, y, r2, darkness, kind) in enumerate(parts):
    lx = (x - bcx) / 2.0
    ly = -(y - bcy) / 2.0
    zz = sample(z, x, y) / 2.0 + rng.normal(0, 1.6)
    size = r2 if kind == 0 else r2            # CSS diameter ~ radius in 2x px
    buf[i] = [
        lx, ly, zz,
        size,
        darkness,                             # tone (0 light .. 1 dark)
        sample(rim_f, x, y),                  # rim
        sample(nx_f, x, y),                   # outward normal x
        sample(ny_f, x, y),                   # outward normal y (+ = down in image)
        sample(head_w, x, y),                 # head weight
        rng.random(),                         # rank (density / stagger)
        float(kind),                          # 0 extracted, 1 fill
        (y - by0) / (by1 - by0),              # v: 0 head top .. 1 bottom
    ]

# shuffle so rank-ordered fades are spatially uniform
buf = buf[rng.permutation(len(buf))]
os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
buf.tofile(OUT_BIN)

# hero placement (reference viewport 1506x845 CSS)
hero_cx = (X0 + bcx) / 2.0
hero_cy = (Y0 + bcy) / 2.0


def disp_to_local(dx, dy):
    """displayed (2000-wide) coords from 02.png -> figure-local css"""
    s = 3016 / 2000.0
    fx_, fy_ = dx * s / 2.0, dy * s / 2.0
    return [round(fx_ - hero_cx, 2), round(hero_cy - fy_, 2)]


markers = [
    # anchor (figure-local), baseline colour, become colour
    {'p': disp_to_local(1007, 275), 'a': 'blue', 'b': 'blue'},
    {'p': disp_to_local(1032, 492), 'a': 'green', 'b': 'green'},
    {'p': disp_to_local(933, 619), 'a': 'blue', 'b': 'blue'},
    {'p': disp_to_local(1075, 644), 'a': 'red', 'b': 'green'},
    {'p': disp_to_local(796, 731), 'a': 'green', 'b': 'green'},
    {'p': disp_to_local(943, 752), 'a': 'red', 'b': 'green'},
    {'p': disp_to_local(1006, 848), 'a': 'red', 'b': 'green'},
]
for m in markers:   # give each marker the depth of the surface under it
    rx = m['p'][0] * 2 + bcx
    ry = -m['p'][1] * 2 + bcy
    m['p'].append(round(sample(z, rx, ry) / 2.0, 2))

meta = {
    'count': int(len(buf)), 'stride': STRIDE, 'mainCount': n_main,
    'layout': ['x', 'y', 'z', 'size', 'tone', 'rim', 'nx', 'ny', 'head', 'rank', 'kind', 'v'],
    'box': [round(box_w, 2), round(box_h, 2)],
    'ref': [1506, 845],
    'hero': [round(hero_cx, 2), round(hero_cy, 2)],
    'neck': [round((head_cx - bcx) / 2.0, 2), round(-(chin_y + 40 - bcy) / 2.0, 2)],
    # head weight is 1 above headY[0] (chin) and 0 below headY[1] (shoulder line), smoothstep between
    'headY': [round(-(chin_y - bcy) / 2.0, 2), round(-(shoulder_y - bcy) / 2.0, 2)],
    'markers': markers,
}
with open(OUT_JSON, 'w') as f:
    json.dump(meta, f, indent=1)
print(json.dumps({k: meta[k] for k in ('count', 'mainCount', 'box', 'hero', 'neck')}))

if DEBUG:
    dbg = os.path.join(ROOT, 'verify', 'out')
    os.makedirs(dbg, exist_ok=True)
    zv = (z / max(1e-3, z.max()) * 255).astype(np.uint8)
    cv2.imwrite(os.path.join(dbg, 'depth.png'), cv2.applyColorMap(zv, cv2.COLORMAP_INFERNO))
    cv2.imwrite(os.path.join(dbg, 'sil.png'), sil * 255)
