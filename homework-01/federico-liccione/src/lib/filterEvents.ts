import type { Event } from '@/types/event'

interface Prefs {
  regions: string[]
  event_types: string[]
  tags: string[]
}

export function filterEvents(events: Event[], prefs: Prefs): Event[] {
  return events.filter((ev) => {
    if (prefs.regions.length && ev.region && !prefs.regions.includes(ev.region)) return false
    if (prefs.event_types.length && !prefs.event_types.includes(ev.event_type)) return false
    if (prefs.tags.length && !ev.tags.some((t) => prefs.tags.includes(t))) return false
    return true
  })
}
