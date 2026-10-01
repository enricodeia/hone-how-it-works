/*
  Performance monitor (top right). Hidden until a particle key (Z / X / C) or S is pressed, or the page
  is opened with ?stats=1.

  Three stats.js graphs (the panel class that ships with three.js) plus a line of numbers:
    FPS  frames per second
    CPU  ms per frame spent in the particle simulation (the part that scales with the particle count)
    GPU  ms per frame the GPU spends drawing the canvas, measured with a WebGL2 timer query
         (EXT_disjoint_timer_query_webgl2; Chrome/Edge/Firefox. Safari has no timer queries: "n/a")
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

export function createPerfMonitor({ root, scene, renderer }) {
  const el = root.querySelector('[data-perf]')
  const graphs = el.querySelector('[data-perf-graphs]')
  const out = {
    count: el.querySelector('[data-perf-count]'),
    sim: el.querySelector('[data-perf-sim]'),
    gpu: el.querySelector('[data-perf-gpu]'),
    calls: el.querySelector('[data-perf-calls]'),
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
  let frames = 0, simSum = 0, last = performance.now(), maxFps = 1, maxCpu = 1, maxGpu = 1

  function setVisible(v) {
    visible = v
    el.hidden = !v
    timer.enabled = v                       // no timer queries while hidden
  }

  // called once per frame by the main loop, after scene.update
  function tick() {
    if (!visible) return
    frames++
    simSum += scene.simMs || 0
    const now = performance.now()
    if (now - last < 250) return            // four graph steps per second
    const fps = (frames * 1000) / (now - last)
    const sim = simSum / frames
    const gpu = timer.ms
    maxFps = Math.max(maxFps, fps); maxCpu = Math.max(maxCpu, sim * 1.25); maxGpu = Math.max(maxGpu, (gpu || 0) * 1.25)
    panels.fps.update(fps, maxFps)
    panels.cpu.update(sim, maxCpu)
    if (gpu != null) panels.gpu.update(gpu, maxGpu)
    out.sim.textContent = `${sim.toFixed(2)} ms`
    out.gpu.textContent = timer.supported ? (gpu != null ? `${gpu.toFixed(2)} ms` : '…') : 'n/a'
    out.calls.textContent = String(renderer.info.render.calls)
    frames = 0; simSum = 0; last = now
  }

  // the particle budget changed: show it, highlight its key, rescale the CPU/GPU graphs
  function setCount(n) {
    out.count.textContent = n.toLocaleString('en-US')
    modes.forEach((m) => m.classList.toggle('perf-monitor__mode--active', +m.dataset.perfMode === n))
    maxCpu = 1; maxGpu = 1
  }

  return { setVisible, toggle: () => setVisible(!visible), tick, setCount, get visible() { return visible } }
}
