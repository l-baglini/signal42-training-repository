/**
 * The round is a pure state machine, so it is tested like one: scripted ticks,
 * no clock, no DOM, no renderer.
 *
 * Note what is NOT tested here, because it is not this file's business: whether
 * a target is reachable or a threat is dodgeable. Those are engine questions,
 * and the round only asks them through the `maySpawn` gate. SPEC §4.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  newRound,
  pointsFor,
  start,
  step,
  threatPosition,
} from '../src/game/round'
import type { RoundConfig, RoundState, TargetSpec, Tick } from '../src/game/round'
import type { Point3, Threat } from '../src/engine'

const EYE: Point3 = { x: 0, y: 0, z: 60 }
const SPECS: TargetSpec[] = [
  { leanCm: 6, windowCm: 5 },
  { leanCm: 10, windowCm: 2 },
]

const cfg: RoundConfig = { ...DEFAULT_CONFIG, seed: 3 }
const never = () => false
const always = () => true

function tick(tS: number, visible: boolean[], extra: Partial<Tick> = {}): Tick {
  return { tS, eye: EYE, visible, maySpawn: never, ...extra }
}

/** Run a scripted sequence and return the final state plus everything emitted. */
function run(
  ticks: readonly Tick[],
  config: RoundConfig = cfg,
  specs: readonly TargetSpec[] = SPECS,
): { state: RoundState; events: ReturnType<typeof step>['events'][number][] } {
  let state = start(newRound(config), config)
  const events: ReturnType<typeof step>['events'][number][] = []
  for (const t of ticks) {
    state = step(state, config, specs, t)
    events.push(...state.events)
  }
  return { state, events }
}

describe('scoring', () => {
  it('is higher for a longer lean and for a tighter window', () => {
    const base = pointsFor({ leanCm: 6, windowCm: 5 })
    expect(pointsFor({ leanCm: 12, windowCm: 5 })).toBeGreaterThan(base)
    expect(pointsFor({ leanCm: 6, windowCm: 2 })).toBeGreaterThan(base)
  })

  it('never pays out nothing, however easy', () => {
    expect(pointsFor({ leanCm: 0, windowCm: 1000 })).toBeGreaterThan(0)
  })
})

/** Ticks at 20 Hz over a span, with a fixed visibility vector. */
function span(fromS: number, toS: number, visible: boolean[]): Tick[] {
  const out: Tick[] = []
  for (let t = fromS; t <= toS + 1e-9; t += 0.05) out.push(tick(Number(t.toFixed(3)), visible))
  return out
}

