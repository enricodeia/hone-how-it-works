// Strict hold stability (frames entirely inside a hold) + static forward/backward consistency.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 } })
await p.goto('http://localhost:5230/?v=2', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('page--ready'))
await p.waitForTimeout(3200)
const holds = await p.evaluate(() => {
  const h = window.__hone, vh = innerHeight
  // P/H from the layout: a block holds while (scroll - start)/vh is inside [P, P+H]
  const blocks = [...document.querySelectorAll('[data-block]')]
  return blocks.map((el, i) => ({ i }))
})
await p.evaluate(() => {
  window.__s = []
  const blocks = [...document.querySelectorAll('[data-block]')]
  const loop = () => { window.__s.push({ y: scrollY, tr: blocks.map((el) => el.style.transform), tops: blocks.map((el) => el.getBoundingClientRect().top) }); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
})
await p.mouse.move(1100, 420)
const total = await p.evaluate(() => window.__hone.st.end - window.__hone.st.start)
for (let s = 0; s < total + 300; s += 45) { await p.mouse.wheel(0, 45); await p.waitForTimeout(16) }
await p.waitForTimeout(1000)
const S = await p.evaluate(() => window.__s)
// strictly held: this frame and the previous both have a non-empty transform that changed, and scroll moved
const drift = [0, 0, 0, 0, 0, 0].map(() => [])
for (let i = 2; i < S.length; i++) {
  const dy = S[i].y - S[i - 1].y
  if (Math.abs(dy) < 0.5) continue
  for (let k = 0; k < 6; k++) {
    const inHold = (j) => S[j].tr[k] && S[j].tr[k] !== S[j - 1].tr[k]
    if (inHold(i) && inHold(i - 1) && S[i + 1] && S[i + 1].tr[k] !== S[i].tr[k]) drift[k].push(Math.abs(S[i].tops[k] - S[i - 1].tops[k]))
  }
}
drift.forEach((d, k) => {
  const bad = d.filter((v) => v > 0.6).length
  console.log(`block ${k}: ${d.length} frames strictly inside the hold, max drift ${d.length ? Math.max(...d).toFixed(2) : '-'} px, frames > 0.6px: ${bad}`)
})
// static forward/backward: jump, settle, read the timeline time
const pts = Array.from({ length: 24 }, (_, i) => Math.round((i / 23) * total))
const read = async (y) => { await p.evaluate((y) => { const h = window.__hone; h.lenis.scrollTo(h.st.start + y, { immediate: true, force: true }) }, y); await p.waitForTimeout(900); return p.evaluate(() => window.__hone.tl.time()) }
const f = [], r = []
for (const y of pts) f.push(await read(y))
for (const y of [...pts].reverse()) r.unshift(await read(y))
let maxd = 0, mono = true
for (let i = 0; i < pts.length; i++) { maxd = Math.max(maxd, Math.abs(f[i] - r[i])); if (i && f[i] < f[i - 1] - 1e-6) mono = false }
console.log(`static forward vs backward over 24 positions: max diff ${maxd.toFixed(5)} units; monotonic: ${mono}`)
console.log('times', f.map((v) => v.toFixed(2)).join(' '))
await b.close()
