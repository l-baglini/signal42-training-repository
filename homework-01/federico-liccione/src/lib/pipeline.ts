// Pipeline orchestrator: scrape → extract → geocode → deduplicate → persist
// Called by the /api/scrape cron endpoint

import { scrapeCgsse } from './scrapers/cgsse'
import { scrapeMit } from './scrapers/mit'
import { scrapeTelegram } from './scrapers/telegram'
import { scrapeCentriSociali } from './scrapers/centrisociali'
import { extractBatch } from './claude'
import { geocode, type GeoResult } from './geocoder'
import { getAdminClient } from './supabase'
import type { RawEvent, ExtractedEvent } from '@/types/event'
import { createHash } from 'crypto'

export interface PipelineResult {
  scraped: number
  extracted: number
  geocoded: number
  inserted: number
  skipped: number
  errors: string[]
}

export async function runPipeline(sources: ('cgsse' | 'mit' | 'telegram' | 'centrisociali')[] = ['mit', 'telegram', 'centrisociali']): Promise<PipelineResult> {
  const result: PipelineResult = { scraped: 0, extracted: 0, geocoded: 0, inserted: 0, skipped: 0, errors: [] }
  const supabase = getAdminClient()

  // 1. Scrape all configured sources in parallel
  const scrapers: Promise<RawEvent[]>[] = []
  if (sources.includes('cgsse'))          scrapers.push(scrapeCgsse().catch(e => { result.errors.push(`cgsse: ${e}`); return [] }))
  if (sources.includes('mit'))            scrapers.push(scrapeMit().catch(e => { result.errors.push(`mit: ${e}`); return [] }))
  if (sources.includes('telegram'))       scrapers.push(scrapeTelegram().catch(e => { result.errors.push(`telegram: ${e}`); return [] }))
  if (sources.includes('centrisociali'))  scrapers.push(scrapeCentriSociali().catch(e => { result.errors.push(`centrisociali: ${e}`); return [] }))

  const batches = await Promise.all(scrapers)
  const raws = batches.flat()
  result.scraped = raws.length
  console.log(`[pipeline] scraped ${raws.length} raw items`)

  if (!raws.length) return result

  // 1b. Filter out URLs already in the DB to avoid re-extracting known content
  const newRaws = await filterSeenUrls(supabase, raws)
  if (newRaws.length < raws.length) {
    console.log(`[pipeline] URL dedup: ${raws.length - newRaws.length} già nel DB, ${newRaws.length} nuovi`)
  }
  if (!newRaws.length) return result

  // 2. Claude Haiku extraction with prompt caching
  const extracted = await extractBatch(newRaws, (done, total) => {
    console.log(`[pipeline] extracted ${done}/${total}`)
  })
  // 3. Flatten results — digest posts can produce multiple events per raw message
  const pairs: Array<{ raw: RawEvent; ext: ExtractedEvent }> = []
  for (const { raw, events } of extracted) {
    for (const ext of events) pairs.push({ raw, ext })
  }
  if (pairs.length > newRaws.length) {
    console.log(`[pipeline] ${newRaws.length} messaggi → ${pairs.length} eventi (digest espansi)`)
  }
  const deduped = deduplicateMit(pairs)

  // Filter out events with a known past start_date; keep null dates (unknown = possibly future)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = deduped.filter(({ ext }) => !ext.start_date || ext.start_date.slice(0, 10) >= today)
  if (deduped.length > upcoming.length) {
    console.log(`[pipeline] date filter: ${deduped.length - upcoming.length} past events dropped, ${upcoming.length} remaining`)
  }
  result.extracted = upcoming.length

  if (!upcoming.length) return result

  // 4. Geocode unique locations, reusing known coords from DB to minimize Nominatim calls
  console.log('[pipeline] loading geocache from DB...')
  let knownGeos: Array<{ location_text: string | null; city: string | null; lat: number; lng: number }> = []
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('geocache query timeout')), 10_000)
    )
    const query = supabase
      .from('events')
      .select('location_text, city, lat, lng')
      .not('lat', 'is', null)
      .limit(2000)
    const { data } = await Promise.race([query, timeout])
    knownGeos = data ?? []
  } catch (e) {
    console.warn('[pipeline] geocache load failed, proceeding without cache:', e)
  }
  console.log(`[pipeline] geocache: ${knownGeos.length} known locations`)

  const geoCache = new Map<string, GeoResult | null>()
  for (const ev of knownGeos ?? []) {
    if (ev.lat != null && ev.lng != null) {
      const key = `${ev.location_text ?? ''}|${ev.city ?? ''}`
      if (!geoCache.has(key)) geoCache.set(key, { lat: ev.lat, lng: ev.lng })
    }
  }

  const uniqueLocations = [...new Set(
    upcoming
      .filter(({ ext }) => ext.location_text || ext.city)
      .map(({ ext }) => `${ext.location_text ?? ''}|${ext.city ?? ''}`)
      .filter(key => !geoCache.has(key))
  )]
  console.log(`[pipeline] ${uniqueLocations.length} new locations to geocode, ${geoCache.size} from DB cache`)

  let newGeocoded = 0
  for (const { ext } of upcoming) {
    if (!ext.location_text && !ext.city) continue
    const key = `${ext.location_text ?? ''}|${ext.city ?? ''}`
    if (geoCache.has(key)) continue
    try {
      geoCache.set(key, await geocode(ext.location_text ?? ext.city!, ext.city ?? undefined))
      newGeocoded++
      if (newGeocoded % 10 === 0) console.log(`[pipeline] geocoded ${newGeocoded}/${uniqueLocations.length} new locations`)
    } catch {
      geoCache.set(key, null)
    }
  }
  if (newGeocoded) console.log(`[pipeline] geocoded ${newGeocoded} new locations (${geoCache.size - newGeocoded} from DB cache)`)

  const rows: Array<ReturnType<typeof buildRow>> = []
  for (const { raw, ext } of upcoming) {
    const hash = contentHash(ext.title, ext.start_date, ext.city)
    const key = `${ext.location_text ?? ''}|${ext.city ?? ''}`
    const geo = geoCache.get(key) ?? null
    if (geo) result.geocoded++
    rows.push(buildRow(raw, ext, geo?.lat ?? null, geo?.lng ?? null, hash))
  }

  // 5. Upsert — skip duplicates via content_hash unique constraint
  if (rows.length) {
    const { data, error } = await supabase
      .from('events')
      .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
      .select('id')

    if (error) {
      result.errors.push(`db: ${error.message}`)
    } else {
      result.inserted = data?.length ?? 0
      result.skipped = rows.length - result.inserted
    }
  }

  console.log(`[pipeline] done:`, result)
  return result
}

