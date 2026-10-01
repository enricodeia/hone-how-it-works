/*
  Performance monitor (top right). Hidden until a particle key (Z / X / C / V) or S is pressed, or the
  page is opened with ?stats=1.

  Three stats.js graphs (the panel class that ships with three.js) plus a live score and the numbers:
    FPS  frames per second
    CPU  ms per frame spent in the particle simulation (the part that scales with the particle count)
    GPU  ms per frame the GPU spends drawing the canvas, measured with a WebGL2 timer query
         (EXT_disjoint_timer_query_webgl2; Chrome/Edge/Firefox. Safari has no timer queries: "n/a")

  Performance score, 0-100, over the last ~2 seconds, from stable measurements only:
    load (70 pts)    the median JS cost of the effect per frame (UI, simulation, draw submission)
                     against a budget of a fifth of the display's frame (3.3 ms at 60 Hz, 1.7 ms at
                     120 Hz): a common ceiling for a decorative scroll effect, leaving the rest of the
                     frame to the browser and the page
    smooth (30 pts)  real FPS against the display's refresh rate, minus dropped frames (a frame longer
                     than 1.5x the refresh interval)
  Grades: 90+ excellent · 75+ good · 55+ fair · below heavy.

  The GPU time is shown but NOT scored. Measured on Apple GPUs it swings 0.5-1.7 ms between runs of the
  same particle count (the GPU drops its clock when lightly loaded, so a timer query measures time,
  not work); scoring it would rank the modes at random. The CPU numbers track the count consistently.
*/
import Stats from 'three/addons/libs/stats.module.js'

/* Times the GPU work between begin() and end() without stalling: results are read a few frames later. */
export class GpuTimer {
  constructor(gl) {
    this.gl = gl
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    this.pending = []
    this.active = null
    this.ms = null
    this.enabled = false
  }
  get supported() { return !!this.ext }
  begin() {
    if (!this.enabled || !this.ext || this.active || this.pending.length > 4) return
    this.active = this.gl.createQuery()
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active)
  }
  end() {
    if (!this.active) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push(this.active)
    this.active = null
    this.#poll()
  }
  #poll() {
    const gl = this.gl
    while (this.pending.length) {
      const q = this.pending[0]
      const ready = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT)     // the GPU was interrupted: discard
      if (!ready && !disjoint) break
      if (ready && !disjoint) this.ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6
      gl.deleteQuery(q)
      this.pending.shift()
    }
  }
}

export const SCORE = { budgetShare: 0.2, loadWeight: 70, smoothWeight: 30, windowMs: 2000 }
// [minimum score, label, modifier class] (class names written out in full, so they can be searched for)
const GRADES = [
  [90, 'excellent', 'perf-monitor__grade--excellent'],
  [75, 'good', 'perf-monitor__grade--good'],
  [55, 'fair', 'perf-monitor__grade--fair'],
  [0, 'heavy', 'perf-monitor__grade--heavy'],
]

