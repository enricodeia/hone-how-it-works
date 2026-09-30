// The section end: scroll past the last frame and check the figure stays inside the glass card.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./out/', import.meta.url))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 }, deviceScaleFactor: 1 })
await p.goto('http://localhost:5230/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('page--ready'))
await p.evaluate(() => { window.__hone.scene.still = true }); await p.waitForTimeout(3400)
const files = []
for (const extra of [0, 0.25, 0.5, 0.75]) {
  const info = await p.evaluate((extra) => {
    const h = window.__hone
    const y = h.st.end + extra * innerHeight
    h.lenis.scrollTo(y, { immediate: true, force: true })
    return y
  }, extra)
  await p.waitForTimeout(900)
  const m = await p.evaluate(() => {
    const h = window.__hone, card = document.querySelector('[data-anchor="card"]').getBoundingClientRect()
    const c = document.querySelector('[data-gl]').getBoundingClientRect(), fr = h.scene.figRect
    return { cardCy: Math.round(card.top + card.height / 2), figCyViewport: Math.round(fr.cy + c.top), canvasTop: Math.round(c.top) }
  })
  console.log(`+${extra}vh`, JSON.stringify(m))
  const f = `${OUT}end-${extra}.png`; await p.screenshot({ path: f }); files.push(f)
}
await b.close()
execFileSync('python3', ['-c', `
import sys; from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f).convert('RGB').resize((700,393)) for f in fs]
out=Image.new('RGB',(700*len(ims)+8*(len(ims)-1),393),'black')
for i,im in enumerate(ims): out.paste(im,(i*708,0))
out.save(sys.argv[1])`, `${OUT}end-strip.png`, ...files])
