// Screenshot every reference frame at the reference viewport (1506 x 845 @2x) and report console errors.
//   node verify/shots.mjs            -> verify/out/frame-01.png .. frame-09.png
//   node verify/shots.mjs 3 5        -> only frames 3 and 5
//   URL=http://localhost:5230 W=1506 H=845 node verify/shots.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('./out/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const URL_ = process.env.URL || 'http://localhost:5230/'
const W = +(process.env.W || 1506), H = +(process.env.H || 845)
const only = process.argv.slice(2).map(Number).filter(Boolean)
const frames = only.length ? only : [1, 2, 3, 4, 5, 6, 7, 8, 9]
const suffix = process.env.SUFFIX || ''

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__hone && document.documentElement.classList.contains('is-ready'), null, { timeout: 20000 })
await page.evaluate(() => { window.__hone.scene.still = true })
await page.waitForTimeout(3600)   // let the intro finish composing the figure

for (const f of frames) {
  await page.evaluate((i) => window.__hone.frame(i), f - 1)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}frame-0${f}${suffix}.png` })
  const probe = await page.evaluate(() => {
    const h = window.__hone
    return { t: +h.tl.time().toFixed(3), fps: Math.round(1 / Math.max(1e-3, (window.__dt || 0))), U: Object.fromEntries(Object.entries(h.scene.U).filter(([k]) => k !== "_gsap").map(([k, v]) => [k, +(+v).toFixed(3)])), place: { phone: +h.scene.place.phone.toFixed(3), card: +h.scene.place.card.toFixed(3) } }
  })
  console.log(`frame ${f}`, JSON.stringify(probe))
}
if (errors.length) { console.log('--- console'); errors.forEach((e) => console.log(e)) } else console.log('--- no console errors')
await browser.close()
