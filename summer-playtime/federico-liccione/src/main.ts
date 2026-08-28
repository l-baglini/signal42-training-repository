/**
 * The app. Wires the engine, the renderer and a tracker together, and does as
 * little thinking as possible — every judgement on screen comes from
 * `src/engine/`, and this file only asks and displays.
 *
 * The tracker is swappable by construction (`src/perceive/tracker.ts`): the
 * mouse is the cleaner control for judging the geometry, the webcam is the real
 * thing, and no game code below knows which one it has.
 */
import {
  blockingOccluders,
  footprintMask,
  generate,
  latticeOf,
  nearestRevealing,
  shouldSpawn,
  visible,
} from './engine'
import type { Billboard, Envelope, Generated, Lattice, Point3, RoomScan, Target } from './engine'
import { validateScan } from './boundary/validate'
import { buildScene } from './render/geometry'
import { Renderer } from './render/renderer'
import { mouseTracker } from './perceive/mouse'
import { calibrate, type Sample } from './perceive/calibrate'
import { referenceBody } from './perceive/reference'
import type { Tracker } from './perceive/tracker'
import {
  DEFAULT_CONFIG,
  newRound,
  start as startRound,
  step as stepRound,
  threatPosition,
} from './game/round'
import type { RoundState, TargetSpec } from './game/round'
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
let lattice: Lattice = latticeOf(envelope)
/**
 * A new seed every round, so one room scan yields a different level each time.
 * The engine was built for this (I5: different seeds pick different targets);
 * the first fixture just did not propose enough candidates for it to show.
 */
let roundSeed = 1
let specs: TargetSpec[] = []
let round: RoundState = newRound(DEFAULT_CONFIG)
/** The footprint of the target being hunted, recomputed only when it changes. */
let huntIndex = -1
let huntMask: Uint8Array | null = null
let hiding: Billboard[] = []
/** Where the current hunt's revealing viewpoint is — and where threats go. */
let peekAt: Point3 | null = null
let holdFraction: number[] = []
/** Distance to the revealing viewpoint when the hunt began, for the gradient. */
let huntStartDistCm = 0
let warmth = 0

/** How long the player is left to search before the game offers a direction. */
const HINT_AFTER_S = 2.5

function regenerate(): void {
  lattice = latticeOf(envelope)
  level = generate(room, envelope, { seed: roundSeed, maxTargets: 14 })
  targets = level.kind === 'level' ? level.targets : []
  // The score needs the engine's difficulty pair, so it is carried across
  // rather than recomputed — there is one place that decides what is hard.
  const byKey = new Map(
    (level.kind === 'level' ? level.assessments : []).map((a) => [
      `${a.target.at.x},${a.target.at.y},${a.target.at.z}`,
      a,
    ]),
  )
  specs = targets.map((t) => {
    const a = byKey.get(`${t.at.x},${t.at.y},${t.at.z}`)
    return { leanCm: a?.leanCm ?? 0, windowCm: a?.windowCm ?? 1 }
  })
  revealed = targets.map(() => false)
  everRevealed = targets.map(() => false)
  holdFraction = targets.map(() => 0)
  round = newRound(DEFAULT_CONFIG)
  renderScene()
  renderHud()
  renderRound()
}

function renderScene(): void {
  const playing = round.phase === 'playing'
  renderer.upload(
    buildScene({
      occluders: room.occluders,
      targets,
      revealed,
      hold: playing ? holdFraction : undefined,
      active: playing ? round.active.map((a) => a.index) : undefined,
      threat:
        playing && round.threat
          ? { at: threatPosition(round.threat, round.tS), radius: round.threat.radius }
          : undefined,
      // The tell. Drawn from the moment it spawns, so the direction to move is
      // readable before the thing itself is large enough to read.
      threatMarker:
        playing && round.threat
          ? { at: round.threat.to, radius: round.threat.radius }
          : undefined,
      hiding: playing ? hiding : undefined,
      hidingGlow: warmth,
    }),
  )
}

function renderRound(): void {
  const panel = el('round')
  const remaining = Math.max(0, round.endsAtS - round.tS)
  el('clock').textContent = round.phase === 'playing' ? remaining.toFixed(1) : DEFAULT_CONFIG.durationS.toFixed(1)
  el('scoreValue').textContent = String(round.score)
  el('tally').textContent =
    `${round.revealed} found · ${round.missed} missed · ${round.hits} hit · ${round.dodged} dodged`

  if (round.phase === 'playing') {
    panel.style.display = 'none'
    return
  }
  panel.style.display = 'block'
  el('hint').style.display = 'none'
  el('hold').style.display = 'none'
  el('warm').style.display = 'none'
  if (level.kind === 'refusal') {
    el('roundTitle').textContent = 'No round to play'
    el('roundBody').textContent = 'This room will not make a fair level. Press w to put the furniture back.'
    return
  }
  if (round.phase === 'ready') {
    el('roundTitle').textContent = 'Blind Spot'
    el('roundBody').textContent =
      'Somewhere in this room there is a marker you cannot see from where you are sitting — ' +
      'a piece of furniture is in the way. The one that is hiding it lights up. Lean to the side ' +
      'until the marker comes into view, and it scores. Something red will cross the room at you; ' +
      'an orange square shows where it will land, so lean out of that spot or it costs you five ' +
      'seconds of the clock.'
  } else {
    el('roundTitle').textContent = `${round.score} points`
    el('roundBody').textContent =
      `${round.revealed} found, ${round.missed} missed, ${round.hits} hit, ${round.dodged} dodged.`
  }
}

