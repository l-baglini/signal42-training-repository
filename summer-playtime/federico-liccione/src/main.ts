/**
 * The app. Wires the engine, the renderer and a tracker together and thinks as
 * little as possible: every judgement on screen comes from `src/engine/`, and
 * this file asks and displays.
 *
 * The head says where you are. The mouse says where you are aiming. Nothing here
 * knows whether the head is a webcam, a keyboard or a pointer — that is what
 * `perceive/tracker.ts` is for.
 */
import { assessEnemies, onScreen, visible } from './engine'
import type { Billboard, Envelope, Point3, Viewport } from './engine'
import { validateScan } from './boundary/validate'
import { buildScene, type EnemyView, type UvRect } from './render/geometry'
import { DEFAULT_MOOD, moodFor, type Mood } from './render/mood'
import { Renderer } from './render/renderer'
import { offAxis, project, symmetric, type Screen } from './render/projection'
import { createSfx } from './render/sound'
import { keyboardTracker } from './perceive/keyboard'
import { mouseTracker } from './perceive/mouse'
import { calibrate, type Sample } from './perceive/calibrate'
import { referenceBody } from './perceive/reference'
import type { Tracker } from './perceive/tracker'
import { isTyping } from './perceive/typing'
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
import { LEVELS } from '../fixtures/levels/authored'
import type { AuthoredLevel } from '../fixtures/levels/authored'
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

/**
 * Every layout goes through the boundary validator, authored ones included. A
 * level I wrote by hand is not more trustworthy than one a model wrote — it is
 * just written by someone with a worse memory for units.
 */
const rooms: AuthoredLevel[] = [
  ...LEVELS,
  {
    id: 'desk',
    name: 'The desk',
    blurb: 'The first room, written by hand before any of the tools existed.',
    scan: validateScan(roomJson).scan,
  },
].map((l) => ({ ...l, scan: validateScan(l.scan).scan }))

let roomIndex = 0

let tracker: Tracker = keyboardTracker()
void tracker.start()

let envelope: Envelope = referenceBody(tracker.latencyS())
let bodySource = 'reference body'
let room = rooms[0]!.scan
let roomSource = rooms[0]!.name
let farWallCm = 320
let scanning = false
/**
 * Where each occluder's pixels live in the scanned frame, keyed by geometry.
 *
 * Keyed rather than parallel because the semantic pass may drop an occluder or
 * move it to no-spawn, which would silently shift a parallel array by one and
 * paint the wrong furniture on the wrong rectangle. Geometry is a safe key
 * precisely because `applyInventory` is tested never to change it.
 */
const geomKey = (b: Billboard): string => `${b.z}|${b.x0}|${b.x1}|${b.y0}|${b.y1}`
let roomUv = new Map<string, UvRect>()
let occluderLabels = new Map<string, string>()
/** The scanned frame, once there is one. `t` switches to it. */
let showPhoto = false

/**
 * The level's palette, weather and light, all chosen from the level's own words.
 *
 * The same trick as everything else in this file that reads a label: a level that
 * calls itself a rainy night looks like one, and the three writers who produce
 * level text — the fixtures, the vision model, the language model — all write
 * those words already without being asked to.
 */
let mood: Mood = DEFAULT_MOOD

function applyMood(text: string, seed: number): void {
  mood = moodFor(text)
  renderer.skyLow = [...mood.skyLow] as [number, number, number]
  renderer.skyHigh = [...mood.skyHigh] as [number, number, number]
  renderer.fog = [...mood.fog] as [number, number, number]
  renderer.rain = mood.rain
  skylineSeed = seed
}

let skylineSeed = 1

let sessionCents = 0
let costLines: string[] = []
let mode: 'window' | 'dolly' = 'window'
let widthCm = 34
let roundSeed = 1
/**
 * The display's physical size, as the engine sees it. Kept here and handed to
 * `assessEnemies`, because a fairness check that assumed a nominal screen while
 * the player had a different one would disagree with what is on the glass.
 */
let viewport: Viewport = { widthCm: 34, heightCm: 21 }

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
const sfx = createSfx()
let shake = 0
/**
 * Where the last shot came from, and until when to show it.
 *
 * `step` removes an enemy from `active` in the same tick it fires, and only active
 * enemies are drawn — so the thing that hits you vanishes in the very frame it
 * hits you. A playtester reported being shot by enemies that were not there, and
 * they were not: they had just left. This marks the spot for a moment.
 *
 * The deadline is on the **wall clock**, not on `combat.tS`. It was on the round
 * clock first, and a round clock restarts: a marker stamped at 45 s outlived the
 * whole of the next round as an orange square hanging in the void with no body
 * inside, unshootable and not shooting. Absolute time cannot be resurrected by a
 * reset, and `rebuildLineup` clears it anyway — belt and braces, because this
 * class of bug is invisible until somebody plays two rounds.
 */