describe('targets must be held, not brushed past', () => {
  it('a glimpse scores nothing', () => {
    const { state } = run([
      tick(0, [false, false]),
      tick(0.05, [true, false]),
      tick(0.1, [false, false]),
    ])
    expect(state.revealed).toBe(0)
    expect(state.score).toBe(0)
    expect(state.active).toHaveLength(1)
  })

  it('holding it for the hold time scores and leaves', () => {
    const { state, events } = run([
      tick(0, [false, false]),
      ...span(0.05, cfg.holdS + 0.3, [true, false]),
    ])
    expect(state.revealed).toBe(1)
    expect(state.active).toHaveLength(0)
    expect(events.some((e) => e.kind === 'revealed')).toBe(true)
    expect(state.score).toBeGreaterThanOrEqual(pointsFor(SPECS[0]!))
    expect(state.score).toBeLessThanOrEqual(Math.round(pointsFor(SPECS[0]!) * 1.5))
  })

  it('progress drains when sight is lost, rather than resetting', () => {
    // A flicker from the tracker must not wipe a second of held position, and in
    // poor light flickers happen.
    const { state } = run([
      tick(0, [false, false]),
      ...span(0.05, 0.6, [true, false]),
      tick(0.65, [false, false]),
      ...span(0.7, 1.2, [true, false]),
    ])
    expect(state.revealed).toBe(1)
  })

  it('but a long interruption really does lose it', () => {
    const { state } = run([
      tick(0, [false, false]),
      ...span(0.05, 0.6, [true, false]),
      ...span(0.65, 2.5, [false, false]),
      tick(2.55, [true, false]),
    ])
    expect(state.revealed).toBe(0)
    expect(state.active[0]!.heldS).toBeLessThan(0.2)
  })

  it('finding it sooner is worth more than finding it late', () => {
    const quick = run([tick(0, [false, false]), ...span(0.05, cfg.holdS + 0.2, [true, false])])
    const slow = run([
      tick(0, [false, false]),
      ...span(0.05, cfg.targetLifeS - cfg.holdS - 0.5, [false, false]),
      ...span(cfg.targetLifeS - cfg.holdS - 0.45, cfg.targetLifeS - 0.1, [true, false]),
    ])
    expect(quick.state.score).toBeGreaterThan(slow.state.score)
  })

  it('a target not found in time is missed, and scores nothing', () => {
    const { state } = run([
      tick(0, [false, false]),
      tick(cfg.targetLifeS + 0.1, [false, false]),
    ])
    expect(state.missed).toBe(1)
    expect(state.score).toBe(0)
  })

  it('a target already visible is never introduced', () => {
    // Otherwise it would score itself the instant it appeared.
    const { state } = run([tick(0, [true, true]), tick(0.1, [true, true])])
    expect(state.active).toHaveLength(0)
    expect(state.score).toBe(0)
  })

  it('works through the targets rather than repeating one', () => {
    // Note the gap of nothing-visible between the two: a target that is already
    // in view when its turn comes is skipped, so the script has to look like
    // real play — the next one appears while you are not looking at it.
    const { events } = run([
      tick(0, [false, false]),
      ...span(0.05, cfg.holdS + 0.2, [true, false]),
      ...span(cfg.holdS + 0.3, cfg.holdS + 1.0, [false, false]),
      ...span(cfg.holdS + 1.05, cfg.holdS * 2 + 1.5, [false, true]),
    ])
    const indices = events
      .filter((e) => e.kind === 'revealed')
      .map((e) => (e as { index: number }).index)
    expect(indices).toEqual([0, 1])
  })
})

describe('threats go through the engine gate, never around it', () => {
  it('a threat the gate refuses is never spawned', () => {
    const ticks = []
    for (let t = 0; t <= 60; t += 0.5) ticks.push(tick(t, [false, false], { maySpawn: never }))
    const { state, events } = run(ticks)
    expect(state.threat).toBeNull()
    expect(events.some((e) => e.kind === 'threat')).toBe(false)
  })

  it('and one it allows does spawn', () => {
    const ticks = []
    for (let t = 0; t <= 20; t += 0.5) ticks.push(tick(t, [false, false], { maySpawn: always }))
    const { events } = run(ticks)
    expect(events.some((e) => e.kind === 'threat')).toBe(true)
  })

  it('depth does not save you — only moving sideways does', () => {
    // The threat is aimed at the lateral position of the eye, so leaning back
    // keeps you in its path. This is the model the engine uses too.
    const ticks = []
    for (let t = 0; t <= 20; t += 0.2) {
      const back: Point3 = t > cfg.threatEveryS + 0.3 ? { x: 0, y: 0, z: 45 } : EYE
      ticks.push({ tS: t, eye: back, visible: [false, false], maySpawn: always })
    }
    expect(run(ticks).state.hits).toBeGreaterThan(0)
  })

  it('standing still where it lands is a hit, and it costs clock', () => {
    const ticks = []
    for (let t = 0; t <= 20; t += 0.2) ticks.push(tick(t, [false, false], { maySpawn: always }))
    const { state, events } = run(ticks)
    expect(state.hits).toBeGreaterThan(0)
    expect(events.some((e) => e.kind === 'hit')).toBe(true)
    expect(state.endsAtS).toBeLessThan(cfg.durationS)
  })

  it('moving out of the way is a dodge, and costs nothing', () => {
    // The threat aims at wherever the eye is when it spawns; leave afterwards.
    const ticks = []
    for (let t = 0; t <= 20; t += 0.2) {
      const away: Point3 = t > cfg.threatEveryS + 0.3 ? { x: 60, y: 0, z: 60 } : EYE
      ticks.push({ tS: t, eye: away, visible: [false, false], maySpawn: always })
    }
    const { state } = run(ticks)
    expect(state.dodged).toBeGreaterThan(0)
    expect(state.hits).toBe(0)
    expect(state.endsAtS).toBe(cfg.durationS)
  })

  it('travels from where it started to where it was aimed', () => {
    const threat: Threat = {
      from: { x: -100, y: 0, z: -300 },
      to: { x: 0, y: 0, z: 60 },
      tSpawn: 10,
      tImpact: 12,
      radius: 10,
    }
    expect(threatPosition(threat, 10)).toEqual(threat.from)
    expect(threatPosition(threat, 12)).toEqual(threat.to)
    expect(threatPosition(threat, 11).x).toBeCloseTo(-50, 6)
    // Clamped, so a late frame cannot fling it past the player.
    expect(threatPosition(threat, 99)).toEqual(threat.to)
  })
})

