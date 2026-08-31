'use client'

import Filters from './Filters'
import EventList from './EventList'
import type { Event, EventFilters } from '@/types/event'

type SortBy = 'date_asc' | 'date_desc' | 'region'

interface Props {
  filters: EventFilters
  onFiltersChange: (f: EventFilters) => void
  defaultFromDate: string
  sortBy: SortBy
  onSortChange: (s: SortBy) => void
  events: Event[]
  selectedId?: string
  onSelect: (e: Event) => void
  loading: boolean
}

export default function SidebarPanel({
  filters, onFiltersChange, defaultFromDate,
  sortBy, onSortChange,
  events, selectedId, onSelect, loading,
}: Props) {
  return (
    <>
      <Filters filters={filters} onChange={onFiltersChange} defaultFromDate={defaultFromDate} />
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-xs text-gray-400">Ordina per</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
        >
          <option value="date_asc">Data ↑</option>
          <option value="date_desc">Data ↓</option>
          <option value="region">Regione A–Z</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EventList
          events={events}
          selectedId={selectedId}
          onSelect={onSelect}
          loading={loading}
        />
      </div>
    </>
  )
}
