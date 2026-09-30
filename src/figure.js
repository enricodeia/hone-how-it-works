/*
  The particle man + ambient dust, one transparent WebGL canvas between the DOM layers.

  World units = CSS px on the z = 0 plane (perspective camera placed so that holds), origin at the
  viewport centre, +y up. The figure's local units are reference px (figure box 439 x 578.5), so
  its group scale is simply  anchorRect.width / 439.

  CPU side (per frame): head + body rotation toward the cursor, and a spring/repel simulation that
  pushes particles away from the pointer. The rotated + displaced positions are uploaded as the
  position attribute. GPU side: assemble/scatter, idle drift, per-state colour, size, round points,
  rounded-rect clip (the phone screen).
*/
import * as THREE from 'three'
import gsap from 'gsap'

const FOV = 20
const REPEL_R = 72          // local units (reference px)
const REPEL_K = 5200
const SPRING = 40
const DAMP = 7.2

/* ------------------------------------------------------------------ shaders */
const figureVert = /* glsl */ `
  attribute vec3 aScatter;
  attribute float aSize;
  attribute vec4 aLook;   // tone, rim, nx, ny
  attribute vec4 aMeta;   // head, rank, kind, v
  uniform float uTime, uScale, uDpr, uCamZ, uSizeMul;
  uniform float uIntro, uScatter, uAlpha, uDensity;
  uniform float uRed, uGreen, uGlow, uPhoneFade;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  varying float vGlow;
  varying float vPx;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    float tone = aLook.x, rim = aLook.y, nx = aLook.z, ny = aLook.w;
    float head = aMeta.x, rank = aMeta.y, kind = aMeta.z, v = aMeta.w;
    float n1 = hash(rank * 917.13 + 3.1);
    float n2 = hash(rank * 311.71 + 9.7);

    // ---- compose / scatter (per-particle stagger) --------------------------------------
    float dIn = 0.5 * (0.55 * rank + 0.45 * v);
    float tIn = smoothstep(dIn, dIn + 0.46, uIntro);
    float dOut = 0.5 * (0.55 * n2 + 0.45 * (1.0 - v));
    float tOut = smoothstep(dOut, dOut + 0.46, uScatter);
    float formed = tIn * (1.0 - tOut);
    float e = 1.0 - pow(1.0 - formed, 3.0);

    vec3 off = aScatter - position;
    float sw = (1.0 - e) * 1.7 * (n1 - 0.5) * 2.0;
    off.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * off.xz;
    vec3 p = position + off * (1.0 - e);

    // idle breathing drift, bigger while travelling
    float amp = 0.55 + 7.0 * (1.0 - e);
    p += vec3(sin(uTime * 0.71 + rank * 40.0), cos(uTime * 0.63 + rank * 31.0), sin(uTime * 0.52 + rank * 17.0)) * amp;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float persp = uCamZ / -mv.z;

    // fill particles fade in with density (rank ordered)
    float fillVis = kind > 0.5 ? smoothstep(rank - 0.06, rank, uDensity) : 1.0;

    float halo = 1.0 + uGlow * 1.6;
    float size = aSize * 0.9 * uScale * uSizeMul * persp;
    size = max(size, 1.05);
    gl_PointSize = size * halo * uDpr * step(0.001, fillVis);
    vPx = gl_PointSize;
    vCore = 1.0 / halo;
    vGlow = uGlow;

    // ---- colour states ------------------------------------------------------------------
    vec3 design = vec3(1.0 - tone);

    float rimA = smoothstep(0.35, 0.92, rim);
    float rimT = smoothstep(0.62, 1.0, rim);
    float side = clamp(nx, -1.0, 1.0);                 // -1 left half .. +1 right half
    float topEdge = smoothstep(0.15, -0.7, ny) * (1.0 - head);
    float fadeB = smoothstep(0.64, 1.0, v);
    float lowGrey = smoothstep(0.46, 0.8, v) * (1.0 - rimA * 0.6);

    float redAmt = rimA * (0.6 + 0.7 * n1) + topEdge * smoothstep(0.2, 0.8, rim) * 0.6;
    redAmt = clamp(redAmt, 0.0, 1.0);
    vec3 innerR = mix(vec3(0.43, 0.20, 0.185), vec3(0.30, 0.18, 0.17), n2);
    vec3 redCol = mix(innerR, vec3(0.86, 0.31, 0.26), redAmt);
    redCol = mix(redCol, vec3(1.0), (1.0 - tone) * 0.35);
    float greenL = smoothstep(-0.3, -0.8, side) * smoothstep(0.38, 0.52, v) * smoothstep(0.45, 0.85, rim) * (1.0 - head);
    redCol = mix(redCol, vec3(0.30, 0.55, 0.26), greenL);
    redCol = mix(redCol, vec3(0.40, 0.37, 0.37), lowGrey * 0.7);
    redCol = mix(redCol, vec3(0.60, 0.55, 0.55), fadeB * 0.85);

    float leftSide = smoothstep(0.25, -0.5, side);
    float neckM = smoothstep(0.24, 0.30, v) * (1.0 - smoothstep(0.36, 0.41, v));
    float gAmt = (smoothstep(0.12, 0.7, rim) * leftSide * (0.8 + 0.5 * n1) + leftSide * 0.22 * n2
                 + topEdge * smoothstep(0.1, 0.6, rim) * 0.9 * leftSide) * (1.0 - 0.85 * neckM)
               + head * smoothstep(-0.15, -0.6, side) * (1.0 - smoothstep(0.14, 0.24, v)) * (0.2 + 0.3 * n1);
    gAmt = clamp(gAmt, 0.0, 1.0);
    vec3 innerG = mix(vec3(0.27), vec3(0.40), n2);
    vec3 greenCol = mix(innerG, vec3(0.29, 0.50, 0.30), gAmt);
    greenCol = mix(greenCol, vec3(0.64, 0.57, 0.57), fadeB * 0.8);

    float centre = 1.0 - smoothstep(35.0, 120.0, abs(position.x));
    float core = (1.0 - rimA) * centre * smoothstep(0.16, 0.3, v) * (1.0 - smoothstep(0.46, 0.7, v));
    vec3 glowG = mix(vec3(0.55, 0.85, 0.52), vec3(0.74, 0.95, 0.70), n1);
    vec3 glowCol = mix(glowG, vec3(1.0, 1.0, 0.98), clamp(core * 1.8 + step(0.64, n2) * 0.9 * (1.0 - 0.7 * leftSide), 0.0, 1.0));
    glowCol = mix(glowCol, vec3(0.86, 0.86, 1.0), smoothstep(0.45, 0.8, v) * smoothstep(-0.1, 0.5, side) * 0.75);
    glowCol = mix(glowCol, vec3(0.2, 0.21, 0.17), centre * smoothstep(0.5, 0.66, v) * (1.0 - rimA) * 0.7);

    vec3 col = design;
    col = mix(col, redCol, uRed);
    col = mix(col, greenCol, uGreen);
    col = mix(col, glowCol, uGlow);
    vColor = col;

    float tinted = clamp(uRed + uGreen + uGlow, 0.0, 1.0);
    float a = uAlpha * fillVis;
    a *= mix(1.0, 1.0 - fadeB * 0.8, tinted);
    a *= 1.0 - uPhoneFade * smoothstep(0.58, 0.86, v);
    a *= 0.3 + 0.7 * e;
    a *= smoothstep(0.0, 0.12, formed + 0.02);
    vAlpha = a;
  }
`