export function createPerfMonitor({ root, scene, renderer, describe }) {
  const el = root.querySelector('[data-perf]')
  const graphs = el.querySelector('[data-perf-graphs]')
  const out = {
    score: el.querySelector('[data-perf-score]'),
    grade: el.querySelector('[data-perf-grade]'),
    count: el.querySelector('[data-perf-count]'),
    cost: el.querySelector('[data-perf-cost]'),
    sim: el.querySelector('[data-perf-sim]'),
    gpu: el.querySelector('[data-perf-gpu]'),
    calls: el.querySelector('[data-perf-calls]'),
    note: el.querySelector('[data-perf-note]'),
  }
  const modes = [...el.querySelectorAll('[data-perf-mode]')]

  const timer = new GpuTimer(renderer.getContext())
  scene.gpuTimer = timer

  const panels = {
    fps: new Stats.Panel('FPS', '#0ff', '#002'),
    cpu: new Stats.Panel('CPU MS', '#0f0', '#020'),
    gpu: new Stats.Panel('GPU MS', '#fa0', '#210'),
  }
  for (const p of Object.values(panels)) {
    p.dom.className = 'perf-monitor__graph'
    graphs.appendChild(p.dom)
  }

  let visible = false
  let maxFps = 1, maxCpu = 1, maxGpu = 1
  let lastFrame = 0, lastPaint = 0
  const samples = []                        // { t, dt, js, sim, gpu } for the last SCORE.windowMs

  function setVisible(v) {
    visible = v
    el.hidden = !v
    timer.enabled = v                       // no timer queries while hidden
    samples.length = 0; lastFrame = 0
    if (v) { out.score.textContent = '–'; setGrade(null) }
  }

  function setGrade(grade) {
    for (const g of GRADES) out.grade.classList.toggle(g[2], g === grade)
    out.grade.textContent = grade ? grade[1] : 'measuring'
  }

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
  const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] || 0 }
  const clamp01 = (x) => Math.min(1, Math.max(0, x))

  // called once per frame by the main loop, with the ms our whole frame callback took
  function tick(jsMs) {
    if (!visible) return
    const now = performance.now()
    if (lastFrame) samples.push({ t: now, dt: now - lastFrame, js: jsMs, sim: scene.simMs || 0, gpu: timer.ms })
    lastFrame = now
    while (samples.length && now - samples[0].t > SCORE.windowMs) samples.shift()
    if (now - lastPaint < 250 || samples.length < 20) return          // four updates per second
    lastPaint = now

    const recent = samples.filter((x) => now - x.t < 250)
    const fps = 1000 / avg(recent.map((x) => x.dt))
    const sim = avg(recent.map((x) => x.sim))
    const gpu = timer.ms
    maxFps = Math.max(maxFps, fps); maxCpu = Math.max(maxCpu, sim * 1.25); maxGpu = Math.max(maxGpu, (gpu || 0) * 1.25)
    panels.fps.update(fps, maxFps)
    panels.cpu.update(sim, maxCpu)
    if (gpu != null) panels.gpu.update(gpu, maxGpu)

    // ---- the score, over the whole window
    const interval = median(samples.map((x) => x.dt))                     // the display's refresh interval
    const refresh = 1000 / interval
    // medians: one garbage-collection pause or a late timer result does not swing the score
    const js = median(samples.map((x) => x.js))
    const budget = interval * SCORE.budgetShare
    const dropped = samples.filter((x) => x.dt > interval * 1.5).length / samples.length
    const fpsW = 1000 / avg(samples.map((x) => x.dt))
    const load = clamp01(1 - js / budget)
    const smooth = clamp01(fpsW / refresh) * clamp01(1 - dropped * 5)
    const score = Math.round(SCORE.loadWeight * load + SCORE.smoothWeight * smooth)
    out.score.textContent = String(score)
    setGrade(GRADES.find(([min]) => score >= min))

    out.cost.textContent = `${js.toFixed(2)} / ${budget.toFixed(1)} ms · ${Math.round(refresh)} Hz`
    out.sim.textContent = `${sim.toFixed(2)} ms`
    out.gpu.textContent = timer.supported ? (gpu != null ? `${gpu.toFixed(2)} ms` : '…') : 'n/a'
    out.calls.textContent = String(renderer.info.render.calls)

    // ---- what is on screen, and where the cost goes
    const d = describe()
    const pct = js > 0 ? Math.min(100, (median(samples.map((x) => x.sim)) / js) * 100) : 0
    const share = pct < 1 ? '<1' : String(Math.round(pct))
    out.note.textContent = d.live
      ? `${d.step} · ${scene.count.toLocaleString('en-US')} particles live · simulation ${share}% of the JS${dropped > 0.02 ? ` · ${Math.round(dropped * 100)}% frames dropped` : ''}`
      : `${d.step} · figure hidden, simulation idle`
  }

  // the particle budget changed: show it, highlight its key, rescale the graphs, restart the window
  function setCount(n) {
    out.count.textContent = n.toLocaleString('en-US')
    modes.forEach((m) => m.classList.toggle('perf-monitor__mode--active', +m.dataset.perfMode === n))
    maxCpu = 1; maxGpu = 1
    samples.length = 0
    if (visible) { out.score.textContent = '–'; setGrade(null) }
  }

  return { setVisible, toggle: () => setVisible(!visible), tick, setCount, get visible() { return visible } }
}
