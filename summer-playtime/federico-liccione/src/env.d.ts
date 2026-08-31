/**
 * The two build-time substitutions this project relies on, typed so they can be
 * written as the bare literal expressions the bundler actually looks for.
 *
 * Declared by hand rather than by pulling in `vite/client`, which would widen the
 * ambient types for the tests and the tools as well — and the point of this file is
 * that these two are the only ones.
 */
interface ImportMetaEnv {
  /** Where the app is served from. Vite substitutes the configured `base`. */
  readonly BASE_URL: string
  /** `1` in the hosted build: the depth-scan pipeline is compiled out. */
  readonly VITE_NO_SCAN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
