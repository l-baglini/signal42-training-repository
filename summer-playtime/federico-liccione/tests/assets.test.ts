/**
 * Where the model files are looked for.
 *
 * Small, and it exists because the untested version of this shipped a deployed
 * build in which the webcam could not start: the paths were absolute, so on a site
 * served from a subdirectory they resolved to the wrong root. The fix after that
 * fix was worse — it depended on a bundler substitution that a type annotation had
 * silently switched off, and which works in `npm run dev` regardless, so nothing
 * local could have caught it.
 *
 * The base is a parameter here for exactly that reason: a path resolver whose
 * answer cannot be inspected without a browser is a path resolver nobody checks.
 */
import { describe, expect, it } from 'vitest'
import { assetUrl } from '../src/perceive/assets'

describe('assetUrl', () => {
  it('resolves against a site served from a subdirectory', () => {
    // The case that broke. `/mediapipe` on this base is a different origin root.
    expect(assetUrl('mediapipe', 'https://user.github.io/repo/'))
      .toBe('https://user.github.io/repo/mediapipe')
    expect(assetUrl('models/face_landmarker.task', 'https://user.github.io/repo/'))
      .toBe('https://user.github.io/repo/models/face_landmarker.task')
  })

  it('resolves against a document rather than a directory', () => {
    // `document.baseURI` is the page, not the folder, when there is no trailing
    // slash — and the answer has to be the same either way.
    expect(assetUrl('mediapipe', 'https://user.github.io/repo/index.html'))
      .toBe('https://user.github.io/repo/mediapipe')
  })

  it('still works at the root of an origin, which is the dev server', () => {
    expect(assetUrl('mediapipe', 'http://localhost:5173/'))
      .toBe('http://localhost:5173/mediapipe')
  })

  it('ignores a leading slash on the path it is given', () => {
    // Otherwise a caller writing the old absolute form would silently reintroduce
    // the original bug through the new function.
    expect(assetUrl('/mediapipe', 'https://user.github.io/repo/'))
      .toBe('https://user.github.io/repo/mediapipe')
  })

  it('falls back to a relative join when the base has no origin', () => {
    expect(assetUrl('mediapipe', './')).toBe('./mediapipe')
    expect(assetUrl('mediapipe', '/')).toBe('/mediapipe')
  })
})
