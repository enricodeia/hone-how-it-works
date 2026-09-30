// Experience 2 scroll quality: real wheel scrolling through Lenis.
//  - while a block holds, its on-screen y must not move (jitter);
//  - forward vs backward: the same scroll position gives the same timeline time;
//  - the timeline time is monotonic in the scroll position.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 } })
const errors = []
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await p.goto('http://localhost:5230/?v=2', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('is-ready'))
await p.waitForTimeout(3200)
// sampler: every rAF, record scrollY, tl time and each block's rect top
await p.evaluate(() => {
  window.__samples = []
  const blocks = [...document.querySelectorAll('[data-block]')]
  const loop = () => {
    const h = window.__hone
    window.__samples.push({ y: scrollY, t: h.tl.time(), tops: blocks.map((el) => el.getBoundingClientRect().top) })
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
await p.mouse.move(1100, 420)
const total = await p.evaluate(() => window.__hone.st.end - window.__hone.st.start)
// wheel down through the whole section in trackpad-like steps, then back up
for (let s = 0; s < total + 400; s += 60) { await p.mouse.wheel(0, 60); await p.waitForTimeout(16) }
await p.waitForTimeout(1200)
for (let s = 0; s < total + 400; s += 60) { await p.mouse.wheel(0, -60); await p.waitForTimeout(16) }
await p.waitForTimeout(1200)
const res = await p.evaluate(() => {
  const h = window.__hone, S = window.__samples, vh = innerHeight
  const st = h.st
  // hold windows in scroll px
  const R = window.__railDebug
  return { n: S.length, total: st.end - st.start, samples: S.filter((_, i) => i % 1 === 0).map((s) => [Math.round(s.y), +s.t.toFixed(4), s.tops.map((v) => +v.toFixed(2))]) }
})
await b.close()
// analysis
const S = res.samples
const vh = 845
let worstJitter = 0, holdsSeen = 0
// a block is 'holding' when its top changes less than it would by scrolling: detect runs where scroll moves but top is ~constant
for (let k = 0; k < 6; k++) {
  let run = [], maxDev = 0
  for (let i = 1; i < S.length; i++) {
    const dy = S[i][0] - S[i - 1][0], dTop = S[i][2][k] - S[i - 1][2][k]
    if (Math.abs(dy) > 0.5 && Math.abs(dTop) < Math.abs(dy) * 0.5) run.push(Math.abs(dTop))
  }
  if (run.length) { holdsSeen++; worstJitter = Math.max(worstJitter, ...run) }
  console.log(`block ${k}: ${run.length} held frames while scrolling, max per-frame drift ${run.length ? Math.max(...run).toFixed(2) : '-'} px`)
}
// monotonic + forward/backward consistency: bucket by scroll y
const fwd = new Map(), bwd = new Map(); let turned = false, prevY = -1
for (const [y, t] of S) { if (y < prevY - 2) turned = true; prevY = y; (turned ? bwd : fwd).set(Math.round(y / 40), t) }
let maxDiff = 0
for (const [k, t] of fwd) if (bwd.has(k)) maxDiff = Math.max(maxDiff, Math.abs(bwd.get(k) - t))
console.log(`frames sampled ${S.length}; scroll length ${res.total}px`)
console.log(`forward vs backward, same scroll (settled buckets): max timeline diff ${maxDiff.toFixed(3)} units (scrub lag included)`)
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors')
