import type { EventFilters } from '@/types/event'

export function buildParams(f: EventFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.query)        p.set('query',      f.query)
  if (f.event_type)   p.set('event_type', f.event_type)
  if (f.region)       p.set('region',     f.region)
  if (f.from_date)    p.set('from_date',  f.from_date)
  if (f.to_date)      p.set('to_date',    f.to_date)
  if (f.tags?.length) p.set('tags',       f.tags.join(','))
  return p
}
