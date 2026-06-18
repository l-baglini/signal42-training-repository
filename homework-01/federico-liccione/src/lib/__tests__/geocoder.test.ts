import { describe, it, expect, vi, beforeEach } from 'vitest'
import { geocode, geocodeBatch } from '../geocoder'

// Mock global fetch and timers so tests run fast
vi.stubGlobal('fetch', vi.fn())
vi.useFakeTimers()

const mockFetch = vi.mocked(fetch)

function nominatimResponse(lat: string, lon: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([{ lat, lon }]),
  } as Response)
}

function emptyResponse() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  } as Response)
}

function errorResponse() {
  return Promise.resolve({ ok: false } as Response)
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('geocode', () => {
  it('returns coords from first successful query', async () => {
    mockFetch.mockReturnValue(nominatimResponse('45.46', '9.19'))

    const promise = geocode('Piazza Duomo', 'Milano')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ lat: 45.46, lng: 9.19 })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const url = (mockFetch.mock.calls[0][0] as string)
    expect(url).toContain('Piazza+Duomo')
    expect(url).toContain('Milano')
  })

  it('falls back to next candidate on empty result', async () => {
    mockFetch
      .mockReturnValueOnce(emptyResponse())
      .mockReturnValueOnce(nominatimResponse('41.89', '12.49'))

    const promise = geocode('Via Fantasma', 'Roma')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ lat: 41.89, lng: 12.49 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns null when all candidates fail', async () => {
    mockFetch.mockReturnValue(emptyResponse())

    const promise = geocode('Unknown Place', 'Unknown City')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    mockFetch.mockReturnValue(errorResponse())

    const promise = geocode('Piazza', undefined)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBeNull()
  })

  it('returns null on fetch exception', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    const promise = geocode('Anywhere', undefined)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBeNull()
  })

  it('omits city candidate when locationText equals city', async () => {
    mockFetch.mockReturnValue(nominatimResponse('45.07', '7.68'))

    const promise = geocode('Torino', 'Torino')
    await vi.runAllTimersAsync()
    await promise

    // Only 2 candidates: "Torino, Italia" and "Torino, Italia" (same — but city-only added, not the combined)
    // Actually: locationText === city, so the combined "Torino, Torino, Italia" is skipped
    const urls = mockFetch.mock.calls.map((c) => c[0] as string)
    expect(urls.every((u) => !u.includes('Torino%2C+Torino'))).toBe(true)
  })
})

describe('geocodeBatch', () => {
  it('processes multiple locations sequentially', async () => {
    mockFetch
      .mockReturnValueOnce(nominatimResponse('45.46', '9.19'))
      .mockReturnValueOnce(nominatimResponse('41.89', '12.49'))

    const promise = geocodeBatch([
      { text: 'Milano', city: 'Milano' },
      { text: 'Roma', city: 'Roma' },
    ])
    await vi.runAllTimersAsync()
    const results = await promise

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ lat: 45.46, lng: 9.19 })
    expect(results[1]).toEqual({ lat: 41.89, lng: 12.49 })
  })

  it('returns null entries for failed locations', async () => {
    // 'Nowhere' has 1 candidate (no city), returns empty → null
    // 'Palermo' has 1 candidate (no city), returns coords
    mockFetch
      .mockReturnValueOnce(emptyResponse())
      .mockReturnValueOnce(nominatimResponse('38.11', '13.35'))

    const promise = geocodeBatch([
      { text: 'Nowhere' },
      { text: 'Palermo' },
    ])
    await vi.runAllTimersAsync()
    const results = await promise

    expect(results[0]).toBeNull()
    expect(results[1]).toEqual({ lat: 38.11, lng: 13.35 })
  })
})
