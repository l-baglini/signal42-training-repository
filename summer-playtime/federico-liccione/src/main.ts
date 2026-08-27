/**
 * The app. Wires the engine, the renderer and a tracker together and does as
 * little thinking as possible — every judgement on screen comes from
 * `src/engine/`, and this file only asks and displays.
 *
 * The tracker here is the mouse. Swapping in the camera is a one-line change by
 * construction (`src/perceive/tracker.ts`), which is the point of that interface.
 */
import { generate, visible } from './engine'
import type { Generated, RoomScan, Target } from './engine'
import { validateScan } from './boundary/validate'
import { buildScene } from './render/geometry'
import { Renderer } from './render/renderer'
import { mouseTracker } from './perceive/mouse'
import { referenceBody } from './perceive/reference'
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

const tracker = mouseTracker(canvas)
void tracker.start()

const envelope = referenceBody(tracker.latencyS())

/** The scan is untrusted even when it comes from a file. SPEC §7.4. */
const validated = validateScan(roomJson)
const fullRoom: RoomScan = validated.scan
/** Pressing `w` swaps in a wall with nothing to hide behind — the demo beat. */
const blankRoom: RoomScan = { ...fullRoom, occluders: [] }

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
    `body: reach measured, jitter ${envelope.jitter} cm, vmax ${envelope.vmax} cm/s, ` +
    `latency ${(envelope.latency * 1000).toFixed(0)} ms\n` +
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
  } else if (e.key === 'r') {
    const r = el('ruler')
    r.style.display = r.style.display === 'block' ? 'none' : 'block'
    updateRuler()
  }
})
addEventListener('resize', updateRuler)

regenerate()

function frame(): void {
  const eye = tracker.position() ?? envelope.rest
  const screen = renderer.resize(widthCm)

  // The one question the game asks every frame, and the engine answers it.
  let changed = false
  targets.forEach((t, i) => {
    const now = visible(eye, t.at, room.occluders)
    if (now !== revealed[i]) {
      revealed[i] = now
      changed = true
    }
    if (now) everRevealed[i] = true
  })
  if (changed) {
    renderScene()
    renderHud()
    el('scoreValue').textContent = `${everRevealed.filter(Boolean).length}/${targets.length}`
  }

  renderer.draw(eye, screen, mode)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
