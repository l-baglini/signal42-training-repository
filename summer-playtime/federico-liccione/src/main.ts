/**
 * The app. Wires the engine, the renderer and a tracker together and thinks as
 * little as possible: every judgement on screen comes from `src/engine/`, and
 * this file asks and displays.
 *
 * The head says where you are. The mouse says where you are aiming. Nothing here
 * knows whether the head is a webcam, a keyboard or a pointer — that is what
 * `perceive/tracker.ts` is for.
 */
import { assessEnemies, visible } from './engine'
import type { Envelope, Point3, RoomScan } from './engine'
import { validateScan } from './boundary/validate'
import { buildScene, type EnemyView } from './render/geometry'
import { Renderer } from './render/renderer'
import { offAxis, project, symmetric, type Screen } from './render/projection'
import { keyboardTracker } from './perceive/keyboard'
import { mouseTracker } from './perceive/mouse'
import { calibrate, type Sample } from './perceive/calibrate'
import { referenceBody } from './perceive/reference'
import type { Tracker } from './perceive/tracker'
import type { CameraModel } from './perceive/roomGeometry'
import { applyInventory } from './perceive/inventory'
import type { InventoryCost } from './perceive/inventory'
import {
  DEFAULT_COMBAT,
  accuracy,
  newCombat,
  startCombat,
  step as stepCombat,
} from './game/combat'
import type { CombatState, EnemySpec } from './game/combat'
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

const validated = validateScan(roomJson)
const fixtureRoom: RoomScan = validated.scan

let tracker: Tracker = keyboardTracker()
void tracker.start()

let envelope: Envelope = referenceBody(tracker.latencyS())
let bodySource = 'reference body'
let room = fixtureRoom
let roomSource = 'hand-authored fixture'
let farWallCm = 320
let scanning = false
let sessionCents = 0
let costLines: string[] = []
let mode: 'window' | 'dolly' = 'window'
let widthCm = 34
let roundSeed = 1

/* ---------------- the line-up ---------------- */

interface EnemyEntry {
  readonly at: Point3
  readonly radius: number
  readonly spec: EnemySpec
  readonly leanCm: number
  readonly windowCm: number
  readonly retreatCm: number
}

let enemies: EnemyEntry[] = []
let rejectCounts: Record<string, number> = {}
let combat: CombatState = newCombat(DEFAULT_COMBAT)
let exposed: boolean[] = []
let aimed: boolean[] = []
let firing = false
let mouseNdc: { x: number; y: number } | null = null

function rebuildLineup(): void {
  const { assessments } = assessEnemies(room, envelope)
  rejectCounts = {}
  for (const a of assessments) {
    if (!a.fair && a.reject) rejectCounts[a.reject] = (rejectCounts[a.reject] ?? 0) + 1
  }
  const fair = assessments.filter((a) => a.fair).sort((x, y) => x.leanCm - y.leanCm)
  // A different subset each round, from the one scan. The engine was built for
  // this; the seed only chooses which of the fair ones get used.
  const offset = fair.length ? roundSeed % fair.length : 0
  const rotated = [...fair.slice(offset), ...fair.slice(0, offset)].slice(0, 12)

  enemies = rotated.map((a) => ({
    at: a.enemy.at,
    radius: a.enemy.radius,
    spec: { leanCm: a.leanCm, windowCm: a.windowCm, fuseS: a.enemy.fuseS },
    leanCm: a.leanCm,
    windowCm: a.windowCm,
    retreatCm: a.retreatCm,
  }))
  exposed = enemies.map(() => false)
  aimed = enemies.map(() => false)
  combat = newCombat(DEFAULT_COMBAT)
  renderHud()
  renderRound()
}

/* ---------------- rendering ---------------- */

function views(): EnemyView[] {
  const live = new Map(combat.active.map((a) => [a.index, a]))
  return enemies.flatMap((e, i) => {
    const a = live.get(i)
    if (!a) return []
    return [{
      at: e.at,
      radius: e.radius,
      exposed: exposed[i] ?? false,
      fuse: e.spec.fuseS > 0 ? a.exposedS / e.spec.fuseS : 0,
      aimed: aimed[i] ?? false,
    }]
  })
}

function renderScene(): void {
  renderer.upload(
    buildScene({
      occluders: room.occluders,
      targets: [],
      enemies: combat.phase === 'playing' ? views() : [],
    }),
  )
}

