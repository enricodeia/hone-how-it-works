import '@fortawesome/fontawesome-svg-core/styles.css'
import './styles.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { icon, config as faConfig } from '@fortawesome/fontawesome-svg-core'
import { faEnvelope, faCartShopping } from '@fortawesome/pro-light-svg-icons'
import { FigureScene } from './figure.js'
import { buildTimeline, T, FRAMES } from './timeline.js'

faConfig.autoAddCss = false
gsap.registerPlugin(ScrollTrigger)

const REF_W = 1506, REF_H = 845
const root = document
const html = document.documentElement
const stage = root.querySelector('[data-stage]')
const section = root.querySelector('.hiw')
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ------------------------------------------------------------------ layout unit
let unit = 1
function layout() {
  const vw = html.clientWidth, vh = window.innerHeight
  const portrait = vw / vh < 0.9
  // portrait: fit a 560-wide column, but never taller than ~1000 ref px (tablets, near-square windows)
  unit = portrait ? Math.min(vw / 560, vh / 1000) : Math.min(vw / REF_W, vh / REF_H)
  html.style.setProperty('--u', unit)
  html.style.setProperty('--fw', vw / unit)
  html.style.setProperty('--fh', vh / unit)
  html.classList.toggle('is-portrait', portrait)
}
layout()
section.style.setProperty('--len', T.end + 1)

// ------------------------------------------------------------------ icons
root.querySelector('[data-fa="envelope"]').insertAdjacentHTML('afterbegin', icon(faEnvelope).html.join(''))
root.querySelector('[data-fa="cart"]').insertAdjacentHTML('afterbegin', icon(faCartShopping).html.join(''))