const figureFrag = /* glsl */ `
  uniform vec4 uClip;      // centre.xy, half.xy  (device px, gl_FragCoord space)
  uniform float uClipR, uClipOn;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  varying float vGlow;
  varying float vPx;

  float roundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float aa = clamp(1.6 / max(vPx, 1.0), 0.03, 0.45);   // ~0.8 device px feather: crisp at any size
    float core = 1.0 - smoothstep(vCore - aa, vCore, d);
    float halo = exp(-d * d * 5.0) * vGlow * 0.85;
    float a = max(core, halo) * vAlpha;
    if (uClipOn > 0.001) {
      float sd = roundRect(gl_FragCoord.xy - uClip.xy, uClip.zw, uClipR);
      a *= mix(1.0, 1.0 - smoothstep(-1.0, 1.0, sd), uClipOn);
    }
    if (a < 0.003) discard;
    vec3 col = min(vColor + vec3(0.25) * halo * (1.0 - core), vec3(1.0));
    gl_FragColor = vec4(col * a, a);
  }
`

const dustVert = /* glsl */ `
  attribute float aSize;
  attribute float aSlot;
  attribute float aRank;
  uniform float uU, uDpr, uTime, uRot, uAlpha;
  uniform vec2 uPar, uOff;
  uniform vec4 uPal;        // blue, red, red/green, green weights
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPx;
  void main() {
    vec3 p = position;
    float a = uRot * (0.6 + 0.4 * aRank);
    p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
    p.xy += uPar * (0.4 + p.z / 300.0) * 12.0;
    p *= uU;
    p.xy += uOff;                                   // rings centred on the visual (left column in experience 2)
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.7 + 0.3 * sin(uTime * (0.6 + aRank * 1.4) + aRank * 60.0);
    gl_PointSize = max(aSize * uU, 0.9) * uDpr;
    vPx = gl_PointSize;

    vec3 blue = mix(vec3(0.27, 0.55, 0.90), vec3(1.0), step(0.83, aSlot));
    vec3 red = mix(vec3(0.84, 0.33, 0.29), vec3(0.92, 0.60, 0.56), step(0.72, aSlot));
    vec3 rg = aSlot < 0.62 ? vec3(0.84, 0.36, 0.30) : vec3(0.52, 0.66, 0.31);
    vec3 green = mix(vec3(0.44, 0.69, 0.30), vec3(0.62, 0.80, 0.45), step(0.6, aSlot));
    vec3 col = blue * uPal.x + red * uPal.y + rg * uPal.z + green * uPal.w;
    float w = uPal.x + uPal.y + uPal.z + uPal.w;
    vColor = col / max(w, 0.001);
    vAlpha = uAlpha * tw * (aSize > 2.4 ? 0.8 : 0.9);
  }
`

