/*
  The whole sticky section is ONE GSAP timeline scrubbed by ScrollTrigger (Lenis smooths the scroll).
  1 timeline unit = 100vh of scroll. Positions below are in those units.

  Only .to() tweens (or fromTo with immediateRender:false) are used, and every value touched by the
  time-based intro lives on a different property/uniform, so jumping anywhere and scrubbing back is
  always exact.
*/
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export const T = {
  toBaseline: 0.5, baseline: 1.6,
  toBlueprint: 2.2, blueprint: 3.4,
  uiScroll: 3.8, video: 4.6,
  products: 5.6,
  toBuild: 7.0, build: 8.2,
  toBecome: 8.8, become: 10.2,
  toFinal: 10.8, final: 12.0,
  end: 12.6,
}

// timeline positions that reproduce each reference frame (01..09)
export const FRAMES = [0.25, 1.95, 3.6, 4.6, 5.45, 6.7, 8.5, 10.5, 12.3]

// phone geometry (reference px) used for the zoom-out hand-off and the card flight
const HERO = { cx: 760.5, cy: 435.25, w: 439 }
const PHONE_ANCHOR = { cx: 751, cy: 490.2, w: 254.2 }
// the Progesterone card flies from its float (440.5, 302.7, 190.5 x 238.7) onto the in-phone slot
// (618.2, 363, 270.3 x 329.8) with a top-left origin, morphing its inner layout into the slot's
const FLY = { x: 618.2 - 440.5, y: 363 - 302.7, scale: 270.3 / 190.5, h: 329.8 / (270.3 / 190.5) }
const SCROLL = { s03: 0, s04: -254.5, s05: -686.5, s07: -1346 }

