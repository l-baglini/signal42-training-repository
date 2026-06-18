import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function xmlEscape(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://protestapp.vercel.app'
  const today = new Date().toISOString().slice(0, 10)

  const { data: events } = await getSupabase()
    .from('events')
    .select('id, title, description, event_type, city, region, start_date, source_url, created_at')
    .or(`start_date.is.null,start_date.gte.${today}`)
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(100)

  const items = (events ?? []).map((ev) => {
    const pubDate = ev.created_at ? new Date(ev.created_at).toUTCString() : new Date().toUTCString()
    const location = [ev.city, ev.region].filter(Boolean).join(', ')
    const description = ev.description
      ? xmlEscape(ev.description)
      : `${xmlEscape(ev.event_type)} ${location ? `a ${xmlEscape(location)}` : 'in Italia'}`
    const link = ev.source_url ?? `${siteUrl}/eventi/${ev.id}`

    return `  <item>
    <title>${xmlEscape(ev.title)}</title>
    <link>${xmlEscape(link)}</link>
    <guid isPermaLink="false">${ev.id}</guid>
    <description>${description}</description>
    <pubDate>${pubDate}</pubDate>
    ${location ? `<category>${xmlEscape(ev.city ?? ev.region ?? '')}</category>` : ''}
  </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ProtestApp — Scioperi e manifestazioni in Italia</title>
    <link>${siteUrl}</link>
    <description>Mappa interattiva di scioperi, cortei e manifestazioni in Italia</description>
    <language>it</language>
    <atom:link href="${siteUrl}/api/feed" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