describe('the round ends', () => {
  it('at its duration', () => {
    const { state, events } = run([
      tick(0, [false, false]),
      tick(cfg.durationS + 0.1, [false, false]),
    ])
    expect(state.phase).toBe('over')
    expect(events.some((e) => e.kind === 'over')).toBe(true)
  })

  it('earlier when hits have eaten the clock', () => {
    const ticks = []
    for (let t = 0; t <= cfg.durationS; t += 0.2) {
      ticks.push(tick(t, [false, false], { maySpawn: always }))
    }
    const { state } = run(ticks)
    expect(state.hits).toBeGreaterThan(0)
    expect(state.endsAtS).toBe(cfg.durationS - state.hits * cfg.hitPenaltyS)
  })

  it('and stops changing once it is over', () => {
    let state = start(newRound(cfg), cfg)
    state = step(state, cfg, SPECS, tick(cfg.durationS + 1, [false, false]))
    const after = step(state, cfg, SPECS, tick(cfg.durationS + 2, [true, true], { maySpawn: always }))
    expect(after.score).toBe(state.score)
    expect(after.events).toHaveLength(0)
  })

  it('immediately, if the engine shipped no targets — a refusal is not a round', () => {
    const state = step(start(newRound(cfg), cfg), cfg, [], tick(0, []))
    expect(state.phase).toBe('over')
  })
})

describe('threats can be aimed at the place the player needs to be', () => {
  it('aimAt overrides the eye, so the safe place and the scoring place differ', () => {
    const peek: Point3 = { x: 18, y: 0, z: 60 }
    const ticks = []
    for (let t = 0; t <= 20; t += 0.2) {
      ticks.push({ tS: t, eye: EYE, visible: [false, false], maySpawn: always, aimAt: peek })
    }
    let state = start(newRound(cfg), cfg)
    let landed: { x: number; y: number } | null = null
    for (const t of ticks) {
      state = step(state, cfg, SPECS, t)
      if (state.threat) landed = { x: state.threat.to.x, y: state.threat.to.y }
    }
    expect(landed).toEqual({ x: peek.x, y: peek.y })
  })

  it('and standing at that place when it lands is a hit', () => {
    const peek: Point3 = { x: 18, y: 0, z: 60 }
    const ticks = []
    for (let t = 0; t <= 20; t += 0.2) {
      ticks.push({ tS: t, eye: peek, visible: [false, false], maySpawn: always, aimAt: peek })
    }
    let state = start(newRound(cfg), cfg)
    for (const t of ticks) state = step(state, cfg, SPECS, t)
    expect(state.hits).toBeGreaterThan(0)
  })
})

describe('determinism', () => {
  it('the same script produces the same round', () => {
    const script = []
    for (let t = 0; t <= 40; t += 0.25) script.push(tick(t, [t % 3 < 0.3, false], { maySpawn: always }))
    expect(JSON.stringify(run(script).state)).toBe(JSON.stringify(run(script).state))
  })
})
