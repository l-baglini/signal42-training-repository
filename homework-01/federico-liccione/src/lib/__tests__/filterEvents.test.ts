import { describe, it, expect } from 'vitest'
import { filterEvents } from '../filterEvents'
import type { Event } from '@/types/event'

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'test-id',
    title: 'Test Event',
    event_type: 'manifestazione',
    tags: [],
    region: 'Lombardia',
    city: 'Milano',
    location_text: null,
    lat: 45.46,
    lng: 9.19,
    start_date: null,
    end_date: null,
    description: null,
    source_url: null,
    source_name: 'altro',
    content_hash: 'abc',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('filterEvents', () => {
  it('returns all events when all prefs are empty', () => {
    const events = [makeEvent(), makeEvent({ id: '2', region: 'Lazio' })]
    expect(filterEvents(events, { regions: [], event_types: [], tags: [] })).toHaveLength(2)
  })

  it('filters by region', () => {
    const events = [makeEvent({ region: 'Lombardia' }), makeEvent({ id: '2', region: 'Lazio' })]
    const result = filterEvents(events, { regions: ['Lazio'], event_types: [], tags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].region).toBe('Lazio')
  })

  it('includes events with null region when filtering by region', () => {
    const events = [makeEvent({ region: null }), makeEvent({ id: '2', region: 'Lazio' })]
    const result = filterEvents(events, { regions: ['Lombardia'], event_types: [], tags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].region).toBeNull()
  })

  it('filters by event_type', () => {
    const events = [makeEvent({ event_type: 'sciopero' }), makeEvent({ id: '2', event_type: 'corteo' })]
    const result = filterEvents(events, { regions: [], event_types: ['sciopero'], tags: [] })
    expect(result).toHaveLength(1)
    expect(result[0].event_type).toBe('sciopero')
  })

  it('filters by tags (any match)', () => {
    const events = [
      makeEvent({ tags: ['lavoro', 'ambiente'] }),
      makeEvent({ id: '2', tags: ['scuola'] }),
    ]
    const result = filterEvents(events, { regions: [], event_types: [], tags: ['ambiente'] })
    expect(result).toHaveLength(1)
    expect(result[0].tags).toContain('ambiente')
  })

  it('applies multiple filters together (AND logic)', () => {
    const events = [
      makeEvent({ region: 'Lombardia', event_type: 'sciopero', tags: ['lavoro'] }),
      makeEvent({ id: '2', region: 'Lazio', event_type: 'sciopero', tags: ['lavoro'] }),
      makeEvent({ id: '3', region: 'Lombardia', event_type: 'corteo', tags: ['lavoro'] }),
    ]
    const result = filterEvents(events, {
      regions: ['Lombardia'],
      event_types: ['sciopero'],
      tags: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('test-id')
  })
})
