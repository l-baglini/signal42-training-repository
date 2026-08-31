/**
 * The guard that stops typing from playing the game.
 *
 * It exists as a pure function specifically so this file can exist. The version
 * before it was a `stopPropagation` loop installed at startup, a later edit
 * removed the loop, typecheck and tests stayed green, and a playtester found it —
 * because nothing in a test suite can see an `addEventListener` that is no longer
 * there. Moving the decision out of the wiring is what made it checkable.
 */
import { describe, expect, it } from 'vitest'
import { isTypingIn } from '../src/perceive/typing'

describe('a focused text field means typing', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea']) {
    it(tagName, () => {
      expect(isTypingIn({ tagName })).toBe(true)
    })
  }

  it('and so does anything contenteditable', () => {
    expect(isTypingIn({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
})

describe('anything else means playing', () => {
  for (const el of [
    null,
    undefined,
    {},
    { tagName: 'BODY' },
    { tagName: 'CANVAS' },
    { tagName: 'BUTTON' },
    { tagName: 'DIV', isContentEditable: false },
  ]) {
    it(JSON.stringify(el) ?? 'undefined', () => {
      expect(isTypingIn(el)).toBe(false)
    })
  }

  it('is not fooled by a truthy non-boolean on isContentEditable', () => {
    // Strict comparison, because the DOM property is a boolean and anything else
    // arriving there means somebody is passing the wrong object.
    expect(isTypingIn({ tagName: 'DIV', isContentEditable: 1 as unknown as boolean })).toBe(false)
  })
})
