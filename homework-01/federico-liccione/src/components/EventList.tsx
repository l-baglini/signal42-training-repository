'use client'

import type { Event, EventType } from '@/types/event'

interface EventListProps {
  events: Event[]
  selectedId?: string
  onSelect: (event: Event) => void
  loading?: boolean
}

const TYPE_BADGE: Record<EventType, { label: string; classes: string }> = {
  sciopero:       { label: 'Sciopero',       classes: 'bg-red-100 text-red-700' },
  manifestazione: { label: 'Manifestazione', classes: 'bg-orange-100 text-orange-700' },
  corteo:         { label: 'Corteo',         classes: 'bg-purple-100 text-purple-700' },
  presidio:       { label: 'Presidio',       classes: 'bg-blue-100 text-blue-700' },
  altro:          { label: 'Altro',          classes: 'bg-gray-100 text-gray-600' },
}

const SOURCE_LABEL: Record<string, string> = {
  cgsse:    'CGSSE',
  mit:      'MIT',
  telegram: 'Telegram',
  altro:    'Altro',
}

export default function EventList({ events, selectedId, onSelect, loading }: EventListProps) {
  if (loading) {
    return (
      <div className="flex flex-col divide-y divide-gray-100">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-4 py-3 animate-pulse">
            <div className="flex gap-2 mb-2">
              <div className="h-5 w-20 bg-gray-200 rounded-full" />
            </div>
            <div className="h-3.5 bg-gray-200 rounded w-4/5 mb-1.5" />
            <div className="h-3.5 bg-gray-100 rounded w-3/5 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (!events.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="text-3xl">🔍</span>
        <p className="text-sm font-medium text-gray-700">Nessun evento trovato</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Prova ad allargare il periodo, cambiare regione o rimuovere qualche filtro.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto">
      {events.map((event) => {
        const badge = TYPE_BADGE[event.event_type] ?? TYPE_BADGE.altro
        const dateStr = event.start_date
          ? new Date(event.start_date).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : null

        return (
          <button
            key={event.id}
            onClick={() => onSelect(event)}
            className={`text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
              selectedId === event.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
            }`}
          >
            <div className="flex items-start gap-2 mb-1">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
                {badge.label}
              </span>
              {!event.lat && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700">
                  no mappa
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
              {event.title}
            </p>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              {dateStr && <span>{dateStr}</span>}
              {event.city && <span>· {event.city}</span>}
              {event.region && <span>({event.region})</span>}
            </div>

            {event.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {event.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
                {event.tags.length > 4 && (
                  <span className="text-xs text-gray-400">+{event.tags.length - 4}</span>
                )}
              </div>
            )}

            {event.source_name && (
              <p className="text-xs text-gray-400 mt-1">
                Fonte: {SOURCE_LABEL[event.source_name] ?? event.source_name}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}
