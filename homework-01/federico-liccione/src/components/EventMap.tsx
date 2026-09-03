'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import type { Event } from '@/types/event'

interface EventMapProps {
  events: Event[]
  onGroupClick?: (events: Event[]) => void
  focusedEvent?: Event | null
  activeType?: string
  onTypeClick?: (type: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  sciopero:       '#ef4444',
  manifestazione: '#f97316',
  corteo:         '#8b5cf6',
  presidio:       '#3b82f6',
  altro:          '#6b7280',
}

export default function EventMap({ events, onGroupClick, focusedEvent, activeType, onTypeClick }: EventMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let destroyed = false

    import('leaflet').then((L) => {
      if (destroyed || !mapRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, { center: [42.5, 12.5], zoom: 6 })
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      addMarkers(map, L, events, onGroupClick, markersRef)
    })

    return () => {
      destroyed = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current) return
    import('leaflet').then((L) => {
      const map = mapInstanceRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.eachLayer((layer: any) => { if (layer instanceof L.Marker) map.removeLayer(layer) })
      addMarkers(map, L, events, onGroupClick, markersRef)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  useEffect(() => {
    if (!focusedEvent?.lat || !focusedEvent?.lng || !mapInstanceRef.current) return
    const map = mapInstanceRef.current
    const zoom = Math.max(map.getZoom(), 12)
    const marker = markersRef.current.get(focusedEvent.id)
    if (marker) map.once('moveend', () => marker.openPopup())
    map.setView([focusedEvent.lat, focusedEvent.lng], zoom, { animate: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEvent])

  return (
    <div className="relative w-full h-full" style={{ minHeight: '400px' }}>
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      <div className="absolute bottom-6 left-3 z-[1000] bg-white rounded-lg shadow border border-gray-200 px-3 py-2 text-xs space-y-1">
        {Object.entries({
          sciopero:       ['#ef4444', 'Sciopero'],
          manifestazione: ['#f97316', 'Manifestazione'],
          corteo:         ['#8b5cf6', 'Corteo'],
          presidio:       ['#3b82f6', 'Presidio'],
          altro:          ['#6b7280', 'Altro'],
        }).map(([type, [color, label]]) => {
          const isActive = activeType === type
          return (
            <button
              key={type}
              onClick={() => onTypeClick?.(type)}
              className={`flex items-center gap-1.5 w-full rounded px-1 py-0.5 transition-colors ${
                onTypeClick ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
              } ${isActive ? 'bg-gray-100 font-semibold' : ''}`}
            >
              <span style={{
                background: color, width: 10, height: 10, borderRadius: '50%',
                display: 'inline-block', border: '1.5px solid white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                opacity: activeType && !isActive ? 0.35 : 1, flexShrink: 0,
              }} />
              <span className={activeType && !isActive ? 'text-gray-400' : 'text-gray-700'}>{label}</span>
              {isActive && <span className="ml-auto text-gray-400 text-[10px] leading-none">✕</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildPopupHtml(groupEvents: Event[], index: number): string {
  const ev = groupEvents[index]
  const total = groupEvents.length
  const color = TYPE_COLORS[ev.event_type] ?? TYPE_COLORS.altro

  const dateStr = ev.start_date
    ? new Date(ev.start_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Data da definire'
  const tagsHtml = ev.tags.slice(0, 4)
    .map((t) => `<span style="background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:11px">${esc(t)}</span>`)
    .join(' ')

  const nav = total > 1 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
      <button class="popup-prev" style="background:none;border:1px solid #e5e7eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:13px;color:#374151">‹</button>
      <span style="font-size:11px;color:#9ca3af">${index + 1} / ${total}</span>
      <button class="popup-next" style="background:none;border:1px solid #e5e7eb;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:13px;color:#374151">›</button>
    </div>` : ''

  return `
    <div style="min-width:200px;max-width:280px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
        <div style="font-weight:600;font-size:13px">${esc(ev.title)}</div>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${esc(dateStr)} · ${esc(ev.city)}</div>
      <div style="margin-bottom:6px">${tagsHtml}</div>
      ${ev.source_url ? `<a href="${esc(ev.source_url)}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Fonte →</a>` : ''}
      ${nav}
    </div>`
}

function addMarkers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any, L: any, events: Event[], onGroupClick?: (events: Event[]) => void, markersRef?: MutableRefObject<Map<string, any>>
) {
  markersRef?.current.clear()

  // Group events by coordinates rounded to 2 decimal places (~1km radius).
  // Exact lat/lng rarely match even for same-city events due to geocoding variance.
  const groups = new Map<string, Event[]>()
  events.forEach((ev) => {
    if (!ev.lat || !ev.lng) return
    const key = `${ev.lat.toFixed(2)},${ev.lng.toFixed(2)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ev)
  })

  groups.forEach((groupEvents) => {
    const first = groupEvents[0]
    const color = TYPE_COLORS[first.event_type] ?? TYPE_COLORS.altro

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)${groupEvents.length > 1 ? ';outline:2px solid ' + color + ';outline-offset:2px' : ''}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })

    let currentIndex = 0

    const marker = L.marker([first.lat, first.lng], { icon })
      .bindPopup(buildPopupHtml(groupEvents, 0), { maxWidth: 300 })

    const attachNavHandlers = () => {
      const popupEl = marker.getPopup()?.getElement()
      if (!popupEl) return

      popupEl.querySelector('.popup-prev')?.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        currentIndex = (currentIndex - 1 + groupEvents.length) % groupEvents.length
        marker.getPopup()?.setContent(buildPopupHtml(groupEvents, currentIndex))
        setTimeout(attachNavHandlers, 0)
      })
      popupEl.querySelector('.popup-next')?.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        currentIndex = (currentIndex + 1) % groupEvents.length
        marker.getPopup()?.setContent(buildPopupHtml(groupEvents, currentIndex))
        setTimeout(attachNavHandlers, 0)
      })
    }

    marker.on('popupopen', () => {
      currentIndex = 0
      marker.getPopup()?.setContent(buildPopupHtml(groupEvents, 0))
      setTimeout(attachNavHandlers, 0)
      if (onGroupClick) onGroupClick(groupEvents)
    })

    marker.addTo(map)

    // Register first event id → marker for focusedEvent pan
    groupEvents.forEach((ev) => markersRef?.current.set(ev.id, marker))
  })
}
