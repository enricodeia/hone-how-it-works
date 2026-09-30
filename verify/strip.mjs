// Filmstrip of timeline times: node verify/strip.mjs name t1 t2 t3 ...  -> verify/out/strip-<name>.png (via PIL)
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
const OUT = fileURLToPath(new URL('./out/strip/', import.meta.url)); mkdirSync(OUT, { recursive: true })
const [name, ...ts] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1506, height: 845 }, deviceScaleFactor: 1 })
await p.goto(process.env.URL || 'http://localhost:5230/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__hone && document.documentElement.classList.contains('is-ready'))
await p.evaluate(() => { window.__hone.scene.still = true }); await p.waitForTimeout(3400)
const files = []
for (const t of ts) { await p.evaluate((t) => window.__hone.scrollToTime(+t), t); await p.waitForTimeout(1100); const f = `${OUT}${name}-${t}.png`; await p.screenshot({ path: f }); files.push(f) }
await b.close()
execFileSync('python3', ['-c', `
import sys; from PIL import Image, ImageDraw
fs=sys.argv[2:]; ims=[Image.open(f).convert('RGB') for f in fs]; w=560; h=int(ims[0].size[1]*w/ims[0].size[0])
cols=min(4,len(ims)); rows=(len(ims)+cols-1)//cols; out=Image.new('RGB',(cols*w,rows*h),'white'); d=ImageDraw.Draw(out)
for i,(im,f) in enumerate(zip(ims,fs)):
  x,y=(i%cols)*w,(i//cols)*h; out.paste(im.resize((w,h)),(x,y)); d.text((x+8,y+6),'t='+f.rsplit('-',1)[1][:-4],fill='black')
out.save(sys.argv[1])`, `${OUT}../strip-${name}.png`, ...files])
console.log(`verify/out/strip-${name}.png`)
