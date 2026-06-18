import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import type { EventFilters } from '@/types/event'

function icalDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

function icalEscape(s: string | null | undefined): string {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function foldLine(line: string): string {
  const MAX = 75
  if (line.length <= MAX) return line
  let out = ''
  while (line.length > MAX) {
    out += line.slice(0, MAX) + '\r\n '
    line = line.slice(MAX)
  }
  return out + line
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const id = sp.get('id')

  let query = getSupabase()
    .from('events')
    .select('id, title, description, event_type, city, region, location_text, start_date, end_date, source_url')
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(200)

  if (id) {
    query = query.eq('id', id)
  } else {
    const filters: EventFilters = {
      event_type: (sp.get('event_type') as EventFilters['event_type']) ?? undefined,
      region:     sp.get('region') ?? undefined,
      from_date:  sp.get('from_date') ?? new Date().toISOString().slice(0, 10),
      to_date:    sp.get('to_date') ?? undefined,
    }
    if (filters.event_type) query = query.eq('event_type', filters.event_type)
    if (filters.region) query = query.ilike('region', `%${filters.region}%`)
    if (filters.from_date) query = query.or(`start_date.is.null,start_date.gte.${filters.from_date}`)
    if (filters.to_date) query = query.or(`start_date.is.null,start_date.lte.${filters.to_date}`)
  }

  const { data: events } = await query
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://protestapp.vercel.app'

  const vevents = (events ?? []).map((ev) => {
    const dtstart = ev.start_date ? `DTSTART;VALUE=DATE:${icalDate(ev.start_date)}` : `DTSTART;VALUE=DATE:${icalDate(new Date().toISOString())}`
    const dtend = ev.end_date
      ? `DTEND;VALUE=DATE:${icalDate(ev.end_date)}`
      : `DTEND;VALUE=DATE:${dtstart.split(':')[1]}`
    const location = [ev.location_text, ev.city, ev.region].filter(Boolean).join(', ')

    return [
      'BEGIN:VEVENT',
      foldLine(`UID:${ev.id}@protestapp`),
      foldLine(dtstart),
      foldLine(dtend),
      foldLine(`SUMMARY:${icalEscape(ev.title)}`),
      ev.description ? foldLine(`DESCRIPTION:${icalEscape(ev.description)}`) : '',
      location ? foldLine(`LOCATION:${icalEscape(location)}`) : '',
      ev.source_url ? foldLine(`URL:${ev.source_url}`) : foldLine(`URL:${siteUrl}/eventi/${ev.id}`),
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  }).join('\r\n')

  const cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//ProtestApp//IT`,
    `X-WR-CALNAME:ProtestApp`,
    `X-WR-CALDESC:Scioperi e manifestazioni in Italia`,
    vevents,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(cal, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="protestapp.ics"',
      'Cache-Control': 'public, s-maxage=300',
    },
  })
}
