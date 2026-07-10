// POST /api/scrape — triggered by Vercel cron or manual call
// Protected by CRON_SECRET header

import { NextRequest, NextResponse } from 'next/server'
import { runPipeline } from '@/lib/pipeline'

export const maxDuration = 300 // 5 min (Vercel Pro limit; free tier = 60s)
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const sources = body.sources ?? ['cgsse', 'mit', 'telegram']

  try {
    const result = await runPipeline(sources)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/scrape]', err)
    return NextResponse.json({ error: 'Pipeline failed', detail: String(err) }, { status: 500 })
  }
}

// Allow GET for Vercel cron (which sends GET requests)
export async function GET(req: NextRequest) {
  return POST(req)
}
