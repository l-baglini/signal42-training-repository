/**
 * The app. Wires the engine, the renderer and a tracker together, and does as
 * little thinking as possible — every judgement on screen comes from
 * `src/engine/`, and this file only asks and displays.
 *
 * The tracker is swappable by construction (`src/perceive/tracker.ts`): the
 * mouse is the cleaner control for judging the geometry, the webcam is the real
 * thing, and no game code below knows which one it has.
 */
import { generate, visible } from './engine'
import type { Envelope, Generated, RoomScan, Target } from './engine'
import { validateScan } from './boundary/validate'
import { buildScene } from './render/geometry'
import { Renderer } from './render/renderer'
import { mouseTracker } from './perceive/mouse'
import { calibrate, type Sample } from './perceive/calibrate'
import { referenceBody } from './perceive/reference'
import type { Tracker } from './perceive/tracker'
import roomJson from '../fixtures/desk.room.json'

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing element #${id}`)
  return found as T
}

const canvas = el<HTMLCanvasElement>('stage')

function fatal(message: string): never {
  el('fatal').style.display = 'block'
  el('fatalMessage').textContent = message
  throw new Error(message)
}

let renderer: Renderer
try {
  renderer = new Renderer(canvas)
} catch (err) {
  fatal(err instanceof Error ? err.message : String(err))
}

/** The scan is untrusted even when it comes from a file. SPEC §7.4. */
const validated = validateScan(roomJson)
const fullRoom: RoomScan = validated.scan
/** Pressing `w` swaps in a wall with nothing to hide behind — the demo beat. */
const blankRoom: RoomScan = { ...fullRoom, occluders: [] }

let tracker: Tracker = mouseTracker(canvas)
void tracker.start()

let envelope: Envelope = referenceBody(tracker.latencyS())
let bodySource = 'reference body'
let room = fullRoom
let level: Generated
let targets: readonly Target[] = []
let revealed: boolean[] = []
let everRevealed: boolean[] = []
let mode: 'window' | 'dolly' = 'window'
let widthCm = 34

function regenerate(): void {
  level = generate(room, envelope)
  targets = level.kind === 'level' ? level.targets : []
  revealed = targets.map(() => false)
  everRevealed = targets.map(() => false)
  el('scoreValue').textContent = `0/${targets.length}`
  renderScene()
  renderHud()
}

function renderScene(): void {
  renderer.upload(buildScene({ occluders: room.occluders, targets, revealed }))
}