function renderHud(): void {
  const rows = el('rows')
  rows.innerHTML = ''
  for (const [i, e] of enemies.entries()) {
    const tr = document.createElement('tr')
    const live = combat.active.some((a) => a.index === i)
    tr.className = exposed[i] ? 'on' : live ? 'fair' : 'rejected'
    for (const c of [
      `(${e.at.x}, ${e.at.y}, ${e.at.z})`,
      `${e.leanCm.toFixed(1)} cm`,
      `${e.windowCm.toFixed(1)} cm`,
      `${e.spec.fuseS.toFixed(2)} s`,
      exposed[i] ? 'EXPOSED' : live ? 'in play' : '—',
    ]) {
      const td = document.createElement('td')
      td.textContent = c
      tr.append(td)
    }
    rows.append(tr)
  }

  const rejects = Object.entries(rejectCounts)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
  el('stats').textContent =
    `room (${roomSource}): ${room.occluders.length} cover, ${room.anchors.length} candidates → ` +
    `${enemies.length} enemies\n` +
    (rejects ? `rejected: ${rejects}\n` : '') +
    `body (${bodySource}): jitter ${envelope.jitter.toFixed(2)} cm · ` +
    `vmax ${envelope.vmax.toFixed(0)} cm/s · latency ${(envelope.latency * 1000).toFixed(0)} ms\n` +
    `projection: ${mode === 'window' ? 'off-axis (a window)' : 'symmetric (a dolly)'}`
}

function renderRound(): void {
  const panel = el('round')
  const remaining = Math.max(0, combat.endsAtS - combat.tS)
  el('clock').textContent =
    combat.phase === 'playing' ? remaining.toFixed(1) : DEFAULT_COMBAT.durationS.toFixed(1)
  el('scoreValue').textContent = String(combat.score)
  el('tally').textContent =
    `${combat.killed} killed · ${combat.timesShot} hit · ${combat.escaped} escaped · ` +
    `${(accuracy(combat) * 100).toFixed(0)}% accuracy`

  if (combat.phase === 'playing') {
    panel.style.display = 'none'
    return
  }
  panel.style.display = 'block'
  el('hint').style.display = 'none'
  el('hold').style.display = 'none'
  el('warm').style.display = 'none'

  if (enemies.length === 0) {
    el('roundTitle').textContent = 'No round to play'
    el('roundBody').textContent =
      `Nothing in this room can be fought fairly. ${
        Object.entries(rejectCounts).map(([k, n]) => `${n} ${k}`).join(', ')
      }.`
    return
  }
  if (combat.phase === 'ready') {
    el('roundTitle').textContent = 'Blind Spot'
    el('roundBody').textContent =
      'Enemies hide behind the furniture. Leaning out is the only way to see one — and the ' +
      'only way for it to see you. Lean with WASD (or your head, press c), aim and shoot with ' +
      'the mouse, and get back into cover before it fires.'
  } else {
    el('roundTitle').textContent = `${combat.score} points`
    el('roundBody').textContent =
      `${combat.killed} killed, ${combat.timesShot} times hit, ${combat.escaped} got away, ` +
      `${(accuracy(combat) * 100).toFixed(0)}% accuracy.`
  }
}

function renderExposure(): void {
  const panel = el('hold')
  const live = combat.active
    .map((a) => ({ a, e: enemies[a.index] }))
    .filter((p) => p.e && exposed[p.a.index])
    .sort((p, q) => q.a.exposedS / q.e!.spec.fuseS - p.a.exposedS / p.e!.spec.fuseS)[0]
  if (!live || combat.phase !== 'playing') {
    panel.style.display = 'none'
    return
  }
  const f = Math.min(1, live.a.exposedS / live.e!.spec.fuseS)
  panel.style.display = 'block'
  el<HTMLElement>('holdFill').style.width = `${(f * 100).toFixed(0)}%`
  el<HTMLElement>('holdFill').style.background = f > 0.6 ? '#ffcf5c' : '#e0685c'
  el('holdLabel').textContent = f > 0.75 ? 'GET BACK INTO COVER' : 'EXPOSED'
}

/**
 * The visible cost the brief asks for. Measured from the response's own usage
 * figures rather than estimated, and a running session total — which normally
 * reads as one call, because the scan is per room and not per level.
 */
function recordCost(cost: InventoryCost, ms: number, dropped: number, typeErrors: number): void {
  sessionCents += cost.cents
  costLines = [
    `${cost.model}`,
    `in ${cost.inputTokens} tok · out ${cost.outputTokens} tok · ${ms.toFixed(0)} ms`,
    `this call ${cost.cents.toFixed(3)}¢ · session ${sessionCents.toFixed(3)}¢`,
    dropped || typeErrors ? `guards: ${dropped} dropped, ${typeErrors} type errors` : 'guards: clean',
  ]
  el('cost').style.display = 'block'
  el('costBody').textContent = costLines.join('\n')
}

function flash(colour: string): void {
  const f = el('flash')
  f.style.background = colour
  f.style.opacity = '1'
  setTimeout(() => (f.style.opacity = '0'), 90)
}

/* ---------------- aiming ---------------- */