export function buildTimeline({ root, scene, state }) {
  const $ = (s) => root.querySelector(s)
  const $$ = (s) => [...root.querySelectorAll(s)]
  const U = scene.U, place = scene.place
  const { APO, IND, MK, PAR } = state

  const stage = $('[data-stage]')
  const blocks = $$('.copy__block')
  const lines = blocks.map((b) => [...b.querySelectorAll('.ln > span')])
  const bg = Object.fromEntries($$('[data-bg]').map((el) => [el.dataset.bg, el]))
  const photoImg = bg.photo.querySelector('img')
  const blood = $('[data-card="blood"]'), apob = $('[data-card="apob"]')
  const markers = scene.markers.map((m) => m.el)
  const cta = $('[data-cta]')
  const phone = $('[data-phone]'), content = $('[data-phone-content]')
  const appUI = $$('[data-app-ui]')
  const video = $('[data-video]'), videoImg = video.querySelector('img')
  const slots = $$('[data-slot]')
  const prog = $('[data-product="prog"]'), testo = $('[data-product="testo"]'), estra = $('[data-product="estra"]')
  const glass = $('[data-glass]')
  const anchorPhone = $('[data-anchor="phone"]')

  // card contents (the figure anchor and the glass bloom are not contents)
  const parts = (el) => [...el.children].filter((c) => !c.matches('.anchor, .glass__bloom'))
  const frost = (el) => (el.classList.contains('glass') ? '34px' : el.classList.contains('pcard') ? '14px' : '22px')

  // ---------------------------------------------------------------- initial states
  lines.forEach((ls, i) => { if (i > 0) gsap.set(ls, { yPercent: 112, opacity: 0 }) })
  gsap.set(phone, {
    x: HERO.cx - PHONE_ANCHOR.cx, y: HERO.cy - PHONE_ANCHOR.cy,
    scale: HERO.w / PHONE_ANCHOR.w, opacity: 0,
    transformOrigin: '151.5px 399.7px',
  })
  gsap.set(appUI, { opacity: 0 })
  gsap.set(content, { y: 0 })
  gsap.set([blood, apob, prog, testo, estra, glass], { '--ga': 0, '--gb': '0px' })
  ;[blood, apob, prog, testo, estra, glass].forEach((el) => gsap.set(parts(el), { opacity: 0 }))
  gsap.set(prog, { transformOrigin: '0px 0px' })
  gsap.set(markers, { scale: 0 })
  gsap.set(cta, { opacity: 0, y: 10 })
  gsap.set(videoImg, { scale: 1.08, transformOrigin: '50% 30%' })

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut', duration: 1 } })

  const swapCopy = (from, to, at) => {
    tl.to(lines[from], { yPercent: -112, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, at)
    tl.fromTo(lines[to], { yPercent: 112, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.42, stagger: 0.05, ease: 'power3.out', immediateRender: false }, at + 0.28)
  }
  // cards: the frost forms (tint + backdrop blur) on a gentle sine while the box glides up and
  // settles on expo with a slight zoom-in; the contents fade in a beat later, one after another
  const cardIn = (el, at, d = 0.85) => {
    // the blur arrives first (edges behind soften at once), then the tint settles over it
    tl.fromTo(el, { '--gb': '0px' }, { '--gb': frost(el), duration: d * 0.34, ease: 'power2.out', immediateRender: false }, at)
    tl.fromTo(el, { '--ga': 0 }, { '--ga': 1, duration: d * 0.72, ease: 'sine.inOut', immediateRender: false }, at)
    tl.fromTo(el, { scale: 0.965, y: 26 }, { scale: 1, y: 0, duration: d, ease: 'expo.out', immediateRender: false }, at)
    tl.fromTo(parts(el), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: d * 0.7, stagger: 0.07, ease: 'sine.out', immediateRender: false }, at + d * 0.2)
  }
  const cardOut = (el, at, d = 0.5, to = { scale: 0.98, y: -14 }) => {
    tl.to(parts(el), { opacity: 0, duration: d * 0.6, stagger: 0.03, ease: 'sine.in' }, at)
    tl.to(el, { '--gb': '0px', duration: d * 0.6, ease: 'power1.out' }, at + d * 0.1)
    tl.to(el, { '--ga': 0, duration: d * 0.8, ease: 'power2.in' }, at + d * 0.2)
    tl.to(el, { ...to, duration: d, ease: 'power2.in' }, at)
  }
  const dustRot = (at) => tl.to(U, { dustRot: '+=0.22', duration: 1.1, ease: 'sine.inOut' }, at)

  // ================================================================ 01 → 02  Baseline
  let t = T.toBaseline
  swapCopy(0, 1, t)
  tl.to(bg.blue, { opacity: 0, duration: 0.8 }, t)
  tl.to(bg.pink, { opacity: 1, duration: 0.8 }, t + 0.05)
  tl.to(U, { red: 1, density: 0.42, sizeMul: 0.9, duration: 0.8 }, t + 0.1)
  tl.to(U, { dustBlue: 0, dustRed: 1, duration: 0.8 }, t + 0.05)
  dustRot(t)
  cardIn(blood, t + 0.4)
  cardIn(apob, t + 0.5)
  tl.to(APO, { num: 155, fill: 0.74, mark: 0.68, markOp: 1, duration: 0.6, ease: 'power2.out' }, t + 0.62)
  tl.to(markers, { scale: 1, duration: 0.5, stagger: 0.06, ease: 'back.out(1.6)' }, t + 0.55)
  tl.to(cta, { opacity: 1, y: 0, duration: 0.36, ease: 'power2.out' }, t + 0.45)

  // ================================================================ 02 → 03  Blueprint: into the phone
  t = T.toBlueprint
  swapCopy(1, 2, t)
  tl.to(IND, { p: 1, duration: 0.5 }, t + 0.2)
  cardOut(blood, t)
  cardOut(apob, t + 0.03)
  tl.to(markers, { scale: 0, duration: 0.22, stagger: 0.02, ease: 'power2.in' }, t)
  tl.to(bg.pink, { opacity: 0, duration: 0.7 }, t)
  tl.to(U, { dustRed: 0, dustRG: 1, duration: 0.7 }, t + 0.1)
  dustRot(t)
  // the phone starts scaled so its figure slot sits exactly on the hero figure, then zooms out
  tl.set(place, { phone: 1 }, t + 0.25)
  tl.to(phone, { x: 0, y: 0, scale: 1, duration: 0.95, ease: 'power3.inOut' }, t + 0.25)
  tl.to(phone, { opacity: 1, duration: 0.5, ease: 'power1.out' }, t + 0.25)
  tl.to(appUI, { opacity: 1, duration: 0.4, ease: 'power1.out' }, t + 0.8)
  tl.to(U, { phoneFade: 1, duration: 0.5 }, t + 0.7)

  // ================================================================ 03 → 04 → 05  scroll inside the UI, the video
  t = T.uiScroll
  tl.to(content, { y: SCROLL.s04, duration: 0.8, ease: 'power2.inOut' }, t)
  tl.to(anchorPhone, { y: 36, duration: 0.8, ease: 'power2.inOut' }, t)
  t = T.video
  tl.to(content, { y: SCROLL.s05, duration: 0.7, ease: 'power2.inOut' }, t)
  tl.to(video, { borderRadius: '0px 0px 0px 0px', duration: 0.35, ease: 'power1.in' }, t + 0.35)
  tl.to(U, { alpha: 0, duration: 0.42, ease: 'power1.in' }, t)
  tl.set(U, { scatter: 1 }, t + 0.5)
  tl.to(videoImg, { scale: 1, duration: 2.2, ease: 'none' }, t)

  // ================================================================ 05 → 06  products arrive
  t = T.products
  cardIn(prog, t)
  cardIn(testo, t + 0.14)
  cardIn(estra, t + 0.28)

  // ================================================================ 06 → 07  Build: the card goes into the UI
  t = T.toBuild
  swapCopy(2, 3, t)
  tl.to(IND, { p: 2, duration: 0.5 }, t + 0.2)
  tl.to(bg.sky, { opacity: 1, duration: 0.8 }, t)
  tl.to(U, { dustRG: 0, dustGreen: 1, duration: 0.8 }, t)
  dustRot(t)
  tl.to(content, { y: SCROLL.s07, duration: 0.85, ease: 'power2.inOut' }, t)
  cardOut(testo, t, 0.55, { x: -38, scale: 0.94 })
  cardOut(estra, t + 0.06, 0.55, { x: -38, scale: 0.94 })
  tl.to(PAR, { prog: 0, duration: 0.3 }, t)
  // the card itself becomes the recommendation: no cross-fade, so nothing is ever seen twice
  const fly = { duration: 0.85, ease: 'power3.inOut' }
  const [pImg, pName, pKind] = parts(prog)
  tl.to(prog, { x: FLY.x, y: FLY.y, scale: FLY.scale, height: FLY.h, borderRadius: 14 / FLY.scale, ...fly }, t + 0.25)
  tl.to(pImg, { left: 23.4 / FLY.scale, top: 21.6 / FLY.scale, width: 223.5 / FLY.scale, height: 223.5 / FLY.scale, ...fly }, t + 0.25)
  tl.to(pName, { left: 25.8 / FLY.scale, top: 256.7 / FLY.scale, fontSize: 24.2 / FLY.scale, ...fly }, t + 0.25)
  tl.to(pKind, { left: 25.8 / FLY.scale, top: 290.6 / FLY.scale, fontSize: 15.2 / FLY.scale, ...fly }, t + 0.25)
  tl.to(slots[1], { opacity: 1, duration: 0.35 }, t + 0.8)

  // ================================================================ 07 → 08  Become: results settle
  t = T.toBecome
  swapCopy(3, 4, t)
  tl.to(IND, { p: 3, duration: 0.5 }, t + 0.2)
  tl.to(bg.sky, { opacity: 0, duration: 0.8 }, t)
  tl.to(bg.become, { opacity: 1, duration: 0.8 }, t)
  tl.to(U, { dustAlpha: 0.45, duration: 0.8 }, t)
  dustRot(t)
  tl.to(phone, { opacity: 0, scale: 0.94, duration: 0.45, ease: 'power2.in' }, t)
  cardOut(prog, t, 0.45, { x: 751 + (618.2 - 751) * 0.94 - 440.5, y: 490.2 + (363 - 490.2) * 0.94 - 302.7, scale: FLY.scale * 0.94 })
  tl.set(place, { phone: 0 }, t + 0.46)
  tl.set(U, { phoneFade: 0 }, t + 0.46)
  tl.to(U, { alpha: 1, duration: 0.35, ease: 'power1.out' }, t + 0.4)
  tl.to(U, { scatter: 0, duration: 0.85, ease: 'power2.out' }, t + 0.4)
  tl.to(U, { red: 0, green: 1, duration: 0.7 }, t + 0.5)
  cardIn(apob, t + 0.6)
  tl.to(markers, { scale: 1, duration: 0.5, stagger: 0.06, ease: 'back.out(1.6)' }, t + 0.72)
  tl.to(MK, { green: 1, duration: 0.45 }, t + 1.08)
  tl.to(APO, { num: 70, fill: 0.333, mark: 0.135, green: 1, duration: 0.62, ease: 'power2.inOut' }, t + 1.05)

  // ================================================================ 08 → 09  the photo, the body in the card
  t = T.toFinal
  tl.to(bg.photo, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, t)
  tl.fromTo(photoImg, { scale: 1.1 }, { scale: 1, duration: 1.3, ease: 'power2.out', immediateRender: false }, t)
  tl.to(bg.become, { opacity: 0, duration: 0.4 }, t + 0.4)
  tl.to(U, { dustAlpha: 0, duration: 0.4 }, t)
  tl.to(stage, { '--ink': '#ffffff', '--dot': 'rgba(255,255,255,0.5)', duration: 0.5 }, t + 0.1)
  cardOut(apob, t)
  tl.to(markers, { scale: 0, duration: 0.22, stagger: 0.02, ease: 'power2.in' }, t)
  cardIn(glass, t + 0.2, 0.9)
  tl.to(place, { card: 1, duration: 0.85, ease: 'power3.inOut' }, t + 0.2)
  tl.to(U, { glow: 1, duration: 0.7 }, t + 0.35)

  tl.to({}, { duration: Math.max(0.001, T.end - tl.duration()) }, tl.duration())   // closing hold

  const st = ScrollTrigger.create({
    trigger: root.querySelector('.hiw'),
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5,          // a little inertia on top of Lenis so fast flicks still ease in
    animation: tl,
    invalidateOnRefresh: true,
  })
  return { tl, st }
}
