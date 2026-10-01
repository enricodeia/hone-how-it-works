/*
  Export panel (key V). Never shown unless V is pressed; V again or Esc closes it.

  Downloads the whole experience as ONE self-contained HTML file: the WebGL canvas, the bundled
  scripts (three.js, GSAP, Lenis), the CSS, the fonts, the images and the particle data are all
  inlined, so it runs offline with a double-click. The file is prebuilt by tools/build-standalone.mjs
  (part of npm run build); this panel only stamps the chosen settings into it as window.__HONE_CONFIG.
*/
const EXPORT_PATH = 'export/hone-how-it-works.html'

export function createExportPanel({ root, getState }) {
  const el = root.querySelector('[data-export]')
  const form = el.querySelector('[data-export-form]')
  const status = el.querySelector('[data-export-status]')
  const button = el.querySelector('[data-export-download]')
  const standalone = !!window.__HONE_STANDALONE

  let open = false
  function setOpen(v) {
    open = v
    el.hidden = !v
    if (!v) return
    // start from what is on screen right now
    const s = getState()
    form.elements.experience.value = String(s.variant)
    form.elements.particles.value = String(s.particles)
    form.elements.stats.checked = s.stats
    status.textContent = standalone ? 'This file is already an export: open the site to make a new one.' : ''
    button.disabled = standalone
    el.focus({ preventScroll: true })        // Tab moves into the controls from here
  }

  async function download() {
    const cfg = {
      v: +form.elements.experience.value,
      p: +form.elements.particles.value,
      stats: form.elements.stats.checked,
    }
    button.disabled = true
    status.textContent = 'Preparing the file…'
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}${EXPORT_PATH}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}: the export file is built by "npm run build" (or "npm run build:standalone" in dev)`)
      const html = (await res.text()).replace('<meta name="hone-config">', `<script>window.__HONE_CONFIG=${JSON.stringify(cfg)}</script>`)
      const blob = new Blob([html], { type: 'text/html' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `hone-how-it-works-${cfg.v === 2 ? 'split' : 'centred'}-${cfg.p}.html`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      status.textContent = `Downloaded ${a.download} · ${(blob.size / 1e6).toFixed(1)} MB`
    } catch (e) {
      console.error(e)
      status.textContent = `Could not export. ${e.message}`
    } finally {
      button.disabled = standalone
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); download() })
  el.querySelector('[data-export-close]').addEventListener('click', () => setOpen(false))

  return { toggle: () => setOpen(!open), close: () => setOpen(false), get open() { return open } }
}
