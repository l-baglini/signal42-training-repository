/**
 * Is the player typing rather than playing?
 *
 * Every window-level key handler asks this first. An earlier attempt at the same
 * problem called `stopPropagation` on each field, which worked until a later edit
 * quietly removed the loop that installed it — and nothing noticed, because no
 * test can see a missing `addEventListener`.
 *
 * Asking who has focus depends on nothing: not on propagation, not on
 * registration order, not on a field existing when the page loaded. And the
 * decision itself is split out as a pure function so that it *can* be tested,
 * which the previous version could not be.
 */

/** The parts of a focused element the decision actually needs. */
export interface FocusLike {
  readonly tagName?: string
  readonly isContentEditable?: boolean
}

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTypingIn(el: FocusLike | null | undefined): boolean {
  if (!el) return false
  if (el.tagName && TEXT_ENTRY.has(el.tagName.toUpperCase())) return true
  return el.isContentEditable === true
}

export const isTyping = (): boolean => isTypingIn(document.activeElement)
