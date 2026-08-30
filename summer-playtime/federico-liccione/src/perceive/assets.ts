/**
 * Where the local model files live, wherever the page happens to be served from.
 *
 * Every asset path here used to start with a slash, which is correct exactly once:
 * when the app is at the root of its origin. It is served from a subdirectory on
 * GitHub Pages, and an absolute path there resolves to the wrong origin root and
 * 404s — so the webcam would have failed on the one link anybody is going to click,
 * while working perfectly on the machine it was built on.
 *
 * `import.meta.env.BASE_URL` is what Vite substitutes for the configured `base`,
 * and it always ends in a slash. Nothing else in this project should build an asset
 * path by hand.
 */
/**
 * Typed by hand rather than by pulling in `vite/client`, which would widen the
 * ambient types for the tests and the tools as well. One property is enough.
 */
const meta = import.meta as ImportMeta & { readonly env?: { readonly BASE_URL?: string } }
const BASE = meta.env?.BASE_URL ?? '/'

export const assetUrl = (path: string): string =>
  `${BASE.endsWith('/') ? BASE : `${BASE}/`}${path.replace(/^\/+/, '')}`
