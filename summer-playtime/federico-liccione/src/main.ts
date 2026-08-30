/**
 * The app. Wires the engine, the renderer and a tracker together and thinks as
 * little as possible: every judgement on screen comes from `src/engine/`, and
 * this file asks and displays.
 *
 * The head says where you are. The mouse says where you are aiming. Nothing here
 * knows whether the head is a webcam, a keyboard or a pointer — that is what
 * `perceive/tracker.ts` is for.
 */
import {
  assessEnemies,
  blockingOccluders,
  chooseLineup,
  onScreen,
  playEnvelope,
  reachCm,
  threatByReach,
  threatCoverage,
  visible,
} from './engine'
import type { Billboard, Envelope, Point3, Viewport } from './engine'
import { validateScan } from './boundary/validate'
import { sweepFairAnchors } from './perceive/levelDesign'
import { buildScene, type EnemyView } from './render/geometry'
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
  pointsFor,
  accuracy,
  newCombat,
  startCombat,
  step as stepCombat,
} from './game/combat'
import type { CombatState, EnemySpec } from './game/combat'
import {
  DEFAULT_DIFFICULTY, DIFFICULTIES, combatConfigFor, difficultyById, type Difficulty,
} from './game/difficulty'
import { LEVELS } from '../fixtures/levels/authored'
import type { AuthoredLevel } from '../fixtures/levels/authored'

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
// The desk used to be appended here from the test fixture. It is a level in its
// own right now, swept like the rest of them, and lives in LEVELS.
const rooms: AuthoredLevel[] = LEVELS.map((l) => ({ ...l, scan: validateScan(l.scan).scan }))

let roomIndex = 0

let tracker: Tracker = keyboardTracker()
void tracker.start()
/** True once the browser or the user has said no. Changes what the panel offers. */
let cameraDenied = false
/** The latency the current lineup's fuses were derived from. */
let builtForLatency = tracker.latencyS()

let envelope: Envelope = referenceBody(tracker.latencyS())
/**
 * How much of the calibrated envelope the level is laid out inside, and the
 * absolute ceiling that stops a generous calibration from putting every threat
 * out of reach. The reasoning is in `playEnvelope`; the numbers were chosen by
 * running `npm run levels` at 1.0, 0.85, 0.75, 0.68 and 0.6, and COMFORT at 20,
 * 14, 12 and 11, and reading the threat profile in centimetres of lean. At 12 cm
 * the levels start running out of fair positions; at 20 nothing has moved.
 */
const PLAY_FRACTION = 0.68
const COMFORT_CM = 14
/** One definition, used by the lineup and by every sweep, so they cannot disagree. */
const playFor = (env: Envelope): Envelope =>
  playEnvelope(env, { fraction: PLAY_FRACTION, comfortCm: COMFORT_CM })
/** How deep the ordered lineup goes. Replacements come from it in order. */
const LINEUP_DEPTH = 40
let bodySource = 'reference body'
/** Has `k` actually measured this player? Decides whether the panel asks for it. */
let calibrated = false
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
let occluderLabels = new Map<string, string>()
/** The scanned frame, once there is one. `t` switches to it. */

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
/** Fraction of the body's range with a threat visible from it. See `chooseLineup`. */
let threatened = 0
/**
 * The same fraction, binned by centimetres of lean.
 *
 * The number the levels were iterated against, and the honest answer to "is a
 * designed level as good as a shipped one" — it is the measurement rather than a
 * promise, and it is shown for every level whatever proposed it. The aggregate
 * above is a poor summary of it, because a lattice has far more cells in the middle
 * of an envelope than at its edge.
 */
let threatProfile = ''
/**
 * The difficulty, and the round settings it implies.
 *
 * A difficulty here only ever moves things that are not fairness — see
 * `game/difficulty.ts` for the rule and why the fuse *margin* is on the list while
 * the fuse is not. Changing it re-derives the level, because the margin feeds
 * `assessEnemies` and the cost sign feeds `chooseLineup`.
 */
