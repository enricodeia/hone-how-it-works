/*
  The whole sticky section is ONE GSAP timeline (the choreography) driven by ScrollTrigger
  (Lenis smooths the scroll). Positions below are timeline units.

  Experience 1: the timeline is scrubbed directly, 1 unit = 100vh.
  Experience 2: a "drive" timeline plays the choreography segment by segment between the moments
  the right-column text blocks are pinned to, so each block reaches the middle of the screen exactly
  when the left column shows its frame (see src/variants.js).

  Only .to() tweens (or fromTo with immediateRender:false) are used, and every value touched by the
  time-based intro lives on a different property/uniform, so jumping anywhere and scrubbing back is
  always exact.
*/
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export const T = {
  toBaseline: 0.5, baseline: 1.6,
  toBlueprint: 2.2, blueprint: 3.4,
  uiScroll: 3.8,            // 03 -> 04, then a hold on 04
  video: 4.95,              // 04 -> 05
  products: 5.8,            // cards settled by ~6.93, then a hold on 06
  toBuild: 7.35, build: 8.55,
  toBecome: 9.15, become: 10.55,
  toFinal: 11.15, final: 12.35,
  end: 12.95,
}

// phone: the figure slot centre inside the phone box, its width at scale 1, the border
const SLOT_IN_PHONE = { x: 151.5, y: 399.7, w: 254.2 }
const BORDER = 4.5
const SLOT_RATIO = 270.3 / 190.5          // V1 recommendation slot / product card width
const SCROLL = { s04: -254.5, s05: -686.5, s07: -1346 }
const V1_FLOAT = { blood: [454.1, 222.9], apob: [828.3, 434.5], prog: [440.5, 302.7] }

