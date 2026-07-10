// Standalone entry point for running the pipeline from GitHub Actions (no Vercel timeout)
// Usage: npx tsx --tsconfig tsconfig.json scripts/run-pipeline.ts
// Env vars required: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { runPipeline } from '../src/lib/pipeline'

async function main() {
  const sourcesArg = process.env.SOURCES ?? 'mit,telegram,centrisociali'
  const sources = sourcesArg.split(',').map((s) => s.trim()) as ('cgsse' | 'mit' | 'telegram' | 'centrisociali')[]

  console.log(`[run-pipeline] sources: ${sources.join(', ')}`)

  const result = await runPipeline(sources)

  console.log('[run-pipeline] result:', JSON.stringify(result))

  if (result.errors.length > 0) {
    console.error('[run-pipeline] errors:', result.errors)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