let difficulty: Difficulty = DEFAULT_DIFFICULTY
let cfg = combatConfigFor(difficulty)
let combat: CombatState = newCombat(cfg)
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

function rebuildLineup(): void {
  /**
   * The level is solved inside a **fraction** of the calibrated envelope.
   *
   * Calibration measures what a body *can* do — it asks the player to reach as far
   * as they are able — and a game has to be playable in the range they actually
   * use, which is nothing like the maximum. Measured with `npm run levels`, the
   * old behaviour put almost every threat in the outer fifth of the calibrated
   * reach: a full commit found something 99% of the time and a half-committed lean
   * 40%. A webcam player, who is sitting normally rather than performing their
   * calibration, spends the whole round in the part of the envelope where nothing
   * is. *"Talvolta non vedo proprio nemici."*
   *
   * Shrinking the solver's envelope moves the whole gradient inwards. It costs the
   * enemies that were only reachable at full stretch, which is a fair price for
   * the ones that were unreachable in practice. And it touches only *selection*:
   * exposure while playing is computed geometrically from the real eye, so leaning
   * further than this still works and still helps.
   */
  const play = playFor(envelope)
  const { assessments, lattice } = assessEnemies(room, play, {
    viewport,
    /**
     * The difficulty's one contribution to the solver, and the only kind it is
     * allowed: slack over the *derived* minimum fuse. The derivation is still
     * underneath it, so an advanced enemy is uncomfortable rather than unbeatable.
     */
    fuseMarginS: difficulty.fuseMarginS,
    /**
     * Enemies that can already see the rest position may ship.
     *
     * They were the largest rejected class in every room — 75 to 176 candidates per
     * level — and refusing them was correct for the hunt this began as, where an
     * already-visible target left nothing to find. In a cover shooter it threw away
     * the other half of the verb. Exposure is symmetric, so one that can see you
     * sitting still is one you can shoot sitting still: the decision is *take it now
     * or get out of the way*. `chooseLineup` guarantees there is still somewhere
     * safe from everything standing, and that it is reachable in time.
     */
    allowInTheOpen: false,
  })
  rejectCounts = {}
  for (const a of assessments) {
    if (!a.fair && a.reject) rejectCounts[a.reject] = (rejectCounts[a.reject] ?? 0) + 1
  }
  const fair = assessments.filter((a) => a.fair)
  /**
   * Which of the fair ones stand, and in what order, is the engine's decision —
   * `chooseLineup` orders them so that every direction this body can peek reveals
   * at least one of the first few. This used to be a rotating slice of the
   * lean-sorted list, and that could stand five enemies all requiring a long lean
   * to the same side: every one fair, and the room felt empty.
   */
  const cands = fair.map((a) => ({
    at: a.enemy.at,
    radius: a.enemy.radius,
    // The game's own difficulty measure, so the lineup opens with the enemies it
    // scores lowest and saves the long, precise ones for later in the round.
    /**
     * The game's own difficulty measure, signed by the difficulty setting:
     * `+1` opens the round with the shortest leans and loosest windows, `-1` opens
     * with the long reaches held to a centimetre. Same positions, all of them
     * already proved fair, presented from the opposite end.
     */
    cost: difficulty.costSign * pointsFor({
      leanCm: a.leanCm,
      windowCm: a.windowCm,
      fuseS: a.enemy.fuseS,
      verb: a.verb,
      retreatCm: a.retreatCm,
    }),
    retreatBudgetCm: a.retreatBudgetCm,
  }))
  const order = chooseLineup(lattice, play, room.occluders, cands, {
    viewport,
    seed: roundSeed,
    // Only the front of the list ever stands, so ordering past it is wasted work —
    // and the work is quadratic in the candidate count.
    limit: LINEUP_DEPTH,
    /**
     * Enemies that can already see the rest position stay in the engine, tested and
     * documented, and do not ship. They were the playtester's own idea and I argued
     * for them; playing both, they preferred the version where an enemy is only ever
     * something you found by leaning. That is the whole verb, and it beats a second
     * verb that dilutes it. `allowInTheOpen` above is what turns them back on.
     */
    inTheOpenShare: 0,
  })
  // Deep enough that a whole round of replacements is still new ground. They
  // arrive in coverage order, so the tail is not padding — it is the next best
  // covering set.
  const chosen = order.slice(0, LINEUP_DEPTH).map((i) => fair[i]!)
  threatened = threatCoverage(
    lattice, room.occluders, cands, order, cfg.waveSize, { viewport },
  )
  const reach = reachCm(lattice, play.rest) || 1
  const CM = [3, 6, 9, 12]
  threatProfile = threatByReach(
    lattice, play, room.occluders, cands, order, cfg.waveSize,
    CM.map((cm) => cm / reach + 1e-9), { viewport },
  )
    .map((b, i) => `${CM[i]}cm ${b.cells ? ((100 * b.threatened) / b.cells).toFixed(0) : '–'}%`)
    .join(' · ')

  enemies = chosen.map((a) => ({
    at: a.enemy.at,
    radius: a.enemy.radius,
    spec: {
      leanCm: a.leanCm,
      windowCm: a.windowCm,
      fuseS: a.enemy.fuseS,
      verb: a.verb,
      retreatCm: a.retreatCm,
    },
    leanCm: a.leanCm,
    windowCm: a.windowCm,
    retreatCm: a.retreatCm,
  }))
  exposed = enemies.map(() => false)
  aimed = enemies.map(() => false)
  // Nothing from the last round survives into this one, markers included.
  shotFrom = null
  combat = newCombat(cfg)
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

/**
 * Which cover currently has a live enemy behind it, and how many.
 *
 * `blockingOccluders` is the engine's answer, so the cue cannot disagree with the
 * rule it is cueing: it names an occluder exactly when the sightline is blocked by
 * it. Recomputed per frame because it depends on the eye — as the player leans, a
 * block stops hiding and the enemy appears out of it, which is the whole verb made
 * visible.
 */
function occupiedCover(eye: Point3): Array<{ box: Billboard; count: number }> {
  if (combat.phase !== 'playing') return []
  const tally = new Map<string, { box: Billboard; count: number }>()
  for (const a of combat.active) {
    const e = enemies[a.index]
    if (!e || exposed[a.index]) continue
    for (const o of blockingOccluders(eye, e.at, room.occluders)) {
      const k = geomKey(o)
      const seen = tally.get(k)
      if (seen) tally.set(k, { box: o, count: seen.count + 1 })
      else tally.set(k, { box: o, count: 1 })
    }
  }
  return [...tally.values()]
}

function renderScene(): void {
  const eye = tracker.position() ?? envelope.rest
  renderer.upload(
    buildScene({
      occluders: room.occluders,
      targets: [],
      enemies: combat.phase === 'playing' ? views() : [],
      occupied: occupiedCover(eye),
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
    // The measurement the lineup selection exists to move: how much of the space
    // this body can reach has a threat visible from it.
    `${(threatened * 100).toFixed(0)}% of your range is under threat\n` +
    `by lean: ${threatProfile}\n` +
    (rejects ? `rejected: ${rejects}\n` : '') +
    `body (${bodySource}): jitter ${envelope.jitter.toFixed(2)} cm · ` +
    `vmax ${envelope.vmax.toFixed(0)} cm/s · latency ${(envelope.latency * 1000).toFixed(0)} ms\n` +
    `projection: ${mode === 'window' ? 'off-axis (a window)' : 'symmetric (a dolly)'}`
}

function renderRound(): void {
  const panel = el('round')
  const remaining = Math.max(0, combat.endsAtS - combat.tS)
  el('clock').textContent =
    combat.phase === 'playing' ? remaining.toFixed(1) : cfg.durationS.toFixed(1)
  el('scoreValue').textContent = String(combat.score)
  el('tally').textContent =
    `${combat.killed} killed · ${combat.timesShot} times hit · ` +
    `${combat.active.length} still standing`

  /**
   * The panel gets out of the way while a round is running.
   *
   * An enemy can stand anywhere on the glass, and a playtester lost one behind this
   * panel — which is a fair complaint about a heads-up display that is really an
   * instrument. So it fades out for the ninety seconds, and comes back when they
   * are over. The exception is deliberate: if the numbers have been asked for with
   * `H`, watching them light up *is* the thing worth watching, so an explicit
   * choice wins over the automatic one.
   */
  const pinned = !el('hud').classList.contains('collapsed')
  el('hud').classList.toggle('tucked', combat.phase === 'playing' && !pinned)

  if (combat.phase === 'playing') {
    panel.style.display = 'none'
    return
  }
  panel.style.display = 'block'
  el('hint').style.display = 'none'
  el('hold').style.display = 'none'
  el('warm').style.display = 'none'

  /**
   * Too thin counts as a refusal, not just empty.
   *
   * A playtester found a level presenting its targets in one specific spot, and the
   * cause was that it had four fair positions and the game cheerfully stood eight
   * enemies on them. Refusal is a first-class outcome in this project; "not enough
   * to make a round" is a refusal, and saying so with the counts is more use than
   * playing a broken round.
   */
  if (enemies.length < cfg.waveSize) {
    el('roundTitle').textContent = 'No round to play'
    el('roundBody').textContent =
      (enemies.length === 0
        ? 'Nothing in this room can be fought fairly. '
        : `Only ${enemies.length} position${enemies.length === 1 ? '' : 's'} in this room ` +
          `can be fought fairly, and a round needs ${cfg.waveSize}. `) +
      `${Object.entries(rejectCounts).map(([k, n]) => `${n} ${k}`).join(', ')}.`
    return
  }
  if (combat.phase === 'ready') {
    el('roundTitle').textContent = `${rooms[roomIndex]!.name} · ${difficulty.name}`
    el('roundBody').textContent =
      `${rooms[roomIndex]!.blurb}\n${difficulty.blurb}\n\n` +
      `${cfg.waveSize} enemies are already standing in this room, and ` +
      'you cannot see any of them from here. Each one is visible only from a ' +
      'position you have to move ' +
      'your head to reach — which is also the only position it can shoot you from. ' +
      'So: lean out, shoot, and be back behind cover before its shot lands.\n\n' +
      /**
       * The controller line is written from what is actually in charge. The webcam
       * is the default and the point of the project, but a permission prompt can be
       * refused and a laptop can have no camera, so the panel says which of the
       * three is driving rather than assuming.
       */
      (tracker.kind === 'camera'
        ? 'Your head is the controller — move it, and the screen behaves like a ' +
          'window rather than a picture. Press K to spend ten seconds measuring ' +
          'your range, which is what every number in this level is scaled to.'
        : cameraDenied
          ? 'The webcam was not available, so WASD is standing in for your head: ' +
            'it leans where you hold it and stays where you let go, and shift ducks ' +
            'you back into cover. Press C to try the camera again.'
          : 'WASD stands in for your head while the webcam starts up — it stays ' +
            'where you let go, and shift ducks back into cover. ' +
            'Press C to switch by hand.') +
      '\n\nAim and shoot with the mouse. Ninety seconds; being hit costs six.'
  } else {
    el('roundTitle').textContent = `${combat.score} points`
    el('roundBody').textContent =
      `${combat.killed} killed, ${combat.timesShot} times hit, ` +
      `${(accuracy(combat) * 100).toFixed(0)}% accuracy — on ` +
      `${difficulty.name.toLowerCase()}.\n\n` +
      // Named rather than multiplied. A global score multiplier would pretend the
      // three modes are comparable, and they are not: easy gives you longer to
      // shoot more things. `pointsFor` already pays for lean and precision.
      'Scores are not comparable between difficulties — nothing is multiplied, so ' +
      'the setting is part of the result rather than hidden inside it.'
  }

  /**
   * Ask for the calibration, once it is the thing most worth doing.
   *
   * Every threshold in this game is scaled to a measured body: the minimum lean is
   * a fraction of the envelope's reach, the minimum peek window is a multiple of
   * the tracker's jitter, and the fuse is reaction plus *measured* latency plus the
   * retreat at the *measured* speed. Until `K` has run, all of that is scaled to a
   * reference body that is not the player's — playable, because `playEnvelope` caps
   * the range anyway, but it is the difference between a game tuned to you and a
   * game tuned to a stand-in.
   *
   * Only shown once the head is actually in charge. Suggesting a body measurement
   * to somebody playing on WASD would be asking them to calibrate a keyboard.
   */
  const urge = el('urge')
  const wants = tracker.kind === 'camera' && !calibrated
  urge.style.display = wants ? 'block' : 'none'
  if (wants) {
    urge.innerHTML =
      'Ten seconds well spent: press <kbd>K</kbd> and lean as far as is ' +
      'comfortable. Every number in this level — how far you must lean, how ' +
      'precisely you must hold it, how long each enemy waits before firing — is ' +
      'scaled to what that measures. Right now it is scaled to a stand-in body.'
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

    /**
     * Swept before it is played, exactly as `npm run author` sweeps a shipped
     * level.
     *
     * Fairness never depended on this — a designed room already went through the
     * same validator and the same solver, so every invariant held over it. What did
     * depend on it was *quality*: the shipped levels have their positions swept out
     * of several hundred candidates while a designed one got a coarse grid, so the
     * same walls yielded a thinner pool for no reason but which code path made
     * them. Now both are swept, and the profile below says how it came out instead
     * of asking anyone to take it on trust.
     */
    const swept = sweepFairAnchors(result.report.scan.occluders, playFor(envelope))
    const validated = validateScan(
      swept.anchors.length >= cfg.waveSize
        ? { ...result.report.scan, anchors: swept.anchors }
        : result.report.scan,
    )
    room = validated.scan
    roomSource = `${result.name}, designed`
    applyMood(`${result.name} ${result.blurb} ${description}`, roundSeed)
    occluderLabels = new Map()
    for (const o of room.occluders) occluderLabels.set(geomKey(o), o.label)
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
      `\nswept      ${swept.considered} candidate positions, ${swept.fair} provably fair` +
      `\nengine     kept ${enemies.length} for your body — ${threatProfile}`
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

/**
 * The depth scan is left out of the hosted build, and the app is told so at
 * compile time rather than discovering it as a 404.
 *
 * The scan needs 74 MB of ONNX weights that have no business in a git repository,
 * so the published build genuinely does not contain the pipeline — not the models,
 * not the half-megabyte of transformers.js that loads them. Saying that plainly
 * beats letting somebody press `p` and watch it fail, and it is also the honest
 * answer to what a static host can and cannot carry: the whole game, four levels
 * and the webcam need none of it.
 */
// Written as the bare literal expression on purpose: this is a **textual**
// substitution the bundler performs on `import.meta.env.VITE_NO_SCAN` and nothing
// else. Aliasing it through a variable — which is the obvious way to satisfy
// TypeScript — silently turns the substitution off and leaves a runtime lookup that
// finds nothing. That cost a deploy once already; see `perceive/assets.ts`.
const SCAN_AVAILABLE = import.meta.env.VITE_NO_SCAN !== '1'

async function runScan(): Promise<void> {
  if (scanning) return
  if (!SCAN_AVAILABLE) {
    const panel = el('scan')
    panel.style.display = 'block'
    el('scanTitle').textContent = 'The room scan is not in this build'
    el('scanStage').textContent =
      'It needs 74 MB of depth-model weights, which are not published with the ' +
      'hosted version. Clone the repository and run `npm run dev` for it — the ' +
      'four levels, the level designer and everything else here work as they are.'
    el('scanMeta').textContent = ''
    setTimeout(() => { panel.style.display = 'none' }, 9000)
    return
  }
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
      // Swept like a designed level and like an authored one. Same reason.
      const sweptRoom = sweepFairAnchors(report.outcome.scan.occluders, playFor(envelope))
      room = sweptRoom.anchors.length >= cfg.waveSize
        ? validateScan({ ...report.outcome.scan, anchors: sweptRoom.anchors }).scan
        : report.outcome.scan
      occluderLabels = new Map()
      roomSource = `your room, ${report.device}/${report.dtype}`
      roundSeed++
      rebuildLineup()
      el('scanTitle').textContent = 'Your room is the level'
      el('scanStage').textContent =
        `${room.occluders.length} pieces of cover, ${room.anchors.length} candidates swept — ` +
        `the engine kept ${enemies.length} as fair enemies. ${threatProfile}`
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

/**
 * The webcam is the point of the project, so it is what the game starts with.
 *
 * Not on the first frame, though. The keyboard tracker is installed
 * synchronously so the game is playable the instant the page renders, and the
 * camera replaces it when the permission prompt is answered and the face model
 * has loaded. If either fails there is nothing to recover from — the keyboard is
 * already running and says so.
 */
async function useCamera(): Promise<void> {
  if (tracker.kind === 'camera') return
  el('tracker').textContent = 'asking for the webcam, and loading the face model…'
  const { cameraTracker } = await import('./perceive/camera')
  const cam = cameraTracker({ mount: el('cam') })
  try {
    await cam.start()
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    el('tracker').textContent = `no webcam (${why}) — playing with WASD instead`
    cameraDenied = true
    renderRound()
    return
  }
  tracker.stop()
  tracker = cam
  afterTrackerChange()
}

/** Back to the keys. `c` toggles, because a webcam is not always welcome. */
function useKeyboard(): void {
  if (tracker.kind === 'keyboard') return
  tracker.stop()
  tracker = keyboardTracker()
  void tracker.start()
  afterTrackerChange()
}

function usePointerHead(): void {
  // Kept because it is still the cleanest way to judge the projection on its
  // own — but it takes the mouse away from aiming, so it is not the default.
  if (tracker.kind === 'pointer') return
  tracker.stop()
  tracker = mouseTracker(canvas)
  void tracker.start()
  afterTrackerChange()
}

/**
 * Re-derive the level for the tracker now in charge.
 *
 * Latency is not a detail here: every fuse is `reaction + latency + retreat/speed
 * + margin`, and a webcam's latency is tens of milliseconds where a keyboard's is
 * none. A lineup built against the keyboard and then played through a camera would
 * hand out fuses shorter than the body can beat — which is the one direction this
 * project's fairness is never allowed to cut. Skipped mid-round, because
 * rebuilding resets the round.
 */
function afterTrackerChange(): void {
  envelope = { ...envelope, latency: tracker.latencyS() }
  builtForLatency = envelope.latency
  if (combat.phase === 'playing') return
  rebuildLineup()
  renderRound()
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
    // A run that barely moved is not a measurement, so the panel keeps asking.
    // Marking it done would let somebody dismiss the request by nodding at it.
    calibrated = !q.degenerate
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

/* ---------------- aiming ---------------- */

/**
 * Where the crosshair is, in CSS pixels.
 *
 * Two regimes, and the reason there are two is worth stating. Outside a round the
 * crosshair *is* the operating system's cursor, one to one, because the panel has
 * sliders and a text box in it and taking the pointer away from those would be
 * hostile. Inside a round the pointer is **locked**: the cursor stops existing,
 * and the crosshair moves by accumulated deltas instead.
 *
 * Locking is what makes a sensitivity setting mean anything at all — an absolute
 * cursor already has the operating system's own acceleration applied and there is
 * nothing left to scale. It also fixes something nobody had complained about yet:
 * an absolute cursor can leave the window mid-round, and the crosshair goes with
 * it.
 */
let aimPx: { x: number; y: number } | null = null
/** Multiplies raw pointer deltas while locked. Slider, so it is the player's. */
let sensitivity = 1
let pointerLocked = false

const crosshair = el('crosshair')

function placeCrosshair(x: number, y: number): void {
  aimPx = { x, y }
  mouseNdc = { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 }
  crosshair.style.transform = `translate(${x}px, ${y}px)`
  crosshair.style.display = 'block'
}

addEventListener('pointermove', (e) => {
  if (pointerLocked) {
    // Clamped to the window: locked deltas are unbounded, and a crosshair that
    // wandered a metre off-screen would take a metre of mouse to come back.
    const from = aimPx ?? { x: innerWidth / 2, y: innerHeight / 2 }
    placeCrosshair(
      Math.min(innerWidth, Math.max(0, from.x + e.movementX * sensitivity)),
      Math.min(innerHeight, Math.max(0, from.y + e.movementY * sensitivity)),
    )
  } else {
    placeCrosshair(e.clientX, e.clientY)
  }
})

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas
  if (pointerLocked) {
    if (!aimPx) placeCrosshair(innerWidth / 2, innerHeight / 2)
    // It worked at least once, so the slider is real.
    el('sensRow').classList.remove('inert')
  }
})

/**
 * Requested from the keypress that starts the round, which is the user gesture the
 * browser requires. It can still be refused — an unfocused document, a browser
 * that has decided otherwise — and refusal is not an error: the absolute cursor
 * keeps working and only the sensitivity slider stops meaning anything, which the
 * panel says.
 */
function grabPointer(): void {
  const refused = () => el('sensRow').classList.add('inert')
  try {
    const r = canvas.requestPointerLock() as unknown
    if (r instanceof Promise) r.catch(refused)
  } catch {
    // Absolute aiming is the fallback and is already running. What the player
    // needs to know is only that the slider has nothing to act on.
    refused()
  }
}

function releasePointer(): void {
  if (document.pointerLockElement === canvas) document.exitPointerLock()
}

// Wired after the declarations above rather than beside the other sliders: this
// handler assigns `sensitivity`, and dispatching the initial event before that
// `let` is evaluated would throw on a temporal dead zone.
/**
 * The difficulty control.
 *
 * Buttons rather than a `<select>`, for a reason that is not aesthetic: a focused
 * select swallows the space bar, and the space bar starts the round. Each one blurs
 * itself after the click for the same reason.
 *
 * Changing it re-derives the level — the fuse margin feeds `assessEnemies` and the
 * cost sign feeds `chooseLineup` — and does nothing mid-round, because a rebuild
 * would restart it.
 */
const diffSeg = el('diffSeg')
for (const d of DIFFICULTIES) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = d.name
  b.dataset.id = d.id
  b.title = d.blurb
  b.addEventListener('click', () => {
    b.blur()
    if (combat.phase === 'playing' || d.id === difficulty.id) return
    difficulty = difficultyById(d.id)
    cfg = combatConfigFor(difficulty)
    renderDifficulty()
    rebuildLineup()
  })
  diffSeg.append(b)
}

function renderDifficulty(): void {
  for (const b of Array.from(diffSeg.querySelectorAll('button'))) {
    b.setAttribute('aria-pressed', String(b.dataset.id === difficulty.id))
  }
}
renderDifficulty()

const sensInput = el<HTMLInputElement>('sens')
sensInput.addEventListener('input', () => {
  sensitivity = parseFloat(sensInput.value)
  el('sensVal').textContent = `${sensitivity.toFixed(2)}x`
})
sensInput.dispatchEvent(new Event('input'))
// Inert from the start only where the browser cannot capture the pointer at all.
if (!('requestPointerLock' in canvas)) el('sensRow').classList.add('inert')
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
    if (combat.phase !== 'playing' && enemies.length >= cfg.waveSize) {
      roundSeed++
      rebuildLineup()
      combat = startCombat(cfg)
      roundStartedAt = performance.now() / 1000
      grabPointer()
      renderRound()
    }
  } else if (k === 'o') {
    /**
     * Not a setting — a comparison. The window is on from the first frame because
     * it is the project; this drops to a symmetric frustum so the difference is
     * visible side by side, which is the only way to see that the off-axis
     * projection is doing anything at all. The panel's label used to read "turn the
     * window illusion off", which reads like a feature that is on and in the way.
     */
    mode = mode === 'window' ? 'dolly' : 'window'
    renderHud()
  } else if (k === '[' || k === ']') {
    roomIndex = (roomIndex + (k === ']' ? 1 : rooms.length - 1)) % rooms.length
    const next = rooms[roomIndex]!
    room = next.scan
    roomSource = next.name
    applyMood(`${next.name} ${next.blurb}`, roomIndex + 1)
    occluderLabels = new Map()
    roundSeed++
    // No text set here: `rebuildLineup` calls `renderRound`, which writes the blurb
    // and the instructions together. Setting it again after that quietly dropped
    // the instructions every time the level changed.
    rebuildLineup()
  } else if (k === 'c') {
    if (tracker.kind === 'camera') useKeyboard()
    else void useCamera()
  } else if (k === 'm') {
    usePointerHead()
  } else if (k === 'p') {
    void runScan()
  } else if (k === 'k') {
    void runCalibration()
  } else if (k === 'h') {
    // Starts collapsed: it plays as a game and expands into an instrument.
    el('hud').classList.toggle('collapsed')
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
    combat = stepCombat(combat, cfg, enemies.map((e) => e.spec), {
      tS: now / 1000 - roundStartedAt,
      eye,
      exposed,
      aimedAt: aimed.flatMap((v, i) => (v ? [i] : [])),
      firing,
    })
    for (const ev of combat.events) {
      if (ev.kind === 'spawned' || ev.kind === 'moved') sfx.arrive()
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
    if (combat.phase !== before) {
      renderHud()
      // This branch only runs while a round was playing, so any change out of it is
      // the round ending — and the panel that comes back needs a cursor.
      releasePointer()
    }
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
    /**
     * A camera's latency is measured, so it drifts as the frame rate does, and the
     * fuses were derived from whatever it was when the level was built. Rebuild
     * when the drift is worth 2% of a fuse — but never mid-round, because a rebuild
     * starts the round over.
     */
    if (combat.phase !== 'playing' && Math.abs(measured - builtForLatency) > 0.02) {
      builtForLatency = measured
      rebuildLineup()
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

/**
 * Start the webcam, once the page is on screen.
 *
 * This is the project, so it is the default rather than a keypress. Deferred by a
 * frame on purpose: the face model is a 3.8 MB dynamic import and the permission
 * prompt is a modal, so doing it before the first paint would open a browser
 * dialog over a blank page and give the player nothing to look at while deciding.
 * By the time the prompt appears the level is drawn and the panel explains what is
 * being asked for.
 *
 * The keyboard tracker is already running and stays running if this fails, so
 * there is no failure path to write — only a message.
 */
requestAnimationFrame(() => { void useCamera() })

// Note: `game/round.ts` — the hunt mode this replaced — is no longer wired up. It
// stays in the tree with its tests because it was a real design iteration whose
// findings are recorded in DEVLOG.md, not because anything still calls it.