const dustFrag = /* glsl */ `
  uniform vec4 uEx;
  uniform float uExR, uExOn;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vPx;
  float roundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float aa = clamp(1.6 / max(vPx, 1.0), 0.05, 0.5);
    float a = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    if (uExOn > 0.001) {
      float sd = roundRect(gl_FragCoord.xy - uEx.xy, uEx.zw, uExR);
      a *= 1.0 - uExOn * (1.0 - smoothstep(-2.0, 6.0, sd));
    }
    a *= vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`

function premultiplied(mat) {
  mat.transparent = true
  mat.depthWrite = false
  mat.depthTest = false
  mat.blending = THREE.CustomBlending
  mat.blendEquation = THREE.AddEquation
  mat.blendSrc = THREE.OneFactor
  mat.blendDst = THREE.OneMinusSrcAlphaFactor
  mat.blendSrcAlpha = THREE.OneFactor
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
  return mat
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a, b, t) => a + (b - a) * t
function lerpRect(a, b, t) {
  if (t <= 0) return a
  if (t >= 1) return b
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) }
}
function rectOf(el) {
  const r = el.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }
}

/* ------------------------------------------------------------------ engine */
export class FigureScene {
  constructor({ canvas, meta, data, anchors, screenEl, phoneEl, markerHost }) {
    this.canvas = canvas
    this.meta = meta
    this.anchors = anchors
    this.screenEl = screenEl
    this.phoneEl = phoneEl
    this.markerHost = markerHost

    // tweened state (driven by the scroll timeline and the intro)
    this.U = {
      intro: 0, scatter: 0, alpha: 1, density: 0.3,
      red: 0, green: 0, glow: 0, phoneFade: 0, sizeMul: 1,
      dustAlpha: 1, dustIntro: 1, dustBlue: 1, dustRed: 0, dustRG: 0, dustGreen: 0, dustRot: 0,
    }
    this.place = { phone: 0, card: 0 }
    this.pointer = { x: -1e4, y: -1e4, has: false, inside: false, speed: 0, lx: 0, ly: 0, lt: 0 }
    this.look = { hy: 0, hp: 0, by: 0, bp: 0 }
    this.u = 1
    this.still = false      // verification: freeze the look-at to neutral

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000)

