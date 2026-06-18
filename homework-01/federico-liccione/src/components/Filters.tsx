'use client'

import { useState } from 'react'
import type { EventFilters, EventType } from '@/types/event'

const ITALIAN_REGIONS = [
  'Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna',
  'Friuli-Venezia Giulia','Lazio','Liguria','Lombardia','Marche',
  'Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
  'Trentino-Alto Adige','Umbria',"Valle d'Aosta",'Veneto',
]

const COMMON_TAGS = [
  'lavoro','ambiente','palestina','no-guerra','trasporti','sanità',
  'istruzione','femminismo','antifascismo','pensioni','precariato',
  'casa','migranti','diritti-lgbtq','energia',
]

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'sciopero',       label: 'Sciopero' },
  { value: 'manifestazione', label: 'Manifestazione' },
  { value: 'corteo',         label: 'Corteo' },
  { value: 'presidio',       label: 'Presidio' },
  { value: 'altro',          label: 'Altro' },
]

const INPUT_CLS = 'rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

interface FiltersProps {
  filters: EventFilters
  onChange: (f: EventFilters) => void
  defaultFromDate: string
}

export default function Filters({ filters, onChange, defaultFromDate }: FiltersProps) {
  const set = (patch: Partial<EventFilters>) => onChange({ ...filters, ...patch })
  const [tagsOpen, setTagsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 768
  })

  const toggleTag = (tag: string) => {
    const current = filters.tags ?? []
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    set({ tags: next.length ? next : undefined })
  }

  // Reset shows only when something differs from the default state
  const isModified =
    (filters.from_date !== defaultFromDate) ||
    !!filters.to_date ||
    !!filters.event_type ||
    !!filters.region ||
    !!(filters.query?.trim()) ||
    !!(filters.tags?.length)

  return (
    <div className="flex flex-col gap-3 p-4 bg-white border-b border-gray-200">
      <input
        type="text"
        placeholder="Cerca per titolo, città, descrizione..."
        value={filters.query ?? ''}
        onChange={(e) => set({ query: e.target.value || undefined })}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={filters.event_type ?? ''}
          onChange={(e) => set({ event_type: (e.target.value as EventType) || undefined })}
          className={INPUT_CLS}
        >
          <option value="">Tutti i tipi</option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={filters.region ?? ''}
          onChange={(e) => set({ region: e.target.value || undefined })}
          className={INPUT_CLS}
        >
          <option value="">Tutte le regioni</option>
          {ITALIAN_REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Dal: always has a real value (today by default) */}
        <label className="flex items-center gap-1 text-sm text-gray-500">
          Dal
          <input
            type="date"
            value={filters.from_date ?? ''}
            onChange={(e) => set({ from_date: e.target.value || undefined })}
            className={INPUT_CLS}
          />
        </label>

        {/* Al: custom control to avoid browser showing today on empty input */}
        <div className="flex items-center gap-1 text-sm text-gray-500">
          Al
          {filters.to_date ? (
            <>
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => set({ to_date: e.target.value || undefined })}
                className={INPUT_CLS}
              />
              <button
                onClick={() => set({ to_date: undefined })}
                className="text-gray-400 hover:text-gray-600 text-base leading-none"
                title="Rimuovi data fine"
              >
                ×
              </button>
            </>
          ) : (
            <label className="cursor-pointer">
              <span className={`${INPUT_CLS} border-dashed text-gray-400 hover:bg-gray-50 inline-block`}>
                qualsiasi
              </span>
              {/* Hidden date input — clicking the label above opens the picker */}
              <input
                type="date"
                className="sr-only"
                onChange={(e) => { if (e.target.value) set({ to_date: e.target.value }) }}
              />
            </label>
          )}
        </div>

        {isModified && (
          <button
            onClick={() => onChange({ from_date: defaultFromDate })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            Reset
          </button>
        )}
      </div>

      <div>
        <button
          onClick={() => setTagsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-1.5"
        >
          <span>Temi</span>
          {!!filters.tags?.length && (
            <span className="bg-blue-600 text-white rounded-full px-1.5 py-px text-[10px] leading-none">
              {filters.tags.length}
            </span>
          )}
          <span className="text-gray-400">{tagsOpen ? '▲' : '▼'}</span>
        </button>
        {tagsOpen && (
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TAGS.map((tag) => {
              const active = filters.tags?.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
