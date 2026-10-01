// Builds the experience into ONE self-contained HTML file: public/export/hone-how-it-works.html
// (served by the site, downloaded by the V panel, which stamps the chosen settings into it).
//
//   node tools/build-standalone.mjs        (runs first inside `npm run build`)
//
// 1. a normal Vite build with a relative base into dist-standalone/
// 2. the JS bundle and the CSS are inlined; fonts and images become data: URIs
// 3. the particle data (figure.bin / figure.json) is put in window.__HONE_ASSETS, which main.js reads
//    before falling back to a fetch, so the file needs no server and no network
import { build } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist-standalone')
const TARGET = join(ROOT, 'public', 'export', 'hone-how-it-works.html')
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.otf': 'font/otf', '.json': 'application/json', '.bin': 'application/octet-stream' }

process.env.BASE_PATH = './'            // relative URLs, so every reference below has one shape
await build({
  root: ROOT,
  logLevel: 'warn',
  build: { outDir: OUT, emptyOutDir: true, copyPublicDir: false, modulePreload: false, cssCodeSplit: false },
})

const pub = (p) => join(ROOT, 'public', p)
const dataUri = (file) => `data:${MIME[extname(file)]};base64,${readFileSync(file).toString('base64')}`
const once = (html, re, fn, what) => {
  let hits = 0
  const res = html.replace(re, (...m) => { hits++; return fn(...m) })
  if (!hits) throw new Error(`build-standalone: ${what} not found in the built index.html`)
  return res
}

let html = readFileSync(join(OUT, 'index.html'), 'utf8')

// preload hints point at files that no longer exist on their own
html = html.replace(/\s*<link rel="preload"[^>]*>/g, '')

// CSS, with its fonts inlined
html = once(html, /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, file) => {
  const css = readFileSync(join(OUT, file), 'utf8')
    .replace(/url\((?:\.\.\/|\.\/)?(fonts\/[^)"']+)\)/g, (_m, font) => `url(${dataUri(pub(font))})`)
  return `<style>${css}</style>`
}, 'stylesheet')

// images
html = once(html, /src="\.\/(assets\/[^"]+\.(?:webp|png))"/g, (_, file) => `src="${dataUri(pub(file))}"`, 'images')

// the particle data + a marker the export panel replaces with the chosen settings, then the app itself
const assets = {
  'data/figure.bin': dataUri(pub('data/figure.bin')),
  'data/figure.json': dataUri(pub('data/figure.json')),
}
const bootstrap = `<script>window.__HONE_STANDALONE=true;window.__HONE_ASSETS=${JSON.stringify(assets)}</script>\n<meta name="hone-config">`
html = once(html, /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, file) => {
  const js = readFileSync(join(OUT, file), 'utf8').replace(/<\/script/gi, '<\\/script')
  return `${bootstrap}\n<script type="module">${js}</script>`
}, 'module script')

// nothing may still point at a file next to the page
const left = html.match(/(?:src|href)="\.\/[^"]+"|url\((?:\.\.\/|\.\/)[^)]+\)/g)
if (left) throw new Error(`build-standalone: unresolved references: ${[...new Set(left)].join(', ')}`)

mkdirSync(dirname(TARGET), { recursive: true })
writeFileSync(TARGET, html)
console.log(`standalone: ${TARGET.replace(ROOT + '/', '')} · ${(statSync(TARGET).size / 1e6).toFixed(2)} MB`)
