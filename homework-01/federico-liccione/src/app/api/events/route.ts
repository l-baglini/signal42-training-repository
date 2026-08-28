// GET /api/events — public endpoint for fetching events with filters
// Used by the frontend map and list views

import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import type { EventFilters } from '@/types/event'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const filters: EventFilters = {
    query:      sp.get('query') ?? undefined,
    event_type: (sp.get('event_type') as EventFilters['event_type']) ?? undefined,
    region:     sp.get('region') ?? undefined,
    from_date:  sp.get('from_date') ?? undefined,
    to_date:    sp.get('to_date') ?? undefined,
  }

  const tagParam = sp.get('tags')
  if (tagParam) filters.tags = tagParam.split(',').filter(Boolean)

  let query = getSupabase()
    .from('events')
    .select('id, title, description, event_type, tags, location_text, city, region, lat, lng, start_date, end_date, source_name, source_url')
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .limit(500)

  if (filters.event_type) {
    query = query.eq('event_type', filters.event_type)
  }
  if (filters.region) {
    query = query.ilike('region', `%${filters.region}%`)
  }
  const fromDate = filters.from_date ?? new Date().toISOString().slice(0, 10)
  // Always include null-date events (unknown date = possibly upcoming)
  query = query.or(`start_date.is.null,start_date.gte.${fromDate}`)
  if (filters.to_date) {
    query = query.or(`start_date.is.null,start_date.lte.${filters.to_date}`)
  }
  if (filters.tags?.length) {
    // PostGIS @> operator: events.tags contains ALL requested tags
    query = query.contains('tags', filters.tags)
  }
  if (filters.query) {
    query = query.or(
      `title.ilike.%${filters.query}%,description.ilike.%${filters.query}%,city.ilike.%${filters.query}%`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[api/events]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
