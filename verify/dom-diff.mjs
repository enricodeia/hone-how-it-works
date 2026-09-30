// DOM-only regression shots: the WebGL canvas is hidden, so every pixel left is HTML/CSS and must be
// identical before and after a refactor.   node verify/dom-diff.mjs <tag>   -> verify/out/dom/<tag>-v<N>-f<N>.png
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./out/dom/', import.meta.url)); mkdirSync(OUT, { recursive: true })
const tag = process.argv[2] || 'shot'
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const errors = []
for (const [v, n, w, h] of [[1, 9, 1506, 845], [2, 7, 1506, 820]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => errors.push(`v${v} ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errors.push(`v${v} ${m.text()}`) })
  await p.goto(`http://localhost:5230/${v === 2 ? '?v=2' : ''}`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__hone && document.documentElement.className.includes('ready'), null, { timeout: 20000 })
  await p.evaluate(() => { window.__hone.scene.still = true; document.querySelector('canvas').style.visibility = 'hidden' })
  await p.waitForTimeout(3600)
  for (let f = 0; f < n; f++) {
    await p.evaluate((i) => window.__hone.frame(i), f); await p.waitForTimeout(1300)
    // test-only: drop will-change so every layer re-rasterises at its final scale (timing-free pixels)
    await p.addStyleTag({ content: '*, *::before, *::after { will-change: auto !important; }' }); await p.waitForTimeout(250)
    await p.screenshot({ path: `${OUT}${tag}-v${v}-f${f + 1}.png` })
  }
  // the section end + the white section
  await p.evaluate(() => { const h = window.__hone; h.lenis.scrollTo(h.st.end + innerHeight * 0.6, { immediate: true, force: true }) }); await p.waitForTimeout(1300)
  await p.screenshot({ path: `${OUT}${tag}-v${v}-end.png` })
  await p.close()
}
await b.close()
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors')