let shotFrom: { at: Point3; untilWallS: number } | null = null
/** The scanned frame, once there is one. */
let photoTexture: HTMLCanvasElement | null = null

function rebuildLineup(): void {
  const { assessments } = assessEnemies(room, envelope, { viewport })
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
  // Nothing from the last round survives into this one, markers included.
  shotFrom = null
  combat = newCombat(DEFAULT_COMBAT)
  /**
   * The scene has to be re-uploaded here, not only while a round is running.
   * Without this a new level — designed, scanned, or switched with the bracket
   * keys — sat in memory while the previous one stayed on screen until somebody
   * pressed space, which reads exactly like "the level was not built".
   */
  renderScene()
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
      occluderUvs: showPhoto ? room.occluders.map((o) => roomUv.get(geomKey(o))) : undefined,
      targets: [],
      enemies: combat.phase === 'playing' ? views() : [],
      mood,
      skylineSeed,
      threatMarker:
        shotFrom && shotFrom.untilWallS > performance.now() / 1000
          ? { at: shotFrom.at, radius: 16 }
          : undefined,
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
    `${combat.killed} killed · ${combat.timesShot} hit · ` +
    `${combat.active.length} standing · ${(accuracy(combat) * 100).toFixed(0)}% accuracy`

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
    el('roundTitle').textContent = rooms[roomIndex]!.name
    el('roundBody').textContent =
      `${rooms[roomIndex]!.blurb}\n\n` +
      'The room is already full. Leaning out is the only way to see what is in it — and ' +
      'the only way for it to see you. Lean with WASD (or your head, press c), aim and ' +
      'shoot with the mouse, and get back into cover before the shot lands.'
  } else {
    el('roundTitle').textContent = `${combat.score} points`
    el('roundBody').textContent =
      `${combat.killed} killed, ${combat.timesShot} times hit, ` +
      `${(accuracy(combat) * 100).toFixed(0)}% accuracy.`
  }
}

/**
 * The model's names, floated over the furniture they belong to.
 *
 * Cheap, and it is what makes the room read as *yours* rather than as geometry
 * that happens to have come from a camera. Positioned by projecting the top edge
 * of each rectangle through the matrix the frame was drawn with.
 */
