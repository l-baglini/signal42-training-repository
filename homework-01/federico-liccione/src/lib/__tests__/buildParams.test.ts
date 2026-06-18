import { describe, it, expect } from 'vitest'
import { buildParams } from '../buildParams'

describe('buildParams', () => {
  it('returns empty params for empty filters', () => {
    expect(buildParams({}).toString()).toBe('')
  })

  it('includes query when set', () => {
    const p = buildParams({ query: 'sciopero treni' })
    expect(p.get('query')).toBe('sciopero treni')
  })

  it('includes event_type when set', () => {
    const p = buildParams({ event_type: 'corteo' })
    expect(p.get('event_type')).toBe('corteo')
  })

  it('includes from_date and to_date', () => {
    const p = buildParams({ from_date: '2026-01-01', to_date: '2026-12-31' })
    expect(p.get('from_date')).toBe('2026-01-01')
    expect(p.get('to_date')).toBe('2026-12-31')
  })

  it('joins tags with comma', () => {
    const p = buildParams({ tags: ['lavoro', 'ambiente', 'scuola'] })
    expect(p.get('tags')).toBe('lavoro,ambiente,scuola')
  })

  it('omits tags when array is empty', () => {
    const p = buildParams({ tags: [] })
    expect(p.has('tags')).toBe(false)
  })

  it('omits undefined fields', () => {
    const p = buildParams({ region: 'Lombardia' })
    expect(p.has('query')).toBe(false)
    expect(p.has('event_type')).toBe(false)
    expect(p.get('region')).toBe('Lombardia')
  })
})