export function buildTimeline({ root, scene, state, geom, content }) {
  const $ = (s) => root.querySelector(s)
  const $$ = (s) => [...root.querySelectorAll(s)]
  const U = scene.U, place = scene.place
  const { APO, IND, MK, PAR } = state
  const split = geom.id === 2                // left-column geometry (landscape experience 2)

  const stage = $('[data-stage]')
  const blocks = $$('[data-step]')
  const lines = blocks.map((b) => [...b.querySelectorAll('[data-line]')])
  const bg = Object.fromEntries($$('[data-bg]').map((el) => [el.dataset.bg, el]))
  const photoImg = bg.photo.querySelector('img')
  const blood = $('[data-card="blood"]'), apob = $('[data-card="apob"]')
  const markers = scene.markers.map((m) => m.el)
  const cta = $('[data-cta]')
  const phone = $('[data-phone]'), content_ = $('[data-phone-content]')
  const appUI = $$('[data-app-ui]')
  const video = $('[data-video]')
  const home = $('[data-phone-home]')
  const slots = $$('[data-slot]')
  const prog = $('[data-product="prog"]'), testo = $('[data-product="testo"]'), estra = $('[data-product="estra"]')
  const glass = $('[data-glass]')
  const panel = $('[data-panel]'), panelImg = panel.querySelector('img')
  const anchorPhone = $('[data-anchor="phone"]')

  // ---------------------------------------------------------------- geometry of this experience
  const HERO = geom.hero
  const PH = geom.phone, k = PH.k
  const O = { x: PH.left + SLOT_IN_PHONE.x, y: PH.top + SLOT_IN_PHONE.y }           // phone transform origin
  const S = geom.scale
  const floatXY = (name) => (geom.cards ? [geom.cards[name].left, geom.cards[name].top] : V1_FLOAT[name])
  // where the landed Progesterone card must end: the recommendation slot, through the phone's scale k
  const slot = content.id === 2 ? { top: 307.9, w: 211.7 } : { top: 268, w: 270.3 }
  const [pfx, pfy] = floatXY('prog')
  const slotVis = {
    x: O.x + (PH.left + BORDER + 14.2 - O.x) * k,
    y: O.y + (PH.top + BORDER + slot.top - O.y) * k,
  }
  const FLY = { x: slotVis.x - pfx, y: slotVis.y - pfy, scale: (slot.w * k) / 190.5, h: 329.8 / SLOT_RATIO }
  // the same card, 0.94x smaller with the phone around its origin, as both leave at Become
  const FLY_OUT = { x: O.x + (slotVis.x - O.x) * 0.94 - pfx, y: O.y + (slotVis.y - O.y) * 0.94 - pfy, scale: FLY.scale * 0.94 }
  const one = { scale: 1, x: 0, y: 0 }
  const at = (s) => ({ ...one, scale: s })

  // a card's contents fade in and out; the figure anchor and decorative layers are not contents
  const parts = (el) => [...el.children].filter((c) => !c.matches('[data-anchor], [data-decor]'))
  // the full backdrop blur of a card is defined in CSS (--frost-max), next to its other frost values
  const frost = (el) => getComputedStyle(el).getPropertyValue('--frost-max').trim() || '22px'

  // ---------------------------------------------------------------- initial states
  lines.forEach((ls, i) => { if (i > 0) gsap.set(ls, { yPercent: 112, opacity: 0 }) })
  gsap.set(phone, {
    x: HERO.cx - O.x, y: HERO.cy - O.y,
    scale: HERO.w / SLOT_IN_PHONE.w, opacity: 0,
    transformOrigin: `${SLOT_IN_PHONE.x}px ${SLOT_IN_PHONE.y}px`,
  })
  gsap.set(appUI, { opacity: 0 })
  gsap.set(content_, { y: 0 })
  gsap.set([blood, apob, prog, testo, estra, glass], { '--ga': 0, '--gb': '0px' })
  ;[blood, apob, prog, testo, estra, glass].forEach((el) => gsap.set(parts(el), { opacity: 0 }))
  gsap.set([prog, testo, estra], { transformOrigin: '0px 0px' })
  gsap.set(markers, { scale: 0 })
  gsap.set(cta, { autoAlpha: 0 })        // hidden = not clickable, not focusable; slides via --cy (CSS)
  gsap.set(panel, { opacity: 0, scale: 0.94 })

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut', duration: 1 } })

  const swapCopy = (from, to, t0) => {
    if (content.id !== 1) return
    tl.to(lines[from], { yPercent: -112, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, t0)
    tl.fromTo(lines[to], { yPercent: 112, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.42, stagger: 0.05, ease: 'power3.out', immediateRender: false }, t0 + 0.28)
  }
  // Cards never animate their own opacity. The frost (backdrop blur + tint) forms on one gentle sine,
  // the box glides up and settles on expo with a slight zoom-in, and the contents fade in a beat later.
  // Contents stay on the 2D path (force3D:false) so images never swap rasterisation when they finish.
  const cardIn = (el, t0, d = 0.85, to = one) => {
    tl.fromTo(el, { '--ga': 0, '--gb': '0px' }, { '--ga': 1, '--gb': frost(el), duration: d * 0.72, ease: 'sine.inOut', immediateRender: false }, t0)
    tl.fromTo(el, { scale: to.scale * 0.965, x: to.x, y: to.y + 26 }, { ...to, duration: d, ease: 'expo.out', immediateRender: false }, t0)
    tl.fromTo(parts(el), { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: d * 0.7, stagger: 0.07, ease: 'sine.out', immediateRender: false, force3D: false }, t0 + d * 0.2)
  }
  // exits mirror the entrance: the frost dissolves on the same curve and ends with the last line of content
  const cardOut = (el, t0, d = 0.5, to = { scale: 0.98, y: -14 }) => {
    const pOut = d * 0.6 + 0.03 * (parts(el).length - 1)
    tl.to(parts(el), { opacity: 0, duration: d * 0.6, stagger: 0.03, ease: 'sine.in', force3D: false }, t0)
    tl.to(el, { '--ga': 0, '--gb': '0px', duration: pOut, ease: 'sine.inOut' }, t0)
    tl.to(el, { ...to, duration: d, ease: 'power2.in' }, t0)
  }
  const bgTo = (name, v, t0, d = 0.8) => { if (name && bg[name]) tl.to(bg[name], { opacity: v, duration: d }, t0) }
  const dustRot = (t0) => tl.to(U, { dustRot: '+=0.22', duration: 1.1, ease: 'sine.inOut' }, t0)
  const B = geom.bg

  // the split experience starts on its own quiet tint
  if (B.start !== 'blue') { gsap.set(bg.blue, { opacity: 0 }); gsap.set(bg[B.start], { opacity: 1 }) }

  // ================================================================ 01 → 02  Baseline
  let t = T.toBaseline
  swapCopy(0, 1, t)
  bgTo(B.start, 0, t)
  bgTo(B.baseline, 1, t + 0.05)
  tl.to(U, { red: 1, density: 0.42, sizeMul: 0.9, duration: 0.8 }, t + 0.1)
  tl.to(U, { dustBlue: 0, dustRed: 1, duration: 0.8 }, t + 0.05)
  dustRot(t)
  const apobAt = content.id === 2 ? t + 0.3 : t + 0.5      // split: the marker card first, the sample after
  const bloodAt = content.id === 2 ? t + 0.95 : t + 0.4
  cardIn(apob, apobAt, 0.85, at(S.apob))
  cardIn(blood, bloodAt, 0.85, at(S.blood))
  const A = content.apob
  tl.to(APO, { ...A.from, markOp: 1, duration: 0.6, ease: 'power2.out' }, apobAt + 0.12)
  tl.to(markers, { scale: 1, duration: 0.5, stagger: 0.06, ease: 'back.out(1.6)' }, t + 0.55)
  if (content.id === 1) tl.to(cta, { autoAlpha: 1, '--cy': '0px', duration: 0.36, ease: 'power2.out' }, t + 0.45)

  // ================================================================ 02 → 03  Blueprint: into the phone
  t = T.toBlueprint
  swapCopy(1, 2, t)
  tl.to(IND, { p: 1, duration: 0.5 }, t + 0.2)
  cardOut(blood, t, 0.5, { scale: S.blood * 0.98, y: -14 })
  cardOut(apob, t + 0.03, 0.5, { scale: S.apob * 0.98, y: -14 })
  tl.to(markers, { scale: 0, duration: 0.22, stagger: 0.02, ease: 'power2.in' }, t)
  bgTo(B.baseline, 0, t, 0.7)
  bgTo(B.blueprint, 1, t + 0.1, 0.9)
  tl.to(U, { dustRed: 0, dustRG: 1, duration: 0.7 }, t + 0.1)
  dustRot(t)
  // the phone starts scaled so its figure slot sits exactly on the hero figure, then zooms out to k
  tl.set(place, { phone: 1 }, t + 0.25)
  tl.to(phone, { x: 0, y: 0, scale: k, duration: 0.95, ease: 'power3.inOut' }, t + 0.25)
  tl.to(phone, { opacity: 1, duration: 0.5, ease: 'power1.out' }, t + 0.25)
  tl.to(appUI, { opacity: 1, duration: 0.4, ease: 'power1.out' }, t + 0.8)
  tl.to(U, { phoneFade: 1, duration: 0.5 }, t + 0.7)
  // the dots shrink with the 0.58 phone scale: give them some weight back inside the screen
  tl.to(U, { sizeMul: 1.15, duration: 0.95, ease: 'power3.inOut' }, t + 0.25)

  // ================================================================ 03 → 04 → 05  scroll inside the UI, the video
  t = T.uiScroll
  tl.to(content_, { y: SCROLL.s04, duration: 0.8, ease: 'power2.inOut' }, t)
  tl.to(anchorPhone, { y: 36, duration: 0.8, ease: 'power2.inOut' }, t)
  t = T.video
  tl.to(content_, { y: SCROLL.s05, duration: 0.7, ease: 'power2.inOut' }, t)
  tl.to(video, { borderRadius: '0px 0px 0px 0px', duration: 0.35, ease: 'power1.in' }, t + 0.35)
  tl.to(U, { alpha: 0, duration: 0.42, ease: 'power1.in' }, t)
  tl.set(U, { scatter: 1 }, t + 0.5)

  // ================================================================ 05 → 06  products arrive
  t = T.products
  cardIn(prog, t, 0.85, at(S.prod))
  cardIn(testo, t + 0.14, 0.85, at(S.prod))
  cardIn(estra, t + 0.28, 0.85, at(S.prod))

  // ================================================================ 06 → 07  Build: the card goes into the UI
  t = T.toBuild
  swapCopy(2, 3, t)
  tl.to(IND, { p: 2, duration: 0.5 }, t + 0.2)
  bgTo(B.blueprint, 0, t)
  bgTo(B.build, 1, t)
  tl.to(U, { dustRG: 0, dustGreen: 1, duration: 0.8 }, t)
  dustRot(t)
  tl.to(content_, { y: SCROLL.s07, duration: 0.85, ease: 'power2.inOut' }, t)
  tl.to(home, { opacity: 0, duration: 0.3 }, t + 0.5)
  cardOut(testo, t, 0.55, { x: -38, scale: S.prod * 0.94 })
  cardOut(estra, t + 0.06, 0.55, { x: -38, scale: S.prod * 0.94 })
  tl.to(PAR, { prog: 0, duration: 0.3 }, t)
  // the card itself becomes the recommendation: no cross-fade, so nothing is ever seen twice.
  // autoRound:false keeps font-size / box / radius continuous (no whole-px snapping mid-flight).
  // Inner targets are the slot's layout / SLOT_RATIO: identical for every slot scale and phone scale.
  const fly = { duration: 0.85, ease: 'power3.inOut', autoRound: false }
  const [pImg, pName, pKind] = parts(prog)
  tl.to(prog, { x: FLY.x, y: FLY.y, scale: FLY.scale, height: FLY.h, borderRadius: 14 / SLOT_RATIO, ...fly }, t + 0.25)
  tl.to(pImg, { left: 23.4 / SLOT_RATIO, top: 21.6 / SLOT_RATIO, width: 223.5 / SLOT_RATIO, height: 223.5 / SLOT_RATIO, ...fly }, t + 0.25)
  tl.to(pName, { left: 25.8 / SLOT_RATIO, top: 256.7 / SLOT_RATIO, fontSize: 25.4 / SLOT_RATIO, ...fly }, t + 0.25)
  tl.to(pKind, { left: 25.8 / SLOT_RATIO, top: 290.6 / SLOT_RATIO, fontSize: 15.6 / SLOT_RATIO, ...fly }, t + 0.25)
  tl.to(slots[1], { opacity: 1, duration: 0.35 }, t + 0.8)

  // ================================================================ 07 → 08  Become: results settle
  t = T.toBecome
  swapCopy(3, 4, t)
  tl.to(IND, { p: 3, duration: 0.5 }, t + 0.2)
  bgTo(B.build, 0, t)
  bgTo(B.become, 1, t)
  tl.to(U, { dustAlpha: 0.15, duration: 0.8 }, t)
  dustRot(t)
  // the phone and the landed card leave together, on the same curve
  const leave = { duration: 0.45, ease: 'power2.in' }
  tl.to(phone, { opacity: 0, scale: k * 0.94, ...leave }, t)
  tl.to(parts(prog), { opacity: 0, ...leave, force3D: false }, t)
  tl.to(prog, { '--ga': 0, '--gb': '0px', ...leave }, t)
  tl.to(prog, { ...FLY_OUT, ...leave }, t)
  tl.set(place, { phone: 0 }, t + 0.46)
  tl.set(U, { phoneFade: 0, sizeMul: 0.9 }, t + 0.46)
  tl.to(U, { alpha: 1, duration: 0.35, ease: 'power1.out' }, t + 0.4)
  tl.to(U, { scatter: 0, duration: 0.85, ease: 'power2.out' }, t + 0.4)
  tl.to(U, { red: 0, green: 1, duration: 0.7 }, t + 0.5)
  const AB = geom.apobBecome
  cardIn(apob, t + 0.6, 0.85, AB)
  tl.to(markers, { scale: 1, duration: 0.5, stagger: 0.06, ease: 'back.out(1.6)' }, t + 0.72)
  tl.to(MK, { green: 1, duration: 0.45 }, t + 1.08)
  tl.to(APO, { ...A.to, green: 1, duration: 0.62, ease: 'power2.inOut' }, t + 1.05)

  // ================================================================ 08 → 09  the photo, the body in the card
  t = T.toFinal
  // the Become UI clears just before the photo arrives, so no empty frost box lingers over it
  cardOut(apob, t - 0.2, 0.36, { scale: AB.scale * 0.98, x: AB.x, y: AB.y - 14 })
  tl.to(markers, { scale: 0, duration: 0.22, stagger: 0.02, ease: 'power2.in' }, t - 0.2)
  tl.to(U, { dustAlpha: 0, duration: 0.4 }, t)
  if (split) {
    // the photo arrives framed in the left column; the glass card forms at its centre
    tl.to(panel, { opacity: 1, scale: 1, duration: 0.7, ease: 'power2.out' }, t)
    tl.fromTo(panelImg, { scale: 1.1 }, { scale: 1, duration: 1.3, ease: 'power2.out', immediateRender: false }, t)
    bgTo(B.become, 0, t + 0.1, 0.6)
  } else {
    tl.to(bg.photo, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, t)
    tl.fromTo(photoImg, { scale: 1.1 }, { scale: 1, duration: 1.3, ease: 'power2.out', immediateRender: false }, t)
    bgTo(B.become, 0, t + 0.4, 0.4)
    tl.to(stage, { '--ink': '#ffffff', '--dot': 'rgba(255,255,255,0.5)', duration: 0.5 }, t + 0.1)
  }
  cardIn(glass, t + 0.2, 0.9, at(S.glass))
  tl.to(place, { card: 1, duration: 0.85, ease: 'power3.inOut' }, t + 0.1)
  // dark -> light crossover of the body happens with the photo, not after it
  tl.to(U, { glow: 1, duration: 0.6, ease: 'power1.out' }, t + 0.05)

  tl.to({}, { duration: Math.max(0.001, T.end - tl.duration()) }, tl.duration())   // closing hold

  // ---------------------------------------------------------------- scroll driver
  // experience 2: holds (a block pinned at the middle, its step playing) alternate with gaps
  // (the block scrolls on, the next arrives, the timeline moves between the two holds)
  let drive = tl, rail = null
  const R = content.rail
  const segs = []                      // { t0, t1, d0, d1 }: timeline span <-> drive span
  if (R) {
    drive = gsap.timeline({ paused: true })
    rail = []
    let d = 0, prevT = 0
    const seg = (t0, t1, w) => {
      drive.add(tl.tweenFromTo(t0, t1, { duration: w, ease: 'none', immediateRender: false }))
      segs.push({ t0, t1, d0: d, d1: d + w }); d += w
    }
    R.blocks.forEach((b, i) => {
      if (i > 0) seg(prevT, b.hold[0], R.gap)
      rail.push({ P: d, H: b.H })
      seg(b.hold[0], b.hold[1], b.H)
      prevT = b.hold[1]
    })
    if (prevT < T.end) seg(prevT, T.end, R.gap * 0.5)
    drive.to({}, { duration: R.tail })   // the finished state, before the section lets go
  }
  // timeline time -> drive time (identity for experience 1)
  const toDrive = (time) => {
    if (!R) return time
    for (const g of segs) {
      if (time <= g.t1) return g.d0 + (g.t1 > g.t0 ? ((Math.max(time, g.t0) - g.t0) / (g.t1 - g.t0)) * (g.d1 - g.d0) : 0)
    }
    return segs.length ? segs[segs.length - 1].d1 : drive.duration()
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const st = ScrollTrigger.create({
    trigger: root.querySelector('[data-section]'),
    start: 'top top',
    end: 'bottom bottom',
    scrub: reduced ? true : 0.5,   // a little inertia on top of Lenis so fast flicks still ease in
    animation: drive,
    invalidateOnRefresh: true,
  })
  return { tl, st, drive, rail, toDrive, length: drive.duration() }
}
