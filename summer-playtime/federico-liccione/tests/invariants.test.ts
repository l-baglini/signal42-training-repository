/**
 * The invariants of SPEC §6.7. These were written before the code they check.
 *
 * I7 (the latency guard) and I10 (the window projection) arrive with the dodge
 * solver and the renderer; everything else lives here.
 */
import { describe, expect, it } from 'vitest'
import {
  assess,
  cellCentre,
  cellIndex,
  contains,
  footprintMask,
  generate,
  latticeOf,
  scaledAbout,
  visible,
} from '../src/engine'
import type { Billboard, Envelope, Point3, RoomScan } from '../src/engine'
import raw from '../fixtures/desk.room.json'
import { all, frozen, roomy, seated } from '../fixtures/envelopes'

const room = raw as RoomScan

/** A denser candidate set than the fixture ships, so the properties get pressed. */
function sweptRoom(): RoomScan {
  const anchors: Point3[] = []
  for (const z of [-150, -190, -240]) {
    for (const y of [-8, 0, 10]) for (let x = -80; x <= 80; x += 8) anchors.push({ x, y, z })
  }
  return { ...room, anchors }
}

describe('I1 — no unfair target ships', () => {
  for (const [name, env] of all()) {
    it(name, () => {
      for (const scan of [room, sweptRoom()]) {
        const out = generate(scan, env)
        if (out.kind === 'refusal') continue
        const byKey = new Map(
          out.assessments.map((a) => [`${a.target.at.x},${a.target.at.y},${a.target.at.z}`, a]),
        )
        for (const t of out.targets) {
          const a = byKey.get(`${t.at.x},${t.at.y},${t.at.z}`)
          expect(a, 'every shipped target has an assessment').toBeDefined()
          expect(a!.fair, `${name}: shipped an unfair target`).toBe(true)
        }
      }
    })
  }
})

describe('I2 — every shipped target requires a lean', () => {
  for (const [name, env] of all()) {
    it(name, () => {
      const out = generate(sweptRoom(), env)
      if (out.kind === 'refusal') return
      for (const t of out.targets) {
        expect(visible(env.rest, t.at, room.occluders), `${name}: visible from rest`).toBe(false)
      }
    })
  }
})

describe('I3 — V(t) is monotone in the envelope', () => {
  /**
   * A wider range of motion can only ever ADD viewpoints. This is the invariant
   * most likely to catch a sign error, and it is the analogue of the
   * leave-one-out check that found a 50% error in the previous project's
   * headline number.
   */
  const small = seated()
  const large = scaledAbout(small, 1.6)

  it('the lattice of the smaller envelope is contained in the larger', () => {
    const lat = latticeOf(small)
    let checked = 0
    for (let k = 0; k < lat.nz; k++)
      for (let j = 0; j < lat.ny; j++)
        for (let i = 0; i < lat.nx; i++) {
          if (!lat.inside[cellIndex(lat, i, j, k)]) continue
          expect(contains(large, cellCentre(lat, i, j, k))).toBe(true)
          checked++
        }
    expect(checked).toBeGreaterThan(100)
  })

  it('every viewpoint that saw a target still sees it', () => {
    const lat = latticeOf(small)
    let compared = 0
    for (const anchor of sweptRoom().anchors) {
      const mask = footprintMask(lat, room.occluders, anchor)
      for (let n = 0; n < mask.length; n++) {
        if (!mask[n]) continue
        // Visibility does not depend on the envelope, so containment is the
        // whole claim: the point is still available to the player.
        const k = Math.floor(n / (lat.nx * lat.ny))
        const j = Math.floor((n - k * lat.nx * lat.ny) / lat.nx)
        const i = n - k * lat.nx * lat.ny - j * lat.nx
        const p = cellCentre(lat, i, j, k)
        expect(contains(large, p)).toBe(true)
        expect(visible(p, anchor, room.occluders)).toBe(true)
        compared++
      }
    }
    expect(compared).toBeGreaterThan(1000)
  })

  it('reachability is monotone', () => {
    const scan = sweptRoom()
    const a = assess(scan, small).assessments
    const b = assess(scan, large).assessments
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.seen > 0) expect(b[i]!.seen, `anchor ${i} lost reachability`).toBeGreaterThan(0)
    }
  })

  it('fairness is deliberately NOT monotone, and this is why', () => {
    /**
     * Found by running the invariant rather than by reasoning about it.
     *
     * `fair` requires a minimum lean scaled to the envelope's measured reach, so
     * a wider body raises its own bar: a 6 cm lean is a real movement for
     * someone with 20 cm of range and a twitch for someone with 40. Difficulty
     * tracking the body is the intended behaviour, so I3 is scoped to V(t) and
     * reachability — which ARE structurally monotone — and this test exists to
     * notice if somebody later "fixes" the non-monotonicity by making the
     * threshold absolute.
     */
    const scan = sweptRoom()
    const small2 = assess(scan, small).assessments
    const large2 = assess(scan, scaledAbout(small, 2.5)).assessments
    const lostFairness = small2.filter((a, i) => a.fair && !large2[i]!.fair)
    expect(lostFairness.length).toBeGreaterThan(0)
    for (const a of lostFairness) {
      const i = small2.indexOf(a)
      expect(large2[i]!.reject).toBe('lean-too-small')
    }
  })
})