// --- MIT deduplication ---
// MIT publishes one notice per operator for each strike action.
// We group by (start_date, event_type, transport_sector) and merge duplicates.

function deduplicateMit(
  pairs: Array<{ raw: RawEvent; ext: ExtractedEvent }>
): Array<{ raw: RawEvent; ext: ExtractedEvent }> {
  const mit   = pairs.filter(p => p.raw.source_name === 'mit')
  const other = pairs.filter(p => p.raw.source_name !== 'mit')

  const groups = new Map<string, typeof mit>()
  for (const pair of mit) {
    const sector = getMitSector(pair.ext.title, pair.ext.tags ?? [])
    const city   = (pair.ext.city ?? '').toLowerCase().trim()
    const key    = `${pair.ext.start_date ?? 'null'}|${pair.ext.event_type}|${sector}|${city}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(pair)
  }

  const merged: typeof pairs = []
  for (const group of groups.values()) {
    merged.push(group.length === 1 ? group[0] : mergeMitGroup(group))
  }

  if (mit.length > merged.length) {
    console.log(`[pipeline] MIT dedup: ${mit.length} → ${merged.length} eventi`)
  }

  return [...other, ...merged]
}

function getMitSector(title: string, tags: string[]): string {
  const t = title.toLowerCase()
  if (/ferr|trenitalia|\bitalo\b|rfi\b|metro|pendolar/.test(t))          return 'ferroviario'
  if (/\baere[oi]|\bairport|malpensa|fiumicino|ciampino|orio\b/.test(t)) return 'aereo'
  if (/autobus|autolinee|\batm\b|\btram\b|\bbus\b|urbano|autoservizi|cotral/.test(t)) return 'bus'
  if (/\btaxi\b|\bncc\b/.test(t))                                        return 'taxi'
  if (/marittim|\bporto\b|\bnave\b|aliscafo/.test(t))                    return 'marittimo'
  if (/sanit|osped|medic|inferm/.test(t))                                return 'sanita'
  const specific = tags.filter(t => !['sciopero', 'trasporto', 'nazionale', 'altro'].includes(t))
  return specific[0] ?? 'altro'
}

function mergeMitGroup(
  group: Array<{ raw: RawEvent; ext: ExtractedEvent }>
): { raw: RawEvent; ext: ExtractedEvent } {
  const exts = group.map(g => g.ext)

  // Prefer national/general titles over operator-specific ones
  const sorted = [...exts].sort((a, b) => {
    const aNat = /nazional|tutte le province/i.test(`${a.title} ${a.location_text ?? ''}`)
    const bNat = /nazional|tutte le province/i.test(`${b.title} ${b.location_text ?? ''}`)
    if (aNat !== bNat) return aNat ? -1 : 1
    return a.title.length - b.title.length
  })
  const base = sorted[0]

  const cities  = [...new Set(exts.map(e => e.city).filter(Boolean)  as string[])]
  const regions = [...new Set(exts.map(e => e.region).filter(Boolean) as string[])]
  const allTags = [...new Set(exts.flatMap(e => e.tags ?? []))]

  return {
    raw: group[0].raw,
    ext: {
      ...base,
      city:          cities.length  === 1 ? cities[0]  : 'Nazionale',
      region:        regions.length === 1 ? regions[0] : '',
      location_text: cities.length  === 1 ? base.location_text : 'Nazionale',
      tags:          allTags,
    },
  }
}

function buildRow(
  raw: RawEvent,
  ext: ExtractedEvent,
  lat: number | null,
  lng: number | null,
  hash: string
) {
  return {
    title:         ext.title,
    description:   ext.description,
    event_type:    toEventType(ext.event_type),
    tags:          ext.tags,
    location_text: ext.location_text,
    city:          ext.city,
    region:        ext.region,
    lat,
    lng,
    start_date:    toDate(ext.start_date),
    end_date:      toDate(ext.end_date),
    source_url:    raw.source_url,
    source_name:   raw.source_name,
    raw_text:      raw.raw_text,
    content_hash:  hash,
  }
}

const VALID_EVENT_TYPES = new Set(['sciopero', 'manifestazione', 'corteo', 'presidio', 'altro'])

function toEventType(val: string): string {
  const normalized = val?.toLowerCase().trim()
  return VALID_EVENT_TYPES.has(normalized) ? normalized : 'altro'
}

function toDate(val: string | null | undefined): string | null {
  if (!val || val === 'null' || val === 'undefined') return null
  return val
}

async function filterSeenUrls(
  supabase: ReturnType<typeof getAdminClient>,
  raws: RawEvent[]
): Promise<RawEvent[]> {
  const urls = [...new Set(raws.map(r => r.source_url).filter(Boolean))]
  if (!urls.length) return raws

  const seen = new Set<string>()
  const CHUNK = 100
  for (let i = 0; i < urls.length; i += CHUNK) {
    const { data } = await supabase
      .from('events')
      .select('source_url')
      .in('source_url', urls.slice(i, i + CHUNK))
    data?.forEach(e => { if (e.source_url) seen.add(e.source_url) })
  }

  return raws.filter(r => !seen.has(r.source_url))
}

function contentHash(title: string, date: string | null, city: string): string {
  return createHash('sha256')
    .update([title.toLowerCase().trim(), date ?? '', city.toLowerCase().trim()].join('|'))
    .digest('hex')
    .slice(0, 16)
}
