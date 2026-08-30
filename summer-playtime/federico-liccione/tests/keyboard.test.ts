/**
 * The keyboard standing in for a head.
 *
 * This file exists because the untested version made the game unwinnable without a
 * webcam, and the defect was arithmetic rather than logic: a key moved the head at
 * 70 cm/s and releasing it sprang the head back at 56 cm/s, so the only positions
 * it could hold were rest and the extremes. The levels ask for a lean of 4 to 12 cm
 * held inside a window 1 to 3.5 cm wide. Nothing in the suite could see it, because
 * it was three lines inside a closure — so the arithmetic is a pure function now,
 * and these are the properties it has to have.
 */
import { describe, expect, it } from 'vitest'
import { step, type Held, type KeyboardTrackerOptions } from '../src/perceive/keyboard'
import type { Point3 } from '../src/engine'

const O: Required<KeyboardTrackerOptions> = {
  xRangeCm: 20,
  yRangeCm: 11,
  zRestCm: 60,
  zRangeCm: 12,
  speedCmS: 26,
  driftCmS: 3.5,
  retreatCmS: 85,
}

const REST: Point3 = { x: 0, y: 0, z: 60 }
const held = (...keys: string[]): Held => new Set(keys as never[])

/** Run `n` frames at 60 Hz, which is how this is actually driven. */
function run(from: Point3, keys: Held, seconds: number): Point3 {
  let at = from
  const dt = 1 / 60
  for (let t = 0; t < seconds - 1e-9; t += dt) at = step(at, keys, dt, O)
  return at
}

describe('holding a key moves the head', () => {
  it('at the stated speed, in the stated direction', () => {
    const out = run(REST, held('left'), 0.25)
    expect(out.x).toBeCloseTo(-O.speedCmS * 0.25, 1)
    expect(run(REST, held('right'), 0.25).x).toBeCloseTo(O.speedCmS * 0.25, 1)
    expect(run(REST, held('up'), 0.2).y).toBeCloseTo(O.speedCmS * 0.2, 1)
    expect(run(REST, held('out'), 0.2).z).toBeCloseTo(60 + O.speedCmS * 0.2, 1)
  })

  it('and stops at the limit of the body rather than running off', () => {
    expect(run(REST, held('left'), 5).x).toBeCloseTo(-O.xRangeCm, 6)
    expect(run(REST, held('up'), 5).y).toBeCloseTo(O.yRangeCm, 6)
  })

  it('cancels itself when both directions are held', () => {
    // Two hands on the same axis is a mistake, not an instruction. It eases home
    // rather than picking a winner.
    const from = { x: 9, y: 0, z: 60 }
    expect(run(from, held('left', 'right'), 0.2).x).toBeLessThan(from.x)
  })
})

describe('releasing stops the head, which is the whole fix', () => {
  it('holds its position long enough to aim from', () => {
    /**
     * The property the old version could not satisfy at any speed. A peek window is
     * as narrow as a centimetre, and the player has to arrive in one, notice, aim
     * and click. Half a second of near-stillness is the minimum that makes that a
     * skill rather than a lottery.
     */
    const at = run(REST, held('left'), 0.3)
    const after = run(at, held(), 0.5)
    expect(Math.abs(after.x - at.x)).toBeLessThan(2)
  })

  it('crosses the tightest window slowly enough to stop inside it', () => {
    // The number that made the old design impossible: at 70 cm/s a 2 cm window is
    // crossed in 29 ms. This asserts the replacement is at least three frames wide.
    const framesAcrossTwoCm = 2 / (O.speedCmS / 60)
    expect(framesAcrossTwoCm).toBeGreaterThan(3)
  })

  it('drifts home eventually, so an abandoned head does not sit out in the open', () => {
    const at = run(REST, held('left'), 0.4)
    expect(run(at, held(), 8).x).toBeCloseTo(0, 6)
  })

  it('but slowly enough not to fight the player', () => {
    // A drift that outruns the aiming is the old bug wearing a smaller number.
    const at = run(REST, held('right'), 0.3)
    const drifted = run(at, held(), 0.25)
    expect(at.x - drifted.x).toBeLessThan(1.5)
  })
})

describe('shift is the retreat, and it is the one movement that must be fast', () => {
  it('returns to rest inside a fuse', () => {
    /**
     * Cover is what the game asks you to reach under time pressure — the fuses the
     * solver derives are around nine tenths of a second — so the retreat has to
     * beat that comfortably from anywhere in the range.
     */
    const corner = { x: -O.xRangeCm, y: O.yRangeCm, z: 60 }
    const back = run(corner, held('duck'), 0.4)
    expect(Math.hypot(back.x, back.y)).toBeLessThan(1)
  })

  it('overrides a key that is still held', () => {
    // The worst possible moment to be clever about precedence is the moment the
    // player is trying to get out of a line of fire.
    const at = { x: -12, y: 0, z: 60 }
    const back = step(at, held('left', 'duck'), 1 / 60, O)
    expect(back.x).toBeGreaterThan(at.x)
  })

  it('does not overshoot past rest', () => {
    expect(run({ x: 4, y: 0, z: 60 }, held('duck'), 2).x).toBeCloseTo(0, 6)
    expect(run({ x: 0, y: 0, z: 71 }, held('duck'), 2).z).toBeCloseTo(60, 6)
  })
})

describe('the step is frame-rate independent', () => {
  it('lands in the same place at 30 Hz and at 120 Hz', () => {
    // Otherwise the game is a different game on a slower machine, which is the one
    // thing this project's fairness argument is built to prevent.
    const walk = (dt: number) => {
      let at = REST
      for (let t = 0; t < 0.4 - 1e-9; t += dt) at = step(at, held('left'), dt, O)
      return at.x
    }
    expect(walk(1 / 120)).toBeCloseTo(walk(1 / 30), 1)
  })

  it('clamps an absurd frame gap rather than teleporting', () => {
    // A backgrounded tab returns with a gap of seconds. Moving the head a metre on
    // the first frame back would be an instant death nobody could have answered.
    const jumped = step(REST, held('left'), 30, O)
    expect(jumped.x).toBeGreaterThan(-3)
  })

  it('treats a negative or zero gap as no movement', () => {
    expect(step(REST, held('left'), 0, O)).toEqual(REST)
    expect(step(REST, held('left'), -1, O)).toEqual(REST)
  })
})
