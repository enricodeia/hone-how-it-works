// Per-mode cost with the CPU throttled (CDP), as DevTools does to emulate a slower device.
//   node verify/perf-bench.mjs [throttle=6]
import { chromium } from 'playwright'
const rate = +(process.argv[2] || 6)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 } })
await p.goto('http://localhost:5230/?stats=1', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('page--ready'))
await p.waitForTimeout(3200)
await p.evaluate(() => window.__hone.frame(1)); await p.waitForTimeout(1200)
// time the whole per-frame update (simulation + uniforms + markers + draw submission)
await p.evaluate(() => { const sc = window.__hone.scene, up = sc.update.bind(sc); window.__upd = []; sc.update = (dt, t) => { const t0 = performance.now(); up(dt, t); window.__upd.push(performance.now() - t0) } })
const cdp = await p.context().newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate })
const rows = []
for (const n of (process.env.ORDER || '8000,4000,3000,1000').split(',').map(Number)) {
  await p.evaluate((n) => window.__hone.setParticles(n), n); await p.waitForTimeout(800)
  const r = await p.evaluate(async () => {
    const sc = window.__hone.scene; window.__upd.length = 0
    const sims = [], gpus = [], dts = []; let last = performance.now()
    await new Promise((res) => { const t0 = performance.now(); const loop = () => { const now = performance.now(); dts.push(now - last); last = now; sims.push(sc.simMs); if (sc.gpuTimer?.ms != null) gpus.push(sc.gpuTimer.ms); now - t0 < 4000 ? requestAnimationFrame(loop) : res() }; requestAnimationFrame(loop) })
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
    const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)]
    const txt = (q) => document.querySelector(q).textContent
    return { score: txt('[data-perf-score]'), grade: txt('[data-perf-grade]'), sim: avg(sims), update: avg(window.__upd), updateP95: p95(window.__upd), gpu: gpus.length ? avg(gpus) : null, fps: 1000 / avg(dts.slice(5)) }
  })
  rows.push({ n, ...r })
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
await b.close()
console.log(`CPU throttled ${rate}x · Baseline frame (red, density 0.42)`)
console.log('particles  sim ms   update ms  update p95  GPU ms   fps  score')
for (const r of rows) console.log(`${String(r.n).padStart(9)}  ${r.sim.toFixed(2).padStart(6)}   ${r.update.toFixed(2).padStart(8)}  ${r.updateP95.toFixed(2).padStart(10)}  ${r.gpu == null ? '  n/a' : r.gpu.toFixed(2).padStart(6)}  ${r.fps.toFixed(0).padStart(5)}  ${r.score} ${r.grade}`)
const base = rows[0]
for (const r of rows.slice(1)) console.log(`${r.n}: simulation ${(100 * (1 - r.sim / base.sim)).toFixed(0)}% cheaper, whole update ${(100 * (1 - r.update / base.update)).toFixed(0)}% cheaper than 8,000`)
