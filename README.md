# Hone · How it works

A sticky scroll section rebuilt from nine reference frames (`source-assets/01.png` … `09.png`).
A man made of round particles composes himself, looks at the cursor and scatters on hover, then
travels through **Baseline → Blueprint → Build → Become** on one GSAP ScrollTrigger timeline.

**Live:** https://enricodeia.github.io/hone-how-it-works/

```bash
npm install        # needs the Font Awesome Pro token in ~/.npmrc
npm run dev        # http://localhost:5230
npm run deploy     # build + publish dist/ to the gh-pages branch (GitHub Pages)
npm run shots      # screenshots of the 9 frames -> verify/out/frame-0N.png (dev server running)
python3 verify/compare.py   # reference | build side by side -> verify/out/cmp-0N.png
npm run figure     # rebuild the particle man from source-assets/01.png
```

**Two experiences**, switch with keys **`1`** and **`2`** (or `?v=2` in the URL):

- **1** the original: the animation centred, the copy on the left (`source-assets/01–09.png`).
- **2** split: the humanoid and the whole animation in a sticky **left column**, a **right column of
  text that scrolls** (`source-assets/b/01–07.png`). Each text block reaches the middle of the screen,
  holds there while its step plays on the left, then scrolls on as the next arrives; the timeline is
  stretched per segment between those holds, so text and animation never drift, forwards or backwards.
  On phones the visual stays centred and the blocks pass over it as frosted cards.

Dev keys: `Shift`+`1`–`9` jump to each reference frame of the current experience, `O` toggles the
reference overlay at 50%. Checks: `VARIANT=2 npm run shots`, `node verify/scrolltest2.mjs`
(hold stability + forward/backward consistency with real wheel scrolling).

## Code conventions

- **BEM** for every class: `block`, `block__element` (always one level), `block--modifier`.
  Placement goes on the parent's element, appearance on the block (a mix):
  `<div class="app__slot product product--in-app">`. Page-wide states are modifiers of `.page` on
  `<html>`: `page--ready`, `page--split` (experience 2), `page--portrait`, `page--fallback` (no WebGL).
  The full rules are at the top of `src/styles.css`.
- **Classes style, `data-*` attributes drive JavaScript.** No script selects by class name; values the
  scripts need from CSS are custom properties (e.g. `--frost-max`, the backdrop blur of each card).
- **`npm run lint:bem`** checks every class in `index.html`, `src/styles.css` and `src/*.js` against those
  rules (names, modifiers without a base, elements outside their block, dead or cross-block selectors,
  JS selecting by class).
- **Refactor safety net:** `node verify/dom-diff.mjs <tag>` shoots the DOM layers (canvas hidden) at every
  reference frame of both experiences, and `python3 verify/dom-compare.py <base>,<base2> <tag>` diffs them
  with a 1 px tolerance for compositing jitter.

## How it is put together

| Layer (bottom → top) | What |
|---|---|
| `.backdrop` | tinted blob layers per step (blue, pink, sky, become, v2*) and the Main bg photo |
| `.frame--under` | the framed photo (experience 2), the `health-card` and the `phone` with its `app` |
| `canvas.particles` | three.js: the particle man + the ambient dust |
| `.frame--over` | markers, the floating cards (`sample`, `reading`, `product`), `story` copy, `stepper`, `cta` |
| `.chapters` | experience 2 only: the scrolling right column |

- **Reference px.** Everything inside `.frame` is written in the px of the 1506 × 845 viewport the
  frames were captured at, and scaled by `--u`, so the layout lands on the screenshots at any size.
- **The particle man** (`tools/build_figure.py`) is extracted from `01.png`: every dot of the
  figure (position, size, tone), merged clusters split with k-means, plus a density-matched fill
  layer for the denser later states. The silhouette is inflated into a 2.5D bust (row ellipses
  capped by a distance field, a nose ridge) so the head can turn toward the cursor with real depth.
- **`src/figure.js`**: CPU side does the head + body look-at and a spring/repel simulation (particles
  move away from the pointer and spring back); GPU side does the assemble/scatter, the colour states
  (grey → red rims → green left rim → white/green glow), round points and the rounded-rect clip to the
  phone screen. The figure's placement follows DOM anchors: hero → phone slot → glass card.
- **`src/timeline.js`**: one timeline, 1 unit = 100vh of scroll. `FRAMES` holds the timeline time of
  each reference frame. The phone starts scaled so its figure slot sits exactly on the hero figure,
  then zooms out; the Progesterone card flies into the recommendations slot and hands off with a
  crossfade; Become re-assembles the body and settles ApoB from 155 (red, 74%) to 70 (green, 33%).
- **Hooks**: `window.__hone = { tl, st, scene, state, lenis, T, FRAMES, scrollToTime(t), frame(i) }`,
  `scene.still = true` freezes the look-at for deterministic screenshots.

Fonts: Ashcroft Test (serif, every title and the phone UI serif) and Friedel Pro Trial (text).
Icons in the phone header: Font Awesome Pro Light. `source-assets/` holds the reference frames and
is only read in dev (overlay) and by the figure builder.
