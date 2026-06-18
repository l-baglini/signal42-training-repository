// Geocoding via Nominatim (OpenStreetMap) — free, no API key required
// Rate limit: 1 req/s — enforce with delay between calls

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'ScioperoItalia/1.0 (f.liccione@onetag.com)'

export interface GeoResult {
  lat: number
  lng: number
}

async function nominatim(q: string): Promise<GeoResult | null> {
  try {
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) return null
    const data = await res.json()
    if (!data.length) return null

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

export async function geocode(locationText: string, city?: string): Promise<GeoResult | null> {
  // Try progressively simpler queries until one succeeds
  const candidates: string[] = []

  if (city && locationText !== city) {
    candidates.push(`${locationText}, ${city}, Italia`)
  }
  candidates.push(`${locationText}, Italia`)
  if (city) {
    candidates.push(`${city}, Italia`)
  }

  for (const q of candidates) {
    const result = await nominatim(q)
    // Always wait ≥1100ms between Nominatim calls to stay under 1 req/s limit
    await new Promise((r) => setTimeout(r, 1100))
    if (result) return result
  }

  return null
}

// Batch geocoding with Nominatim's 1 req/s limit
export async function geocodeBatch(
  locations: Array<{ text: string; city?: string }>
): Promise<Array<GeoResult | null>> {
  const results: Array<GeoResult | null> = []
  for (const loc of locations) {
    results.push(await geocode(loc.text, loc.city))
  }
  return results
}