// ------------------------------------------------------------------ boot
async function boot() {
  const [meta, buf] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/figure.json`).then((r) => r.json()),
    fetch(`${import.meta.env.BASE_URL}data/figure.bin`).then((r) => r.arrayBuffer()),
    document.fonts.load('400 49.5px Ashcroft'),
    document.fonts.load('500 18px Ashcroft'),
    document.fonts.load('400 17.5px Friedel'),
  ])

  const scene = new FigureScene({
    canvas: root.querySelector('[data-gl]'),
    meta,
    data: new Float32Array(buf),
    anchors: {
      hero: root.querySelector('[data-anchor="hero"]'),
      phone: root.querySelector('[data-anchor="phone"]'),
      card: root.querySelector('[data-anchor="card"]'),
    },
    screenEl: root.querySelector('[data-screen]'),
    phoneEl: root.querySelector('[data-phone]'),
    markerHost: root.querySelector('[data-markers]'),
  })
  scene.setUnit(unit)

  // UI state driven by the timeline, rendered every frame
  const state = {
    APO: { num: 0, fill: 0, mark: 0, markOp: 0, green: 0 },
    IND: { p: 0 },
    MK: { green: 0 },
    PAR: { on: 1, prog: 1 },
  }
  const { tl, st } = buildTimeline({ root, scene, state })
  if (reduced) { state.PAR.on = 0; scene.still = true }

  // ---------------------------------------------------------------- smooth scroll
  const lenis = new Lenis({ lerp: reduced ? 1 : 0.095, smoothWheel: !reduced, wheelMultiplier: 0.9 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // ---------------------------------------------------------------- pointer
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 }
  window.addEventListener('pointermove', (e) => {
    scene.setPointer(e.clientX, e.clientY, performance.now())
    mouse.x = e.clientX / window.innerWidth - 0.5
    mouse.y = e.clientY / window.innerHeight - 0.5
  }, { passive: true })
  html.addEventListener('pointerleave', () => scene.leavePointer())
  // a finger lifts: stop aiming the look-at and the parallax at the last touch point
  const releaseTouch = (e) => {
    if (e.pointerType !== 'touch') return
    scene.leavePointer(); scene.pointer.has = false; mouse.x = 0; mouse.y = 0
  }
  window.addEventListener('pointerup', releaseTouch, { passive: true })
  window.addEventListener('pointercancel', releaseTouch, { passive: true })
  window.addEventListener('blur', () => scene.leavePointer())

  // ---------------------------------------------------------------- per-frame UI render
  const apoNum = root.querySelector('[data-apob-num]')
  const apoUnit = root.querySelector('[data-apob-unit]')
  const apoArrow = root.querySelector('[data-apob-arrow]')
  const apoFill = root.querySelector('[data-apob-fill]')
  const apoMark = root.querySelector('[data-apob-mark]')
  const gapA = root.querySelector('[data-apob-gap="a"]')
  const gapsB = root.querySelectorAll('[data-apob-gap="b"], [data-apob-gap="c"]')
  const dots = [...root.querySelectorAll('[data-dot]')]
  const labels = [...root.querySelectorAll('[data-label]')]
  const floats = [...root.querySelectorAll('.float')].map((el) => ({ el, par: +el.dataset.par || 1, fly: el.hasAttribute('data-fly') }))
  // red -> green through OKLCH (a clean warm-to-green arc, not the muddy khaki of an RGB blend)
  const oklch = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : `color-mix(in oklch, ${a}, ${b} ${(t * 100).toFixed(1)}%)`)
  const COLORS = { blue: '#87b7ee', green: '#8fbf6d', red: '#da4f49' }
  let lastNum = -1, lastUnit = ''

  function renderUI(dt) {
    const { APO, IND, MK, PAR } = state
    // ApoB card
    const n = Math.round(APO.num)
    if (n !== lastNum) { apoNum.textContent = String(n); lastNum = n }
    const unitTxt = APO.green > 0.5 ? 'pg/mL' : 'mg/dL'
    if (unitTxt !== lastUnit) { apoUnit.textContent = unitTxt; lastUnit = unitTxt }
    apoUnit.style.opacity = String(Math.min(1, Math.abs(APO.green - 0.5) * 4))   // swaps while invisible
    const markCol = oklch('#da4f49', '#8fbf6d', APO.green)
    apoFill.style.width = `${APO.fill * 100}%`
    apoFill.style.background = oklch('#c8524d', '#8fbf6d', APO.green)
    apoMark.style.left = `${APO.mark * 100}%`
    apoMark.style.opacity = APO.markOp
    apoMark.style.color = markCol
    apoArrow.style.rotate = `${-90 * APO.green}deg`
    apoArrow.style.borderTopColor = markCol
    apoArrow.style.scale = String(1 - APO.green * 0.18)
    gapA.style.left = `${APO.fill * 100}%`
    gapA.style.opacity = APO.fill > 0.02 ? String(1 - APO.green) : '0'
    gapsB.forEach((g) => { g.style.opacity = String(APO.green) })

    // markers colour
    scene.markers.forEach((m) => { m.el.style.background = oklch(COLORS[m.a], COLORS[m.b], MK.green) })

    // step indicator: a fixed, tight rail; the active item grows into a bar and the label rides with it
    // (the bar steps down ~6 ref px per step, as in the frames)
    const GAP = 2.5, DOT = 3.5, BAR = 14.5, TOP = -17.75
    const hs = dots.map((_, i) => { const w = Math.max(0, 1 - Math.abs(i - IND.p)); return DOT + (BAR - DOT) * w })
    let y = 0; const ys = []
    hs.forEach((h, i) => { ys.push(y + h / 2); y += h + GAP })
    const lo = Math.floor(IND.p), hi = Math.min(3, lo + 1), f = IND.p - lo
    const centre = ys[lo] + (ys[hi] - ys[lo]) * f
    dots.forEach((d, i) => {
      const w = Math.max(0, 1 - Math.abs(i - IND.p))
      d.style.height = `${hs[i]}px`
      d.style.top = `${TOP + ys[i] - hs[i] / 2}px`
      d.style.background = w > 0.01 ? `color-mix(in srgb, var(--ink) ${Math.round(w * 100)}%, var(--dot))` : 'var(--dot)'
    })
    labels.forEach((l, i) => {
      const w = Math.max(0, 1 - Math.abs(i - IND.p) * 2.5)     // one label at a time, never superimposed
      l.style.opacity = w
      l.style.translate = `0 calc(-50% + ${TOP + centre + (i - IND.p) * 10}px)`
    })

    // mouse parallax on the floating cards
    const k = 1 - Math.exp(-dt * 4)
    mouse.sx += (mouse.x - mouse.sx) * k
    mouse.sy += (mouse.y - mouse.sy) * k
    floats.forEach((f) => {
      const amt = PAR.on * (f.fly ? PAR.prog : 1) * f.par
      f.el.style.translate = `${mouse.sx * -22 * amt}px ${mouse.sy * -14 * amt}px`
    })
  }

  // ---------------------------------------------------------------- intro: the figure composes itself
  const introLines = [...root.querySelectorAll('.copy__block[data-step="0"] .ln > span')]
  const eyebrow = root.querySelector('.copy .copy__eyebrow')
  const steps = root.querySelector('[data-steps]')
  if (reduced) {
    scene.U.intro = 1; scene.U.dustIntro = 1
  } else {
    scene.U.dustIntro = 0
    gsap.to(scene.U, { intro: 1, duration: 2.9, ease: 'power2.out', delay: 0.15 })
    gsap.to(scene.U, { dustIntro: 1, duration: 1.8, ease: 'power1.out' })
    gsap.from(introLines, { y: 40, duration: 1.1, stagger: 0.07, ease: 'power3.out', delay: 0.5 })
    gsap.from([eyebrow, steps], { opacity: 0, duration: 0.9, ease: 'power1.out', delay: 0.4 })
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now()
  gsap.ticker.add(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    const r = stage.getBoundingClientRect()
    if (r.bottom <= 0) return            // stage scrolled away: idle
    renderUI(dt)
    scene.update(dt, gsap.ticker.time)
  })

  // ---------------------------------------------------------------- resize
  // Layout + canvas follow every resize at once; the ScrollTrigger refresh is debounced and the scroll
  // progress is restored after it, so a resize or rotation never jumps to another step. Toolbar-only
  // height changes on touch devices are ignored (as GSAP itself does).
  let rz, keep = null, lastW = html.clientWidth, lastH = window.innerHeight
  window.addEventListener('resize', () => {
    const w = html.clientWidth, h = window.innerHeight
    if (ScrollTrigger.isTouch === 1 && w === lastW && Math.abs(h - lastH) < h * 0.25) return
    lastW = w; lastH = h
    if (keep === null) keep = st.progress
    layout(); scene.setUnit(unit); scene.resize()
    clearTimeout(rz)
    rz = setTimeout(() => {
      ScrollTrigger.refresh()
      lenis.scrollTo(st.start + keep * (st.end - st.start), { immediate: true, force: true })
      keep = null
    }, 250)
  })
  ScrollTrigger.refresh()

  // ---------------------------------------------------------------- hooks (verification + dev)
  const scrollToTime = (t) => {
    const y = st.start + (t / tl.duration()) * (st.end - st.start)
    lenis.scrollTo(y, { immediate: true, force: true })
    ScrollTrigger.update()
    return y
  }
  window.__hone = { tl, st, scene, state, lenis, T, FRAMES, scrollToTime, frame: (i) => scrollToTime(FRAMES[i]) }

  if (import.meta.env.DEV) {
    const ov = document.createElement('div')
    ov.className = 'ref-overlay'
    document.body.appendChild(ov)
    let refIdx = 0
    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return
      if (e.key >= '1' && e.key <= '9') { refIdx = +e.key - 1; scrollToTime(FRAMES[refIdx]); ov.style.backgroundImage = `url("${encodeURI('/@fs' + __REF_DIR__)}/0${refIdx + 1}.png")` }
      if (e.key === 'o' || e.key === 'O') { ov.classList.toggle('is-on'); ov.style.backgroundImage = `url("${encodeURI('/@fs' + __REF_DIR__)}/0${refIdx + 1}.png")` }
    })
  }
  html.classList.add('is-ready')
}

// if anything fails (no WebGL, a missing file) show the composed copy instead of a half-built page
boot().catch((e) => { console.error(e); html.classList.add('is-ready', 'no-gl') })
