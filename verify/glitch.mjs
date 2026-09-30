// DPR-2 crops of card regions during their entrances: node verify/glitch.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./out/glitch/', import.meta.url)); mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 }, deviceScaleFactor: 2 })
await p.goto('http://localhost:5230/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('is-ready'))
await p.evaluate(() => { window.__hone.scene.still = true }); await p.waitForTimeout(3400)
const shots = [
  ['blood', [1.0, 1.1, 1.2, 1.3, 1.45, 1.6], { x: 440, y: 210, width: 220, height: 300 }],
  ['prog', [5.85, 5.95, 6.05, 6.2, 6.35, 6.7], { x: 430, y: 290, width: 215, height: 265 }],
  ['testo', [5.98, 6.08, 6.2, 6.35, 6.5, 6.8], { x: 860, y: 115, width: 215, height: 265 }],
  ['fly', [7.65, 7.9, 8.15, 8.35, 8.6, 9.0], { x: 420, y: 280, width: 500, height: 440 }],
]
for (const [name, ts, clip] of shots) {
  const files = []
  for (const t of ts) {
    await p.evaluate((t) => window.__hone.scrollToTime(t), t); await p.waitForTimeout(1000)
    const f = `${OUT}${name}-${t}.png`; await p.screenshot({ path: f, clip }); files.push(f)
  }
  execFileSync('python3', ['-c', `
import sys; from PIL import Image, ImageDraw
fs=sys.argv[2:]; ims=[Image.open(f).convert('RGB') for f in fs]; w,h=ims[0].size
out=Image.new('RGB',(w*len(ims)+6*(len(ims)-1),h+24),'white'); d=ImageDraw.Draw(out)
for i,(im,f) in enumerate(zip(ims,fs)): out.paste(im,(i*(w+6),24)); d.text((i*(w+6)+4,4),'t='+f.rsplit('-',1)[1][:-4],fill='black')
out.save(sys.argv[1])`, `${OUT}../glitch-${name}.png`, ...files])
}
await b.close(); console.log('ok')