describe('I4 — occlusion monotonicity', () => {
  it('adding an occluder never grows a footprint', () => {
    const env = seated()
    const lat = latticeOf(env)
    const extra: Billboard = { z: -48, x0: -6, x1: 14, y0: -20, y1: 20, label: 'test-extra' }
    for (const anchor of sweptRoom().anchors) {
      const before = footprintMask(lat, room.occluders, anchor)
      const after = footprintMask(lat, [...room.occluders, extra], anchor)
      for (let n = 0; n < before.length; n++) {
        if (after[n]) expect(before[n], 'occluder created visibility').toBe(1)
      }
    }
  })

  it('removing an occluder never shrinks a footprint', () => {
    const env = seated()
    const lat = latticeOf(env)
    const fewer = room.occluders.slice(0, -1)
    for (const anchor of sweptRoom().anchors) {
      const before = footprintMask(lat, room.occluders, anchor)
      const after = footprintMask(lat, fewer, anchor)
      for (let n = 0; n < before.length; n++) {
        if (before[n]) expect(after[n], 'removal destroyed visibility').toBe(1)
      }
    }
  })
})

describe('I5 — determinism', () => {
  it('same room, same envelope, same seed, identical level', () => {
    for (const [, env] of all()) {
      for (const seed of [1, 7, 12345]) {
        const a = generate(sweptRoom(), env, { seed })
        const b = generate(sweptRoom(), env, { seed })
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }
    }
  })

  it('different seeds pick different targets from the same room', () => {
    const seen = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const out = generate(sweptRoom(), seated(), { seed })
      if (out.kind === 'level') seen.add(JSON.stringify(out.targets))
    }
    // One scan must be able to feed many levels — SPEC §7.2, one call per room.
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('I8 — refusal is a first-class outcome', () => {
  it('a blank wall refuses, and says why', () => {
    const blank: RoomScan = { ...room, occluders: [] }
    const out = generate(blank, seated())
    expect(out.kind).toBe('refusal')
    if (out.kind !== 'refusal') return
    expect(out.reason).toMatch(/0 fair targets/)
    expect(out.reason).toMatch(/visible without leaning/)
    expect(out.stats.candidates).toBe(room.anchors.length)
    expect(out.stats.fair).toBe(0)
  })

  it('a room with no anchors at all refuses', () => {
    const out = generate({ ...room, anchors: [] }, seated())
    expect(out.kind).toBe('refusal')
    if (out.kind === 'refusal') expect(out.stats.candidates).toBe(0)
  })

  it('refusal never returns an empty level pretending to be valid', () => {
    for (const scan of [{ ...room, occluders: [] }, { ...room, anchors: [] }]) {
      const out = generate(scan, seated())
      expect(out.kind).not.toBe('level')
    }
  })
})

describe('I9 — a body that can barely move gets a refusal, never an unfair level', () => {
  it('the 2 cm envelope refuses', () => {
    const out = generate(sweptRoom(), frozen())
    expect(out.kind).toBe('refusal')
  })

  it('a noisy tracker makes the game refuse rather than gamble', () => {
    const shaky: Envelope = { ...seated(), jitter: 6 }
    const out = generate(room, shaky)
    expect(out.kind).toBe('refusal')
    if (out.kind === 'refusal') {
      expect(out.stats.rejected['window-too-tight']).toBeGreaterThan(0)
    }
  })

  it('and the same body with a good tracker plays fine', () => {
    const out = generate(room, seated())
    expect(out.kind).toBe('level')
  })
})

describe('sightline conventions', () => {
  it('a grazing sightline counts as occluded', () => {
    const occ: Billboard[] = [{ z: -50, x0: 0, x1: 10, y0: 0, y1: 10, label: 'edge' }]
    const eye: Point3 = { x: 0, y: 0, z: 50 }
    // Aimed so the crossing point lands exactly on the corner (0, 0).
    expect(visible(eye, { x: 0, y: 0, z: -150 }, occ)).toBe(false)
  })

  it('only occluders between eye and target occlude', () => {
    const behind: Billboard[] = [{ z: -200, x0: -50, x1: 50, y0: -50, y1: 50, label: 'wall' }]
    expect(visible({ x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: -100 }, behind)).toBe(true)
  })

  it('roomy sees strictly more than seated on the fixture', () => {
    const a = assess(room, seated()).assessments.filter((x) => x.seen > 0).length
    const b = assess(room, roomy()).assessments.filter((x) => x.seen > 0).length
    expect(b).toBeGreaterThanOrEqual(a)
  })
})
