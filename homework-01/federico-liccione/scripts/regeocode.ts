// Retroactive geocoding for events that have city/location_text but no lat/lng
// Uses Supabase REST API directly (no WebSocket needed — works on Node 20+)
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/regeocode.ts
// Env vars required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { geocode } from '../src/lib/geocoder'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function supabaseGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function supabasePatch(path: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`)
}

async function main() {
  const events: Array<{ id: string; location_text: string | null; city: string | null }> =
    await supabaseGet('events?select=id,location_text,city&lat=is.null&city=not.is.null')

  if (!events.length) {
    console.log('Nessun evento da geocodificare.')
    return
  }

  console.log(`${events.length} eventi da geocodificare...`)

  let updated = 0
  let failed  = 0

  for (const event of events) {
    const result = await geocode(
      event.location_text ?? event.city!,
      event.city ?? undefined
    )

    if (result) {
      await supabasePatch(`events?id=eq.${event.id}`, { lat: result.lat, lng: result.lng })
      console.log(`✓ ${String(event.city).padEnd(20)} ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`)
      updated++
    } else {
      console.log(`✗ ${String(event.city).padEnd(20)} — ${event.location_text?.slice(0, 50)}`)
      failed++
    }
  }

  console.log(`\nDone: ${updated} aggiornati, ${failed} non trovati`)
}

main().catch((err) => { console.error(err); process.exit(1) })