function renderHud(): void {
  const rows = el('rows')
  rows.innerHTML = ''
  const assessments = level.kind === 'level' ? level.assessments : []
  const shipped = new Set(targets.map((t) => `${t.at.x},${t.at.y},${t.at.z}`))

  for (const a of assessments) {
    const key = `${a.target.at.x},${a.target.at.y},${a.target.at.z}`
    const index = targets.findIndex((t) => `${t.at.x},${t.at.y},${t.at.z}` === key)
    const tr = document.createElement('tr')
    tr.className = revealed[index] ? 'on' : a.fair && shipped.has(key) ? 'fair' : 'rejected'
    const cells = [
      `(${a.target.at.x}, ${a.target.at.y}, ${a.target.at.z})`,
      Number.isFinite(a.leanCm) ? `${a.leanCm.toFixed(1)} cm` : '—',
      `${a.windowCm.toFixed(1)} cm`,
      String(a.seen),
      revealed[index] ? 'REVEALED' : a.fair ? 'fair' : (a.reject ?? ''),
    ]
    for (const c of cells) {
      const td = document.createElement('td')
      td.textContent = c
      tr.append(td)
    }
    rows.append(tr)
  }

  const s = level.stats
  el('stats').textContent =
    `${s.fair} fair of ${s.candidates} candidates · ${s.latticeCells} reachable eye positions\n` +
    `body (${bodySource}): jitter ${envelope.jitter.toFixed(2)} cm · ` +
    `vmax ${envelope.vmax.toFixed(0)} cm/s · latency ${(envelope.latency * 1000).toFixed(0)} ms\n` +
    `projection: ${mode === 'window' ? 'off-axis (a window)' : 'symmetric (a dolly)'}` +
    (validated.typeErrors || validated.clamped
      ? `\nscan: ${validated.typeErrors} type errors, ${validated.clamped} values clamped`
      : '')

  const refusal = el('refusal')
  if (level.kind === 'refusal') {
    refusal.style.display = 'block'
    el('refusalReason').textContent = level.reason
    el('refusalCounts').textContent = Object.entries(level.stats.rejected)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${String(n).padStart(3)}  ${k}`)
      .join('\n')
  } else {
    refusal.style.display = 'none'
  }
}

/* ---------------- switching the tracker ---------------- */

async function useCamera(): Promise<void> {
  if (tracker.kind === 'camera') return
  el('tracker').textContent = 'loading the tracker…'
  // Loaded on demand: MediaPipe is 150 kB of JS, and someone who only ever uses
  // the mouse should never pay for it. This is the only dynamic import here.
  const { cameraTracker } = await import('./perceive/camera')
  const cam = cameraTracker({ mount: el('cam') })
  el('tracker').textContent = 'starting the webcam…'
  try {
    await cam.start()
  } catch (err) {
    el('tracker').textContent = `webcam failed: ${err instanceof Error ? err.message : String(err)}`
    return
  }
  tracker.stop()
  tracker = cam
}

/* ---------------- calibration ---------------- */

const CALIBRATION_S = 10
let calibrating = false

async function runCalibration(): Promise<void> {
  if (calibrating) return
  calibrating = true
  const panel = el('calib')
  panel.style.display = 'block'
  el('calibPrompt').textContent =
    tracker.kind === 'camera'
      ? 'Lean as far as is comfortable — left, right, up, and towards the screen.'
      : 'Move the cursor as if leaning, and use the wheel to lean in and out.'

  const samples: Sample[] = []
  const t0 = performance.now()
  await new Promise<void>((done) => {
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000
      const at = tracker.position()
      if (at) samples.push({ at, tS: elapsed })
      el('calibCount').textContent = Math.max(0, CALIBRATION_S - elapsed).toFixed(1)
      if (elapsed >= CALIBRATION_S) done()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const result = calibrate(samples, { latencyS: tracker.latencyS() })
  if (result.ok) {
    envelope = result.envelope
    bodySource = `measured, ${result.quality.samples} samples`
    const q = result.quality
    el('calibTitle').textContent = q.degenerate ? 'That is not enough movement' : 'Measured'
    el('calibPrompt').textContent =
      `reach ${q.reachCm.toFixed(1)} cm · ` +
      `${q.directionsCovered}/${q.directionsTotal} directions pushed into` +
      (q.degenerate ? ' — the game will refuse rather than ship an unfair level.' : '')
    regenerate()
  } else {
    el('calibTitle').textContent = 'Calibration failed'
    el('calibPrompt').textContent = result.reason
  }
  el('calibCount').textContent = ''
  setTimeout(() => {
    panel.style.display = 'none'
    el('calibTitle').textContent = 'Measuring your body'
  }, 3200)
  calibrating = false
}

/* ---------------- controls ---------------- */

function updateRuler(): void {
  const bar = document.querySelector<HTMLElement>('#ruler .bar')
  if (bar) bar.style.width = `${(10 / widthCm) * innerWidth}px`
}

const widthInput = el<HTMLInputElement>('width')
widthInput.addEventListener('input', () => {
  widthCm = parseFloat(widthInput.value)
  el('widthVal').textContent = `${widthCm.toFixed(1)} cm`
  updateRuler()
})
widthInput.dispatchEvent(new Event('input'))

addEventListener('keydown', (e) => {
  if (e.key === 'o') {
    mode = mode === 'window' ? 'dolly' : 'window'
    renderHud()
  } else if (e.key === 'w') {
    room = room === fullRoom ? blankRoom : fullRoom
    regenerate()
  } else if (e.key === 'c') {
    void useCamera()
  } else if (e.key === 'k') {
    void runCalibration()
  } else if (e.key === 'r') {
    const r = el('ruler')
    r.style.display = r.style.display === 'block' ? 'none' : 'block'
    updateRuler()
  }
})
addEventListener('resize', updateRuler)

regenerate()

/* ---------------- the loop ---------------- */

let lastLatencyRefresh = 0

function frame(now: number): void {
  const eye = tracker.position() ?? envelope.rest
  const screen = renderer.resize(widthCm)

  // The one question the game asks every frame, and the engine answers it.
  let changed = false
  targets.forEach((t, i) => {
    const nowVisible = visible(eye, t.at, room.occluders)
    if (nowVisible !== revealed[i]) {
      revealed[i] = nowVisible
      changed = true
    }
    if (nowVisible) everRevealed[i] = true
  })
  if (changed) {
    renderScene()
    renderHud()
    el('scoreValue').textContent = `${everRevealed.filter(Boolean).length}/${targets.length}`
  }

  // Latency is measured, and what the dodge guarantee spends must stay current.
  if (now - lastLatencyRefresh > 1000) {
    lastLatencyRefresh = now
    const measured = tracker.latencyS()
    if (Math.abs(measured - envelope.latency) > 0.005) {
      envelope = { ...envelope, latency: measured }
      renderHud()
    }
    el('tracker').textContent = `${tracker.kind}: ${tracker.status()}`
  }

  renderer.draw(eye, screen, mode)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