    this.#buildFigure(data)
    this.#buildDust()
    this.#buildMarkers()
    this.resize()
  }

  /* ---------------------------------------------------------------- figure */
  #buildFigure(data) {
    const { count, stride } = this.meta
    this.count = count
    this.base = new Float32Array(count * 3)
    this.head = new Float32Array(count)
    this.off = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    const pos = new Float32Array(count * 3)
    const scatter = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const look = new Float32Array(count * 4)
    const meta4 = new Float32Array(count * 4)
    const rnd = mulberry(11)
    for (let i = 0; i < count; i++) {
      const o = i * stride
      const x = data[o], y = data[o + 1], z = data[o + 2]
      this.base[i * 3] = x; this.base[i * 3 + 1] = y; this.base[i * 3 + 2] = z
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      size[i] = data[o + 3]
      look[i * 4] = data[o + 4]; look[i * 4 + 1] = data[o + 5]; look[i * 4 + 2] = data[o + 6]; look[i * 4 + 3] = data[o + 7]
      this.head[i] = data[o + 8]
      meta4[i * 4] = data[o + 8]; meta4[i * 4 + 1] = data[o + 9]; meta4[i * 4 + 2] = data[o + 10]; meta4[i * 4 + 3] = data[o + 11]
      // scattered start: a wide, flattened shell around the figure
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1)
      const r = 420 + rnd() * 760
      scatter[i * 3] = Math.sin(ph) * Math.cos(th) * r * 1.25
      scatter[i * 3 + 1] = Math.cos(ph) * r * 0.8 + 40
      scatter[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r * 0.55
    }
    const g = new THREE.BufferGeometry()
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.posAttr)
    g.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aLook', new THREE.BufferAttribute(look, 4))
    g.setAttribute('aMeta', new THREE.BufferAttribute(meta4, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000)

    this.figUniforms = {
      uTime: { value: 0 }, uScale: { value: 1 }, uDpr: { value: 1 }, uCamZ: { value: 1000 }, uSizeMul: { value: 1 },
      uIntro: { value: 0 }, uScatter: { value: 0 }, uAlpha: { value: 1 }, uDensity: { value: 0 },
      uRed: { value: 0 }, uGreen: { value: 0 }, uGlow: { value: 0 }, uPhoneFade: { value: 0 },
      uClip: { value: new THREE.Vector4() }, uClipR: { value: 0 }, uClipOn: { value: 0 },
    }
    const mat = premultiplied(new THREE.ShaderMaterial({ uniforms: this.figUniforms, vertexShader: figureVert, fragmentShader: figureFrag }))
    this.figure = new THREE.Points(g, mat)
    this.figure.frustumCulled = false
    this.group = new THREE.Group()
    this.group.add(this.figure)
    this.scene.add(this.group)

    const [hy0, hy1] = this.meta.headY
    this.headW = (y) => smooth(hy1, hy0, y)
    this.neck = this.meta.neck
  }

  /* ---------------------------------------------------------------- dust */
  #buildDust() {
    const rnd = mulberry(29)
    const P = [], S = [], SL = [], RK = []
    const push = (x, y, z, s) => { P.push(x, y, z); S.push(s); SL.push(rnd()); RK.push(rnd()) }
    const kind = () => (rnd() < 0.1 ? 1 : 0)                      // 1 = a slightly larger circle
    const sizeFor = (k) => (k ? 1.9 + rnd() * 0.7 : 0.95 + rnd() * 0.55)
    // concentric, patchy rings around the stage centre
    const rings = [470, 525, 590, 660, 740, 830, 930]
    rings.forEach((R, ri) => {
      const n = Math.round(R * 2.2)
      const ph = rnd() * 10, k = 3 + Math.floor(rnd() * 4)
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        if (Math.sin(a * k + ph) + Math.sin(a * (k + 2) - ph * 0.7) < rnd() * 2.6 - 1.4) continue
        const r = R + (rnd() - 0.5) * 14
        const kk = kind()
        push(Math.cos(a) * r * 1.02, Math.sin(a) * r * 0.8 - 20, (rnd() - 0.5) * 120 + ri * 6, sizeFor(kk))
      }
    })
    // loose scatter across the frame
    for (let i = 0; i < 300; i++) {
      const kk = kind()
      push((rnd() - 0.5) * 1560, (rnd() - 0.5) * 900, (rnd() - 0.5) * 300, sizeFor(kk))
    }
    // small dotted grid patches (the halftone specks in the frames)
    for (let c = 0; c < 16; c++) {
      const gx = (rnd() - 0.5) * 1450, gy = (rnd() - 0.5) * 820
      if (Math.abs(gx) < 260 && Math.abs(gy) < 330) continue
      const cols = 3 + Math.floor(rnd() * 5), rows = 5 + Math.floor(rnd() * 9)
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
        if (rnd() < 0.35) continue
        push(gx + a * 3.3, gy + b * 3.3, 0, 0.95)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1))
    g.setAttribute('aSlot', new THREE.Float32BufferAttribute(SL, 1))
    g.setAttribute('aRank', new THREE.Float32BufferAttribute(RK, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8000)
    this.dustUniforms = {
      uU: { value: 1 }, uDpr: { value: 1 }, uTime: { value: 0 }, uRot: { value: 0 }, uAlpha: { value: 0 },
      uPar: { value: new THREE.Vector2() }, uOff: { value: new THREE.Vector2() }, uPal: { value: new THREE.Vector4(1, 0, 0, 0) },
      uEx: { value: new THREE.Vector4() }, uExR: { value: 0 }, uExOn: { value: 0 },
    }
    const mat = premultiplied(new THREE.ShaderMaterial({ uniforms: this.dustUniforms, vertexShader: dustVert, fragmentShader: dustFrag }))
    this.dust = new THREE.Points(g, mat)
    this.dust.frustumCulled = false
    this.dust.renderOrder = -1
    this.scene.add(this.dust)
    this.dustCount = S.length
  }

  /* ---------------------------------------------------------------- markers (DOM, anchored to the body) */
  #buildMarkers() {
    this.markers = this.meta.markers.map((m) => {
      const el = document.createElement('i')
      el.className = 'markers__dot'
      this.markerHost.appendChild(el)
      return { el, p: m.p, a: m.a, b: m.b }
    })
    this.#tmp = new THREE.Vector3()
  }
  #tmp

  /* ---------------------------------------------------------------- input */
  setPointer(x, y, t) {
    const p = this.pointer
    if (p.has) {
      const dt = Math.max(1, t - p.lt)
      const sp = Math.hypot(x - p.lx, y - p.ly) / dt * 1000
      p.speed = p.speed * 0.8 + sp * 0.2
    }
    p.x = x; p.y = y; p.lx = x; p.ly = y; p.lt = t
    p.has = true; p.inside = true
  }
  leavePointer() { this.pointer.inside = false }

  /* ---------------------------------------------------------------- sizing */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.w = w; this.h = h
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camZ = (h / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    this.camera.position.set(0, 0, this.camZ)
    this.camera.near = 10; this.camera.far = this.camZ * 4
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.figUniforms.uDpr.value = this.dpr
    this.figUniforms.uCamZ.value = this.camZ
    this.dustUniforms.uDpr.value = this.dpr
  }
  setUnit(u) { this.u = u; this.dustUniforms.uU.value = u; this.dustUniforms.uOff.value.set((this.dustX || 0) * u, 0) }
  setDustX(x) { this.dustX = x; this.setUnit(this.u) }

  /* ---------------------------------------------------------------- per frame */
  update(dt, time) {
    dt = Math.min(dt, 1 / 30)
    const U = this.U, W = this.w, H = this.h
    const FU = this.figUniforms, DU = this.dustUniforms

    // everything is measured relative to the canvas: when the section unpins, the canvas scrolls
    // away with the stage, and viewport coordinates would move the figure twice as fast as its card
    const cr = this.canvas.getBoundingClientRect()
    const ox = cr.left, oy = cr.top
    const local = (el) => { const q = rectOf(el); q.cx -= ox; q.cy -= oy; return q }

    // placement: hero -> phone screen -> glass card
    let r = local(this.anchors.hero)
    if (this.place.phone > 0) r = lerpRect(r, local(this.anchors.phone), this.place.phone)
    if (this.place.card > 0) r = lerpRect(r, local(this.anchors.card), this.place.card)
    const s = r.w / this.meta.box[0]
    this.group.position.set(r.cx - W / 2, H / 2 - r.cy, 0)
    this.group.scale.setScalar(s)
    this.figRect = r

    // look-at target from the pointer (relative to the figure centre)
    const p = this.pointer
    this.px = p.x - ox; this.py = p.y - oy
    let tx, ty
    if (this.still) {
      tx = 0; ty = 0
    } else if (p.has) {
      tx = Math.max(-1.3, Math.min(1.3, (this.px - r.cx) / (W * 0.5)))
      ty = Math.max(-1.2, Math.min(1.2, (this.py - (r.cy - r.h * 0.22)) / (H * 0.5)))
    } else {
      tx = Math.sin(time * 0.35) * 0.35
      ty = Math.sin(time * 0.27) * 0.12
    }
    const L = this.look, k = 1 - Math.exp(-dt * 3.4)
    L.hy += (tx * 0.46 - L.hy) * k
    L.hp += (ty * 0.26 - L.hp) * k
    L.by += (tx * 0.17 - L.by) * k
    L.bp += (ty * 0.05 - L.bp) * k
    p.speed *= Math.exp(-dt * 4)

    const visible = U.alpha > 0.004
    if (visible) this.#simulate(dt, r, s)

    // uniforms
    FU.uTime.value = time
    FU.uScale.value = s
    FU.uSizeMul.value = U.sizeMul
    FU.uIntro.value = U.intro
    FU.uScatter.value = U.scatter
    FU.uAlpha.value = U.alpha
    FU.uDensity.value = U.density
    FU.uRed.value = U.red
    FU.uGreen.value = U.green
    FU.uGlow.value = U.glow
    FU.uPhoneFade.value = U.phoneFade

    // clip to the phone screen while the figure lives inside it
    const clipOn = this.place.phone
    FU.uClipOn.value = clipOn
    let phoneOp = 0
    if (clipOn > 0 || this.phoneEl) phoneOp = +gsap.getProperty(this.phoneEl, 'opacity') || 0
    if (clipOn > 0) {
      const sr = this.screenEl.getBoundingClientRect()
      const d = this.dpr
      const top = (sr.width / 298) * 38.3            // island bottom: 10.4 + 27.9 screen px
      FU.uClip.value.set((sr.left - ox + sr.width / 2) * d, (H - (sr.top - oy + (sr.height + top) / 2)) * d, (sr.width / 2) * d, ((sr.height - top) / 2) * d)
      FU.uClipR.value = (sr.width / 298) * 45.5 * d
    }

    // dust
    DU.uTime.value = time
    DU.uAlpha.value = U.dustAlpha * U.dustIntro
    DU.uRot.value = time * 0.012 + U.dustRot
    DU.uPal.value.set(U.dustBlue, U.dustRed, U.dustRG, U.dustGreen)
    const mx = p.has ? (p.x / W - 0.5) : 0, my = p.has ? (p.y / H - 0.5) : 0
    DU.uPar.value.x += (-mx - DU.uPar.value.x) * k
    DU.uPar.value.y += (my - DU.uPar.value.y) * k
    DU.uExOn.value = phoneOp
    if (phoneOp > 0.001) {
      const pr = this.phoneEl.getBoundingClientRect(), d = this.dpr
      DU.uEx.value.set((pr.left - ox + pr.width / 2) * d, (H - (pr.top - oy + pr.height / 2)) * d, (pr.width / 2) * d, (pr.height / 2) * d)
      DU.uExR.value = (pr.width / 307) * 50 * d
    }

    this.#placeMarkers(r, s)
    this.renderer.render(this.scene, this.camera)
  }

  // rotation shared by particles and markers
  #rotate(x, y, z, w, out) {
    const L = this.look
    if (w > 0.0005) {
      const ay = L.hy * w, ap = L.hp * w
      const cy = Math.cos(ay), sy = Math.sin(ay), cp = Math.cos(ap), sp = Math.sin(ap)
      const nx = this.neck[0], ny = this.neck[1]
      let lx = x - nx, ly = y - ny, lz = z
      const x1 = lx * cy + lz * sy, z1 = -lx * sy + lz * cy
      const y2 = ly * cp - z1 * sp, z2 = ly * sp + z1 * cp
      x = x1 + nx; y = y2 + ny; z = z2
    }
    const cy = Math.cos(L.by), sy = Math.sin(L.by), cp = Math.cos(L.bp), sp = Math.sin(L.bp)
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy
    out[0] = x1; out[1] = y * cp - z1 * sp; out[2] = y * sp + z1 * cp
  }

  #simulate(dt, r, s) {
    const p = this.pointer, W = this.w, H = this.h
    const pos = this.posAttr.array, base = this.base, head = this.head, off = this.off, vel = this.vel
    const L = this.look
    // full-head trig once; partial weights recompute
    const hcy = Math.cos(L.hy), hsy = Math.sin(L.hy), hcp = Math.cos(L.hp), hsp = Math.sin(L.hp)
    const bcy = Math.cos(L.by), bsy = Math.sin(L.by), bcp = Math.cos(L.bp), bsp = Math.sin(L.bp)
    const nx = this.neck[0], ny = this.neck[1]
    const mlx = (this.px - r.cx) / s, mly = (r.cy - this.py) / s
    const active = p.inside && this.U.intro > 0.6 && this.U.scatter < 0.05
    const strength = active ? (0.6 + Math.min(p.speed / 1400, 1) * 1.1) : 0
    const R = REPEL_R, R2 = R * R
    const damp = Math.exp(-dt * DAMP)
    const kdt = SPRING * dt
    const n = this.count
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      let x = base[i3], y = base[i3 + 1], z = base[i3 + 2]
      const w = head[i]
      if (w > 0.0005) {
        let cyh = hcy, syh = hsy, cph = hcp, sph = hsp
        if (w < 0.9995) { cyh = Math.cos(L.hy * w); syh = Math.sin(L.hy * w); cph = Math.cos(L.hp * w); sph = Math.sin(L.hp * w) }
        const lx = x - nx, ly = y - ny
        const x1 = lx * cyh + z * syh, z1 = -lx * syh + z * cyh
        const y2 = ly * cph - z1 * sph, z2 = ly * sph + z1 * cph
        x = x1 + nx; y = y2 + ny; z = z2
      }
      const x1 = x * bcy + z * bsy, z1 = -x * bsy + z * bcy
      const ry = y * bcp - z1 * bsp, rz = y * bsp + z1 * bcp
      const rx = x1

      let ox = off[i3], oy = off[i3 + 1], oz = off[i3 + 2]
      let vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2]
      if (strength > 0) {
        const dx = rx + ox - mlx, dy = ry + oy - mly
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 0.001
          let f = 1 - d / R
          f = f * f * strength * REPEL_K * dt
          vx += (dx / d) * f; vy += (dy / d) * f; vz += f * 0.55
        }
      }
      vx = (vx - ox * kdt) * damp; vy = (vy - oy * kdt) * damp; vz = (vz - oz * kdt) * damp
      ox += vx * dt; oy += vy * dt; oz += vz * dt
      off[i3] = ox; off[i3 + 1] = oy; off[i3 + 2] = oz
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz
      pos[i3] = rx + ox; pos[i3 + 1] = ry + oy; pos[i3 + 2] = rz + oz
    }
    this.posAttr.needsUpdate = true
  }

  #placeMarkers(r, s) {
    const v = this.#tmp, out = [0, 0, 0], W = this.w, H = this.h, u = this.u
    // in Become the body sits a little higher in the frame: five markers ride up with it
    const BECOME_DY = [0, 15.7, 15.7, 15.7, 0, 15.7, 15.7]
    this.markers.forEach((m, i) => {
      const [x, y, z] = m.p
      this.#rotate(x, y + BECOME_DY[i] * this.U.green, z + 6, this.headW(y), out)
      // projected on the z = 0 plane: the rotation still moves them, perspective does not push them outward
      v.set(out[0] * s + this.group.position.x, out[1] * s + this.group.position.y, 0)
      v.project(this.camera)
      const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H
      m.el.style.translate = `${px / u}px ${py / u}px`
    })
  }
}
