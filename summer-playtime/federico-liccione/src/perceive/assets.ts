/**
 * Where the local model files live, wherever the page happens to be served from.
 *
 * Every asset path here used to start with a slash — `/mediapipe`,
 * `/models/...` — which is correct exactly once: when the app is at the root of
 * its origin. GitHub Pages serves a project site from a subdirectory, so all of
 * them resolved to the wrong root and 404'd, and the webcam failed on the one link
 * anybody is going to click while working perfectly on the machine it was built on.
 *
 * The first fix used `import.meta.env.BASE_URL`, and it did not work — for a reason
 * worth leaving here in full, because it is invisible and it cost a second deploy.
 *
 * `import.meta.env.BASE_URL` is not a value at runtime. It is a **textual**
 * substitution the bundler performs on that exact expression. TypeScript wanted a
 * type for it, so the first version read `const meta = import.meta as ImportMeta &
 * {...}` and then `meta.env?.BASE_URL` — at which point the literal expression no
 * longer appears anywhere, the bundler substitutes nothing, `env` is undefined in
 * the built chunk, and the `?? '/'` fallback quietly restores the exact bug it was
 * written to fix. **A type annotation turned a build-time feature off.**
 *
 * And it could not fail locally: `npm run dev` serves `import.meta.env` as a real
 * object at runtime, so the aliased version works perfectly in development and only
 * in development.
 *
 * So this no longer depends on the substitution at all. `document.baseURI` is the
 * page's own base, it is right in dev and in production and at any base path, and
 * it is an ordinary runtime value that no transform can silently remove.
 */

/** Exposed for the tests, which have no document. Callers should omit it. */
export function assetUrl(path: string, base?: string): string {
  const from = base ?? (typeof document === 'undefined' ? '/' : document.baseURI)
  const rel = path.replace(/^\/+/, '')
  try {
    return new URL(rel, from).href
  } catch {
    // A relative base with no origin to resolve against: keep it relative, which
    // the browser will then resolve against the document itself.
    return `${from.endsWith('/') ? from : `${from}/`}${rel}`
  }
}
