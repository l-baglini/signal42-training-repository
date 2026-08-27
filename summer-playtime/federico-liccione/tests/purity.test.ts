/**
 * I6 — engine purity, checked against the source rather than promised in prose.
 *
 * The engine makes guarantees about fairness. A guarantee that could depend on
 * the network, the clock, storage or an unseeded random number is not a
 * guarantee, so this test reads every engine file and fails if one of them grows
 * a way to reach outside itself.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ENGINE = new URL('../src/engine/', import.meta.url).pathname

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['Math.random', /\bMath\s*\.\s*random\s*\(/],
  ['Date.now', /\bDate\s*\.\s*now\s*\(/],
  ['new Date', /\bnew\s+Date\b/],
  ['fetch', /\bfetch\s*\(/],
  ['performance', /\bperformance\s*\./],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window.', /\bwindow\s*\./],
  ['document.', /\bdocument\s*\./],
  ['process.', /\bprocess\s*\./],
  ['globalThis', /\bglobalThis\b/],
  ['navigator', /\bnavigator\s*\./],
]

/**
 * Comments are prose and prose is allowed to say "window". The first run of this
 * test failed on the phrase "occluders close to the window" in a doc comment,
 * which is the check being wrong rather than the engine, so the scan looks at
 * code only.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const files = readdirSync(ENGINE).filter((f) => f.endsWith('.ts'))

describe('I6 — the engine imports nothing and touches nothing', () => {
  it('finds the engine at all', () => {
    expect(files.length).toBeGreaterThan(4)
  })

  for (const f of files) {
    describe(f, () => {
      const raw = readFileSync(join(ENGINE, f), 'utf8')
      const src = code(raw)

      for (const [name, re] of FORBIDDEN) {
        it(`does not reach for ${name}`, () => {
          expect(re.test(src), `${f} references ${name}`).toBe(false)
        })
      }

      it('imports only from inside the engine', () => {
        const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!)
        for (const s of specifiers) {
          expect(s.startsWith('./'), `${f} imports '${s}' from outside the engine`).toBe(true)
        }
      })

      it('has no dependency on any package', () => {
        expect(/from\s+'(?!\.)/.test(src)).toBe(false)
      })
    })
  }
})