/**
 * Which enemies the crosshair is over.
 *
 * Enemies are screen-parallel quads, so projecting their corners and testing the
 * pointer against the resulting box is exact — no ray casting needed. It uses the
 * same matrix the frame was drawn with, so the crosshair and the picture cannot
 * disagree.
 */
function updateAim(mvp: Float32Array): void {
  aimed = enemies.map(() => false)
  if (!mouseNdc) return
  for (const a of combat.active) {
    const e = enemies[a.index]
    if (!e) continue
    const pts = [
      { x: e.at.x - e.radius, y: e.at.y - e.radius, z: e.at.z },
      { x: e.at.x + e.radius, y: e.at.y - e.radius, z: e.at.z },
      { x: e.at.x - e.radius, y: e.at.y + e.radius, z: e.at.z },
      { x: e.at.x + e.radius, y: e.at.y + e.radius, z: e.at.z },
    ].map((p) => project(mvp, p))
    if (pts.some((p) => p.w <= 0)) continue
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    if (
      mouseNdc.x >= Math.min(...xs) && mouseNdc.x <= Math.max(...xs) &&
      mouseNdc.y >= Math.min(...ys) && mouseNdc.y <= Math.max(...ys)
    ) {
      aimed[a.index] = true
    }
  }
}

/* ---------------- scanning ---------------- */

async function runScan(): Promise<void> {
  if (scanning) return
  const cam = tracker as Tracker & { video?: HTMLVideoElement }
  if (tracker.kind !== 'camera' || !cam.video) {
    el('tracker').textContent = 'press c for the webcam first — the scan needs it'
    return
  }
  const head = tracker.position()
  if (!head) {
    el('tracker').textContent = 'no face yet: the scan needs your head for the scale'
    return
  }

  scanning = true
  const panel = el('scan')
  panel.style.display = 'block'
  el('scanTitle').textContent = 'Scanning the room'
  el('scanMeta').textContent = ''
  const camera: CameraModel = { fovDeg: 60, playerZcm: head.z, aboveCentreCm: 12, flipX: false }

  try {
    const { scanRoom } = await import('./perceive/scanRoom')
    const report = await scanRoom({
      video: cam.video,
      headZcm: head.z,
      farWallCm,
      camera,
      onProgress: (stage) => { el('scanStage').textContent = stage + '…' },
    })
    const meta =
      `backend  ${report.device} / ${report.dtype}\n` +
      `scan     ${report.ms.toFixed(0)} ms` +
      (report.loadMs > 0 ? `   (weights loaded in ${(report.loadMs / 1000).toFixed(1)} s)` : '') +
      `\nhead     ${head.z.toFixed(0)} cm, measured   far wall ${farWallCm} cm, assumed`

    if (!report.outcome.ok) {
      el('scanTitle').textContent = 'The scan found nothing to play with'
      el('scanStage').textContent = report.outcome.reason
      el('scanMeta').textContent = meta
    } else {
      room = report.outcome.scan
      roomSource = `your room, ${report.device}/${report.dtype}`
      roundSeed++
      rebuildLineup()
      el('scanTitle').textContent = 'Your room is the level'
      el('scanStage').textContent =
        `${room.occluders.length} pieces of cover, ${room.anchors.length} candidates proposed — ` +
        `the engine kept ${enemies.length} as fair enemies.`
      el('scanMeta').textContent = meta

      const key = el<HTMLInputElement>('apikey').value
      if (key.trim() && report.canvas) {
        el('scanStage').textContent = 'asking what the objects are…'
        const { semanticScan } = await import('./perceive/semanticScan')
        const named = await semanticScan({
          apiKey: key,
          canvas: report.canvas,
          regions: report.outcome.regions,
          frameWidth: report.outcome.frameWidth,
          frameHeight: report.outcome.frameHeight,
        })
        if (named.ok) {
          // Names and hazards only. It cannot add a candidate, move a rectangle
          // or make a position playable — the engine judges again, unchanged.
          room = applyInventory(room, named.inventory)
          roomSource = `your room, named`
          rebuildLineup()
          recordCost(named.cost, named.ms, named.dropped, named.typeErrors)
          el('scanStage').textContent =
            named.inventory.regions
              .map((r) => `${r.index}: ${r.label} → ${r.use}`)
              .join('  ·  ') || 'the model named nothing it could see'
          el('scanMeta').textContent =
            `${meta}\nnamed    ${named.inventory.regions.length} of ${report.outcome.regions.length} regions` +
            `   ${named.cost.cents.toFixed(3)} cents`
        } else {
          el('scanMeta').textContent = `${meta}\nnaming failed: ${named.reason}`
        }
      }
    }
  } catch (err) {
    el('scanTitle').textContent = 'The scan failed'
    el('scanStage').textContent = err instanceof Error ? err.message : String(err)
  } finally {
    scanning = false
    setTimeout(() => { panel.style.display = 'none' }, 6000)
  }
}

