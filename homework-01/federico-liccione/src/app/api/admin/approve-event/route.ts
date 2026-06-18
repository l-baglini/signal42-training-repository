import { createServerClient } from '@supabase/ssr'
import { getAdminClient } from '@/lib/supabase'
import { geocode } from '@/lib/geocoder'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  // Verify the caller is an authenticated admin
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { eventId, action, adminNote } = await request.json() as {
    eventId: string
    action: 'approved' | 'rejected'
    adminNote?: string
  }

  // Update submitted_event status
  const { data: ev, error: updateError } = await admin
    .from('submitted_events')
    .update({ status: action, admin_notes: adminNote ?? null, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select()
    .single()

  if (updateError || !ev) {
    return NextResponse.json({ error: updateError?.message ?? 'Evento non trovato' }, { status: 500 })
  }

  if (action !== 'approved') {
    return NextResponse.json({ ok: true })
  }

  // Geocode before inserting into the main events table
  let lat: number | null = null
  let lng: number | null = null

  const locationQuery = ev.location_text || ev.city
  if (locationQuery) {
    const geo = await geocode(locationQuery, ev.city ?? undefined)
    if (geo) { lat = geo.lat; lng = geo.lng }
  }

  const { error: insertError } = await admin.from('events').insert({
    title: ev.title,
    description: ev.description,
    event_type: ev.event_type,
    tags: ev.tags,
    location_text: ev.location_text,
    city: ev.city,
    region: ev.region,
    lat,
    lng,
    start_date: ev.start_date,
    end_date: ev.end_date,
    source_url: ev.source_url,
    source_name: 'altro',
    content_hash: `submitted_${ev.id}`,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, geocoded: lat !== null })
}