function renderWarmth(index: number, distCm: number): void {
  const panel = el('warm')
  if (index < 0 || revealed[index] || !Number.isFinite(distCm)) {
    panel.style.display = 'none'
    return
  }
  panel.style.display = 'block'
  el<HTMLElement>('warmFill').style.width = `${(warmth * 100).toFixed(0)}%`
  el('warmLabel').textContent = `${distCm.toFixed(0)} cm FROM A VIEW OF IT`
}

function renderHold(heldS: number, index: number): void {
  const panel = el('hold')
  if (index < 0 || !revealed[index]) {
    // Still shown while draining, so losing the position reads as a loss rather
    // than as nothing happening.
    if (heldS <= 0) {
      panel.style.display = 'none'
      return
    }
  }
  panel.style.display = 'block'
  const f = Math.min(1, heldS / DEFAULT_CONFIG.holdS)
  el<HTMLElement>('holdFill').style.width = `${(f * 100).toFixed(0)}%`
  el('holdLabel').textContent = revealed[index] ? 'HOLD IT' : 'KEEP IT IN VIEW'
}

/**
 * After a couple of seconds of searching, say which way and how far. Not a
 * concession: the first playtest could not tell there was a hunt on at all, and
 * a hint that arrives only when the player is stuck teaches the mechanic without
 * playing it for them.
 */
function renderHint(ageS: number, index: number, eye: Point3): void {
  const panel = el('hint')
  if (index < 0 || !huntMask || ageS < HINT_AFTER_S || revealed[index]) {
    panel.style.display = 'none'
    return
  }
  const near = nearestRevealing(lattice, huntMask, eye)
  if (!near) {
    panel.style.display = 'none'
    return
  }
  const dx = near.at.x - eye.x
  const dy = near.at.y - eye.y
  const dz = near.at.z - eye.z
  let arrow: string
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) arrow = dx > 0 ? '\u2192' : '\u2190'
  else if (Math.abs(dy) >= Math.abs(dz)) arrow = dy > 0 ? '\u2191' : '\u2193'
  else arrow = dz > 0 ? '\u21a9' : '\u21aa'
  panel.style.display = 'block'
  el('hintArrow').textContent = arrow
  el('hintText').textContent =
    dz > Math.abs(dx) && dz > Math.abs(dy)
      ? `lean back ${near.distCm.toFixed(0)} cm`
      : Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > Math.abs(dy)
        ? `lean in ${near.distCm.toFixed(0)} cm`
        : `lean ${near.distCm.toFixed(0)} cm`
}

function flash(): void {
  const f = el('flash')
  f.style.opacity = '1'
  setTimeout(() => (f.style.opacity = '0'), 90)
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
  } else if (e.key === ' ') {
    e.preventDefault()
    if (round.phase !== 'playing') {
      roundSeed++
      regenerate()
      if (level.kind !== 'level') return
      round = startRound(round, DEFAULT_CONFIG)
      roundStartedAt = performance.now() / 1000
      renderRound()
    }
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
let roundStartedAt = 0

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

  if (round.phase === 'playing') {
    const before = round.phase
    round = stepRound(round, DEFAULT_CONFIG, specs, {
      tS: now / 1000 - roundStartedAt,
      eye,
      visible: revealed,
      // The gate. A threat the engine says this player cannot dodge from where
      // they are is never spawned, and the game has no way to overrule it.
      maySpawn: (threat) => shouldSpawn(lattice, threat, envelope, eye),
      // Aimed at the place the player needs to be, not the place they are. This
      // is what makes holding a decision: the scoring position and the safe
      // position stop being the same position. The gate above still guarantees
      // an escape exists.
      aimAt: peekAt,
    })
    // Track which target is being hunted, and what is hiding it. The mask is
    // the same footprint the engine used to decide the target was fair, so the
    // hint can never point somewhere the rules disagree with.
    const active = round.active[0]
    const index = active?.index ?? -1
    const changedHunt = index !== huntIndex
    if (changedHunt) {
      huntIndex = index
      huntStartDistCm = 0
      huntMask =
        index >= 0 && targets[index]
          ? footprintMask(lattice, room.occluders, targets[index]!.at)
          : null
    }
    hiding =
      index >= 0 && targets[index]
        ? blockingOccluders(eye, targets[index]!.at, room.occluders)
        : []
    const near = huntMask ? nearestRevealing(lattice, huntMask, eye) : null
    peekAt = near?.at ?? null
    if (index !== huntIndex || huntStartDistCm === 0) {
      huntStartDistCm = near?.distCm ?? 0
    }
    // A gradient instead of a binary. This is the fix for "I cannot tell where
    // the objective is": the signal used to be invisible-then-visible with
    // nothing in between, so there was nothing to home in on.
    warmth = near && huntStartDistCm > 0
      ? Math.max(0, Math.min(1, 1 - near.distCm / huntStartDistCm))
      : 0
    renderWarmth(index, near?.distCm ?? Infinity)

    holdFraction = targets.map(() => 0)
    if (active && index >= 0) {
      holdFraction[index] = Math.min(1, active.heldS / DEFAULT_CONFIG.holdS)
    }
    renderHold(active ? active.heldS : 0, index)
    renderHint(active ? round.tS - active.bornS : 0, index, eye)

    for (const ev of round.events) if (ev.kind === 'hit') flash()
    renderRound()
    if (round.phase !== before) renderHud()
    changed = true
  } else if (changed) {
    renderHud()
  }

  if (changed) renderScene()

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