function renderLabels(mvp: Float32Array): void {
  const host = el('labels')
  if (occluderLabels.size === 0) {
    host.textContent = ''
    return
  }
  const positions: Array<{ x: number; y: number; text: string }> = []
  for (const o of room.occluders) {
    const text = occluderLabels.get(geomKey(o))
    if (!text) continue
    const p = project(mvp, { x: (o.x0 + o.x1) / 2, y: o.y1, z: o.z })
    if (p.w <= 0 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) continue
    positions.push({
      x: ((p.x + 1) / 2) * innerWidth,
      y: ((1 - p.y) / 2) * innerHeight,
      text,
    })
  }
  if (host.childElementCount !== positions.length) {
    host.textContent = ''
    for (const _ of positions) {
      const d = document.createElement('div')
      d.className = 'label'
      host.append(d)
    }
  }
  positions.forEach((p, i) => {
    const node = host.children[i] as HTMLElement | undefined
    if (!node) return
    node.textContent = p.text
    node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -120%)`
  })
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
  sfx.exposed(f)
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

/* ---------------- a level from a sentence ---------------- */

let designing = false

/**
 * The newest role for the model, and the cleanest statement of the architecture:
 * the room scan asked a depth model where the surfaces *are*; this asks a language
 * model where the walls *should go*. Not one line of the boundary or the engine
 * changes, because both produce the same typed RoomScan and both are treated as
 * hostile on arrival.
 */
async function designLevel(description: string): Promise<void> {
  if (designing) return
  const key = el<HTMLInputElement>('apikey').value
  const panel = el('scan')
  panel.style.display = 'block'
  el('scanTitle').textContent = 'Designing a level'
  el('scanStage').textContent = description
  el('scanMeta').textContent = ''

  if (!key.trim()) {
    el('scanTitle').textContent = 'This one needs a key'
    el('scanStage').textContent =
      'Paste a Claude API key below the description. It is never stored, and the ' +
      'three shipped levels need none.'
    setTimeout(() => { panel.style.display = 'none' }, 5000)
    return
  }

  designing = true
  buildButton.disabled = true
  buildButton.textContent = 'Asking…'
  try {
    const { askForLevel } = await import('./perceive/askForLevel')
    const result = await askForLevel(key, description)
    if (!result.ok) {
      el('scanTitle').textContent = 'It could not build that'
      el('scanStage').textContent = result.reason
      return
    }

    const validated = validateScan(result.report.scan)
    room = validated.scan
    roomSource = `${result.name}, designed`
    applyMood(`${result.name} ${result.blurb} ${description}`, roundSeed)
    roomUv = new Map()
    occluderLabels = new Map()
    for (const o of room.occluders) occluderLabels.set(geomKey(o), o.label)
    renderer.setRoomTexture(null)
    roundSeed++
    rebuildLineup()
    recordCost(result.cost, result.ms, result.report.dropped, result.report.clamped)

    el('roundTitle').textContent = result.name
    el('roundBody').textContent = result.blurb
    el('scanTitle').textContent = result.name
    el('scanStage').textContent = result.blurb
    // The whole point, in one line: what it proposed, and what survived.
    el('scanMeta').textContent =
      `proposed   ${result.report.proposed} walls, kept ${result.report.kept}` +
      (result.report.clamped ? `, ${result.report.clamped} values clamped` : '') +
      (result.report.dropped ? `, ${result.report.dropped} dropped` : '') +
      `\ncandidates ${room.anchors.length} positions offered by the grid` +
      `\nengine     kept ${enemies.length} as fair enemies for your body`
  } catch (err) {
    el('scanTitle').textContent = 'It could not build that'
    el('scanStage').textContent = err instanceof Error ? err.message : String(err)
  } finally {
    designing = false
    buildButton.disabled = false
    buildButton.textContent = 'Build this level'
    setTimeout(() => { panel.style.display = 'none' }, 9000)
  }
}

const describeInput = el<HTMLInputElement>('describe')
const buildButton = el<HTMLButtonElement>('build')

/**
 * A form rather than a keypress listener. Enter works from *either* field because
 * that is what a form does, and there is a button because the only way in before
 * was knowledge I had put in a chat message rather than in the product.
 */
el<HTMLFormElement>('compose').addEventListener('submit', (e) => {
  e.preventDefault()
  // Blurred on submit, or space would keep typing into the box instead of
  // starting the round — which is the next thing anybody wants to do.
  describeInput.blur()
  el<HTMLInputElement>('apikey').blur()
  void designLevel(describeInput.value)
})

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
      `\nhead     ${head.z.toFixed(0)} cm, measured   far wall ${farWallCm} cm, assumed` +
      `\nmask     ${(report.maskCoverage * 100).toFixed(0)}% of frame is you` +
      (report.maskFlipped ? ' (flipped: the segmenter had it backwards)' : '')

    if (!report.outcome.ok) {
      el('scanTitle').textContent = 'The scan found nothing to play with'
      el('scanStage').textContent = report.outcome.reason
      el('scanMeta').textContent = meta
    } else {
      room = report.outcome.scan
      // The frame becomes the level art, and each piece of cover is drawn with
      // the pixels it was measured from.
      roomUv = new Map()
      occluderLabels = new Map()
      const found = report.outcome
      found.scan.occluders.forEach((o, i) => {
        const box = found.regions[i]
        if (!box) return
        roomUv.set(geomKey(o), {
          u0: box.u0 / found.frameWidth,
          v0: box.v0 / found.frameHeight,
          u1: (box.u1 + 1) / found.frameWidth,
          v1: (box.v1 + 1) / found.frameHeight,
        })
      })
      // Kept, not shown: `t` switches to it. The cleaned frame, not the raw one —
      // the raw one has the player in it.
      photoTexture = report.textureCanvas
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
          for (const o of room.occluders) {
            // The label the model gave, if this rectangle kept one.
            if (!o.label.startsWith('band-')) occluderLabels.set(geomKey(o), o.label)
          }
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
  if (e.button === 0) {
    firing = true
    // WebAudio has to start from a gesture, so the first shot is what unlocks it.
    sfx.unlock()
  }
})

let roundStartedAt = 0
addEventListener('keydown', (e) => {
  // Typing is not playing. Checked here as well as in the tracker, because both
  // listen on the window and either one stealing a keystroke ruins the other.
  if (isTyping()) return
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
  } else if (k === '[' || k === ']') {
    roomIndex = (roomIndex + (k === ']' ? 1 : rooms.length - 1)) % rooms.length
    const next = rooms[roomIndex]!
    room = next.scan
    roomSource = next.name
    applyMood(`${next.name} ${next.blurb}`, roomIndex + 1)
    roomUv = new Map()
    occluderLabels = new Map()
    renderer.setRoomTexture(null)
    roundSeed++
    rebuildLineup()
    el('roundBody').textContent = next.blurb
  } else if (k === 'c') {
    void useCamera()
  } else if (k === 'm') {
    usePointerHead()
  } else if (k === 'p') {
    void runScan()
  } else if (k === 'k') {
    void runCalibration()
  } else if (k === 'h') {
    const p = el('hud')
    p.classList.toggle('collapsed')
  } else if (k === 't') {
    /**
     * Materials or the photograph of your actual room. Materials by default,
     * because a beige wall is a beige rectangle however it is shaded — but the
     * photograph stays available, since recognising your own furniture is worth
     * something a stone texture cannot buy.
     */
    showPhoto = !showPhoto && photoTexture !== null
    renderer.setRoomTexture(showPhoto ? photoTexture : null)
    renderer.posterise = showPhoto
    el('tracker').textContent = showPhoto
      ? 'showing your room on the cover'
      : photoTexture
        ? 'plain silhouettes'
        : 'no scan yet — press p with the webcam on'
  } else if (k === 'n') {
    sfx.setEnabled(!sfx.enabled)
    el('tracker').textContent = sfx.enabled ? 'sound on' : 'sound off'
  } else if (k === 'r') {
    const r = el('ruler')
    r.style.display = r.style.display === 'block' ? 'none' : 'block'
    updateRuler()
  }
})
addEventListener('resize', updateRuler)

/* ---------------- the loop ---------------- */

/**
 * The engine has to judge against the *real* display, not a nominal one. The
 * first line-up used to run before any frame had measured the canvas, so it was
 * deciding what is in frame from a guessed aspect ratio and could disagree with
 * the game about the same enemy.
 */
viewport = renderer.resize(widthCm)

let lastStatus = 0
// Collapsed by default: it plays as a game and expands into an instrument.
el('hud').classList.add('collapsed')
/**
 * The photograph is off unless asked for. A playtester's judgement, and it was
 * right twice over: a beige wall is a beige rectangle whatever the shader does to
 * it, and generating the level from the player's furniture makes the quality of
 * the experience hostage to their furniture. The scan stays a capability, not the
 * game.
 */
/**
 * No texture by default.
 *
 * A playtester's verdict on the procedural materials was that they were ugly and
 * made the levels harder to read, which is worse than ugly. The look now comes
 * from lighting and from a place to stand in — a graded floor, walls, a bright sky
 * behind — rather than from surface detail on a rectangle. The scanned photograph
 * is still one keypress away for anyone who wants to recognise their own room.
 */
renderer.roomLevel = 1
renderer.posterise = false
applyMood(`${rooms[0]!.name} ${rooms[0]!.blurb}`, 1)
rebuildLineup()
renderScene()

function frame(now: number): void {
  const eye = tracker.position() ?? envelope.rest
  const screen: Screen = renderer.resize(widthCm)
  viewport = screen
  const mvp = mode === 'window' ? offAxis(eye, screen) : symmetric(eye, screen)

  // The one question, asked once and used for everything: can this enemy see me?
  // By the symmetry in engine/exposure.ts that is also "can I shoot it".
  // The same rule the engine used: unoccluded *and* in frame. If they disagreed,
  // the game would let an enemy shoot from off the edge of the screen — which is
  // exactly what a playtester ran into.
  exposed = enemies.map(
    // Radius included: an enemy whose centre clears the edge while nine tenths of
    // its body is off the glass is not something a player can answer.
    (e) => visible(eye, e.at, room.occluders) && onScreen(eye, e.at, screen, e.radius),
  )
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
    for (const ev of combat.events) {
      if (ev.kind === 'miss' || ev.kind === 'killed') sfx.shot()
      if (ev.kind === 'killed') sfx.kill()
      if (ev.kind === 'shot') {
        sfx.hurt()
        const from = enemies[ev.index]
        if (from) shotFrom = { at: from.at, untilWallS: performance.now() / 1000 + 1.1 }
      }
    }
    firing = false
    if (combat.killed > wasKilled) flash('rgba(120,230,180,.22)')
    if (combat.timesShot > wasShot) {
      flash('rgba(230,60,70,.32)')
      shake = 1
    }
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

  renderLabels(mvp)
  shake = Math.max(0, shake - 0.045)
  renderer.draw(eye, screen, mode, 420, now / 1000, shake)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Note: `game/round.ts` — the hunt mode this replaced — is no longer wired up. It
// stays in the tree with its tests because it was a real design iteration whose
// findings are recorded in DEVLOG.md, not because anything still calls it.
