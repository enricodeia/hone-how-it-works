// Z/X/C particle budget, performance monitor, V export panel, and the exported file opened from disk.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./out/features/', import.meta.url)); mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1506, height: 845 }, acceptDownloads: true })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await p.goto(process.env.URL || 'http://localhost:5230/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('page--ready'))
await p.waitForTimeout(3200)
const vis = () => p.evaluate(() => ({ monitor: !document.querySelector('[data-perf]').hidden, panel: !document.querySelector('[data-export]').hidden, count: window.__hone.scene.count, draw: window.__hone.scene.figure.geometry.drawRange.count, url: location.search }))
const log = (k, v) => console.log(k.padEnd(34), JSON.stringify(v))
log('start (nothing pressed)', await vis())
await p.keyboard.press('Meta+b'); await p.keyboard.press('Control+b'); log('after Cmd+B / Ctrl+B', await vis())
await p.keyboard.press('b'); log('after B', await vis())
await p.screenshot({ path: `${OUT}panel.png` })
await p.keyboard.press('b'); log('after B again', await vis())
await p.keyboard.press('b'); await p.keyboard.press('Escape'); log('after B, Esc', await vis())

// particle budgets + measurements at frame 1 (red Baseline) with the monitor on
await p.evaluate(() => window.__hone.frame(1)); await p.waitForTimeout(1200)
const bench = {}
for (const key of ['z', 'x', 'c', 'v']) {
  await p.keyboard.press(key); await p.waitForTimeout(2600)            // let the 2 s score window fill
  const m = await p.evaluate(async () => {
    const h = window.__hone, sc = h.scene
    const sims = [], gpus = [], frames = []
    let lastT = performance.now()
    await new Promise((res) => {
      const t0 = performance.now()
      const loop = () => { const now = performance.now(); frames.push(now - lastT); lastT = now; sims.push(sc.simMs); if (sc.gpuTimer && sc.gpuTimer.ms != null) gpus.push(sc.gpuTimer.ms); if (now - t0 < 3000) requestAnimationFrame(loop); else res() }
      requestAnimationFrame(loop)
    })
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
    const txt = (s) => document.querySelector(s).textContent
    return { count: sc.count, draw: sc.figure.geometry.drawRange.count, simMs: +avg(sims).toFixed(3), gpuMs: gpus.length ? +avg(gpus).toFixed(3) : 'n/a', fps: Math.round(1000 / avg(frames.slice(5))),
      shown: { score: txt('[data-perf-score]'), grade: txt('[data-perf-grade]'), cost: txt('[data-perf-cost]'), note: txt('[data-perf-note]'), count: txt('[data-perf-count]'), sim: txt('[data-perf-sim]'), gpu: txt('[data-perf-gpu]'), calls: txt('[data-perf-calls]'), active: [...document.querySelectorAll('[data-perf-mode]')].filter((e) => e.classList.contains('perf-monitor__mode--active')).map((e) => e.dataset.perfMode) },
      url: location.search }
  })
  bench[key] = m; log(`key ${key.toUpperCase()}`, m)
  await p.screenshot({ path: `${OUT}mode-${key}.png` })
}
await p.keyboard.press('s'); log('after S', await vis())
await p.keyboard.press('s'); log('after S again', await vis())

// export: V, pick experience 2 + 4,000 + monitor, download
await p.keyboard.press('x')
await p.keyboard.press('b')
// click the pills, like a user (the native radios are visually hidden)
await p.click('label:has(input[name="experience"][value="2"])'); await p.click('label:has(input[name="particles"][value="4000"])'); await p.click('label:has(input[name="stats"])')
log('panel choices', await p.evaluate(() => { const f = document.querySelector('[data-export-form]').elements; return { experience: f.experience.value, particles: f.particles.value, stats: f.stats.checked } }))
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-export-download]')])
const file = `${OUT}${dl.suggestedFilename()}`; await dl.saveAs(file)
await p.waitForTimeout(300)
log('download', { name: dl.suggestedFilename(), status: await p.textContent('[data-export-status]') })
console.log(errors.length ? 'SITE ERRORS ' + errors.join(' | ') : 'site: no errors')

// the exported file, from disk, offline
const q = await ctx.newPage(); const errs2 = []
q.on('pageerror', (e) => errs2.push(e.message)); q.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()) })
q.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs2.push('NETWORK ' + r.url()) })
await q.goto('file://' + file)
await q.waitForFunction(() => window.__hone && document.documentElement.classList.contains('page--ready'), null, { timeout: 20000 })
await q.waitForTimeout(3400)
log('exported file', await q.evaluate(() => ({ variant: window.__hone.variant, split: document.documentElement.classList.contains('page--split'), count: window.__hone.scene.count, monitor: !document.querySelector('[data-perf]').hidden, panelHidden: document.querySelector('[data-export]').hidden, standalone: !!window.__HONE_STANDALONE })))
for (const i of [0, 3, 6]) { await q.evaluate((i) => window.__hone.frame(i), i); await q.waitForTimeout(1100); await q.screenshot({ path: `${OUT}export-f${i}.png` }) }
await q.keyboard.press('b'); log('exported file: B', await q.evaluate(() => ({ panel: !document.querySelector('[data-export]').hidden, status: document.querySelector('[data-export-status]').textContent, disabled: document.querySelector('[data-export-download]').disabled })))
console.log(errs2.length ? 'EXPORT ERRORS ' + errs2.join(' | ') : 'exported file: no errors, no network requests')
await b.close()