/* ---------------- trackers ---------------- */

async function useCamera(): Promise<void> {
  if (tracker.kind === 'camera') return
  el('tracker').textContent = 'loading the tracker…'
  const { cameraTracker } = await import('./perceive/camera')
  const cam = cameraTracker({ mount: el('cam') })
  try {
    await cam.start()
  } catch (err) {
    el('tracker').textContent = `webcam failed: ${err instanceof Error ? err.message : String(err)}`
    return
  }
  tracker.stop()
  tracker = cam
}

function usePointerHead(): void {
  // Kept because it is still the cleanest way to judge the projection on its
  // own — but it takes the mouse away from aiming, so it is not the default.
  if (tracker.kind === 'camera') return
  tracker.stop()
  tracker = mouseTracker(canvas)
  void tracker.start()
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
      : 'Hold the lean keys through their full range, including Q and E.'

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
      `reach ${q.reachCm.toFixed(1)} cm · ${q.directionsCovered}/${q.directionsTotal} directions` +
      (q.degenerate ? ' — the game will refuse rather than ship an unfair fight.' : '')
    rebuildLineup()
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

const farInput = el<HTMLInputElement>('farwall')
farInput.addEventListener('input', () => {
  farWallCm = parseFloat(farInput.value)
  el('farwallVal').textContent = `${farWallCm} cm`
})
farInput.dispatchEvent(new Event('input'))

const widthInput = el<HTMLInputElement>('width')
widthInput.addEventListener('input', () => {
  widthCm = parseFloat(widthInput.value)
  el('widthVal').textContent = `${widthCm.toFixed(1)} cm`
  updateRuler()
})
widthInput.dispatchEvent(new Event('input'))

const crosshair = el('crosshair')
addEventListener('pointermove', (e) => {
  mouseNdc = { x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 }
  crosshair.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
  crosshair.style.display = 'block'
})
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) firing = true
})

let roundStartedAt = 0
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (k === ' ') {
    e.preventDefault()
    if (combat.phase !== 'playing' && enemies.length > 0) {
      roundSeed++
      rebuildLineup()
      combat = startCombat(DEFAULT_COMBAT)
      roundStartedAt = performance.now() / 1000
      renderRound()
    }
  } else if (k === 'o') {
    mode = mode === 'window' ? 'dolly' : 'window'
    renderHud()
  } else if (k === 'c') {
    void useCamera()
  } else if (k === 'm') {
    usePointerHead()
  } else if (k === 'p') {
    void runScan()
  } else if (k === 'k') {
    void runCalibration()
  } else if (k === 'r') {
    const r = el('ruler')
    r.style.display = r.style.display === 'block' ? 'none' : 'block'
    updateRuler()
  }
})
addEventListener('resize', updateRuler)

/* ---------------- the loop ---------------- */

let lastStatus = 0
rebuildLineup()
renderScene()

function frame(now: number): void {
  const eye = tracker.position() ?? envelope.rest
  const screen: Screen = renderer.resize(widthCm)
  const mvp = mode === 'window' ? offAxis(eye, screen) : symmetric(eye, screen)

  // The one question, asked once and used for everything: can this enemy see me?
  // By the symmetry in engine/exposure.ts that is also "can I shoot it".
  exposed = enemies.map((e) => visible(eye, e.at, room.occluders))
  updateAim(mvp)

  if (combat.phase === 'playing') {
    const before = combat.phase
    const wasKilled = combat.killed
    const wasShot = combat.timesShot
    combat = stepCombat(combat, DEFAULT_COMBAT, enemies.map((e) => e.spec), {
      tS: now / 1000 - roundStartedAt,
      eye,
      exposed,
      aimedAt: aimed.flatMap((v, i) => (v ? [i] : [])),
      firing,
    })
    firing = false
    if (combat.killed > wasKilled) flash('rgba(120,230,180,.22)')
    if (combat.timesShot > wasShot) flash('rgba(230,60,70,.32)')
    renderRound()
    renderExposure()
    if (combat.phase !== before) renderHud()
    renderScene()
  } else {
    firing = false
  }

  if (now - lastStatus > 500) {
    lastStatus = now
    const measured = tracker.latencyS()
    if (Math.abs(measured - envelope.latency) > 0.008) {
      envelope = { ...envelope, latency: measured }
    }
    el('tracker').textContent = tracker.status()
    if (combat.phase !== 'playing') renderHud()
  }

  renderer.draw(eye, screen, mode)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Note: `game/round.ts` — the hunt mode this replaced — is no longer wired up. It
// stays in the tree with its tests because it was a real design iteration whose
// findings are recorded in DEVLOG.md, not because anything still calls it.
