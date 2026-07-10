// Retroactive deduplication of MIT events already in the DB.
// Groups MIT events by (start_date, event_type, transport_sector) and deletes
// all but the most general/national event from each group.
// Usage: npx tsx --tsconfig scripts/tsconfig.json scripts/dedup-mit.ts

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars')

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

type MitEvent = {
  id: string
  title: string
  start_date: string | null
  event_type: string
  tags: string[]
  city: string | null
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=id,title,start_date,event_type,tags,city&source_name=eq.mit&limit=2000`,
    { headers }
  )
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const events: MitEvent[] = await res.json()

  console.log(`${events.length} eventi MIT nel DB`)

  const groups = new Map<string, MitEvent[]>()
  for (const ev of events) {
    const sector = getSector(ev.title, ev.tags)
    const city   = (ev.city ?? '').toLowerCase().trim()
    const key    = `${ev.start_date ?? 'null'}|${ev.event_type}|${sector}|${city}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ev)
  }

  const toDelete: string[] = []
  let groupsWithDups = 0

  for (const group of groups.values()) {
    if (group.length <= 1) continue
    groupsWithDups++

    const sorted = [...group].sort((a, b) => {
      const aNat = /nazional|tutte le province/i.test(`${a.title} ${a.city ?? ''}`)
      const bNat = /nazional|tutte le province/i.test(`${b.title} ${b.city ?? ''}`)
      if (aNat !== bNat) return aNat ? -1 : 1
      return a.title.length - b.title.length
    })

    const [keeper, ...dupes] = sorted
    const sector = getSector(keeper.title, keeper.tags)
    console.log(`\n[${keeper.start_date ?? 'data?'} / ${keeper.event_type} / ${sector}]`)
    console.log(`  ✓ TIENI:   ${keeper.title.slice(0, 90)}`)
    for (const d of dupes) {
      console.log(`  ✗ ELIMINA: ${d.title.slice(0, 90)}`)
      toDelete.push(d.id)
    }
  }

  console.log(`\n─────────────────────────────────────────`)
  console.log(`${groupsWithDups} gruppi con duplicati`)
  console.log(`${toDelete.length} eventi da eliminare`)

  if (!toDelete.length) {
    console.log('Nessun duplicato trovato.')
    return
  }

  // Delete in batches of 50
  const BATCH = 50
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH)
    const delRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=in.(${batch.join(',')})`,
      { method: 'DELETE', headers }
    )
    if (!delRes.ok) throw new Error(`DELETE failed: ${delRes.status}: ${await delRes.text()}`)
    deleted += batch.length
    console.log(`Eliminati ${deleted}/${toDelete.length}...`)
  }

  console.log(`\n✓ Done: ${toDelete.length} duplicati eliminati`)
}

function getSector(title: string, tags: string[]): string {
  const t = title.toLowerCase()
  if (/ferr|trenitalia|\bitalo\b|rfi\b|metro|pendolar/.test(t))           return 'ferroviario'
  if (/\baere[oi]|\bairport|malpensa|fiumicino|ciampino|orio\b/.test(t))  return 'aereo'
  if (/autobus|autolinee|\batm\b|\btram\b|\bbus\b|urbano|autoservizi|cotral/.test(t)) return 'bus'
  if (/\btaxi\b|\bncc\b/.test(t))                                         return 'taxi'
  if (/marittim|\bporto\b|\bnave\b|aliscafo/.test(t))                     return 'marittimo'
  if (/sanit|osped|medic|inferm/.test(t))                                 return 'sanita'
  const specific = (tags ?? []).filter(t => !['sciopero', 'trasporto', 'nazionale', 'altro'].includes(t))
  return specific[0] ?? 'altro'
}

main().catch((err) => { console.error(err); process.exit(1) })
