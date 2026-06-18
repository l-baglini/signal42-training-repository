'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import AuthButton from '@/components/AuthButton'
import WelcomeBanner from '@/components/WelcomeBanner'
import NotificationBell from '@/components/NotificationBell'
import SidebarPanel from '@/components/SidebarPanel'
import InstallBanner from '@/components/InstallBanner'
import { buildParams } from '@/lib/buildParams'
import type { Event, EventFilters } from '@/types/event'

const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false })

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type SortBy = 'date_asc' | 'date_desc' | 'region'
type MobileView = 'map' | 'list'

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const defaultFromDate = todayISO()
  const [filters, setFilters] = useState<EventFilters>(() => {
    if (typeof window === 'undefined') return { from_date: defaultFromDate }
    const sp = new URLSearchParams(window.location.search)
    return {
      query:      sp.get('query') || undefined,
      event_type: (sp.get('event_type') as EventFilters['event_type']) || undefined,
      region:     sp.get('region') || undefined,
      from_date:  sp.get('from_date') || defaultFromDate,
      to_date:    sp.get('to_date') || undefined,
    }
  })
  const [sortBy, setSortBy] = useState<SortBy>('date_asc')
  const [selectedGroup, setSelectedGroup] = useState<Event[]>([])
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0)
  const [focusedEvent, setFocusedEvent] = useState<Event | null>(null)
  const selectedEvent = selectedGroup[selectedGroupIndex] ?? null
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileView, setMobileView] = useState<MobileView>('map')
  const debouncedFilters = useDebounce(filters, 350)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/events?${buildParams(debouncedFilters)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setEvents(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setEvents([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedFilters])

  useEffect(() => {
    const params = buildParams(filters)
    const search = params.toString()
    window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname)
  }, [filters])

  const sortedEvents = [...events].sort((a, b) => {
    if (sortBy === 'date_desc') {
      if (!a.start_date && !b.start_date) return 0
      if (!a.start_date) return 1
      if (!b.start_date) return -1
      return b.start_date.localeCompare(a.start_date)
    }
    if (sortBy === 'region') {
      return (a.region ?? '').localeCompare(b.region ?? '', 'it')
    }
    if (!a.start_date && !b.start_date) return 0
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return a.start_date.localeCompare(b.start_date)
  })

  const eventsWithCoords = sortedEvents.filter((e) => e.lat && e.lng)
  const eventsWithoutDate = sortedEvents.filter((e) => !e.start_date)

  // When user selects from list on mobile: switch to map to show detail card
  const handleListSelect = (e: Event) => {
    setSelectedGroup([e])
    setSelectedGroupIndex(0)
    setFocusedEvent(e)
    setMobileView('map')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header
        className="shrink-0 bg-white border-b border-gray-200 px-4 pb-3 flex items-center gap-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        {/* Hamburger — desktop only */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="hidden md:block p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h1 className="text-lg font-bold text-gray-900">✊ ProtestApp</h1>
        <span className="text-sm text-gray-400 hidden lg:block">
          Scioperi, manifestazioni e cortei sul territorio
        </span>

        {/* Stats — desktop only */}
        {!loading && (
          <div className="hidden md:flex text-xs text-gray-500 gap-2">
            <span>{events.length} eventi</span>
            {eventsWithoutDate.length > 0 && (
              <>
                <span>·</span>
                <span className="text-gray-400">{eventsWithoutDate.length} senza data</span>
              </>
            )}
            <span>·</span>
            <span>{eventsWithCoords.length} sulla mappa</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <AuthButton />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile: full-screen list view */}
        <div className={`md:hidden flex-col w-full overflow-hidden bg-white ${mobileView === 'list' ? 'flex' : 'hidden'}`}>
          <SidebarPanel
            filters={filters}
            onFiltersChange={setFilters}
            defaultFromDate={defaultFromDate}
            sortBy={sortBy}
            onSortChange={setSortBy}
            events={sortedEvents}
            selectedId={selectedEvent?.id}
            onSelect={handleListSelect}
            loading={loading}
          />
        </div>

        {/* Desktop: collapsible sidebar */}
        <aside
          className={`hidden md:flex flex-col bg-white border-r border-gray-200 overflow-hidden transition-all duration-200 ${
            sidebarOpen ? 'w-80 lg:w-96' : 'w-0'
          }`}
        >
          <SidebarPanel
            filters={filters}
            onFiltersChange={setFilters}
            defaultFromDate={defaultFromDate}
            sortBy={sortBy}
            onSortChange={setSortBy}
            events={sortedEvents}
            selectedId={selectedEvent?.id}
            onSelect={(e) => { setSelectedGroup([e]); setSelectedGroupIndex(0); setFocusedEvent(e) }}
            loading={loading}
          />
        </aside>

        {/* Map */}
        <main className={`relative flex-1 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          <WelcomeBanner />
          <EventMap
            events={eventsWithCoords}
            onGroupClick={(group) => { setSelectedGroup(group); setSelectedGroupIndex(0) }}
            focusedEvent={focusedEvent}
            activeType={filters.event_type}
            onTypeClick={(type) =>
              setFilters((f) => ({ ...f, event_type: f.event_type === type ? undefined : type as import('@/types/event').EventType }))
            }
          />

          {/* Detail card */}
          {selectedEvent && (
            <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-[1000]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-900 leading-tight">
                  {selectedEvent.title}
                </h2>
                <button
                  onClick={() => { setSelectedGroup([]); setSelectedGroupIndex(0) }}
                  className="shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              {selectedEvent.description && (
                <p className="text-xs text-gray-600 mb-2 line-clamp-2">{selectedEvent.description}</p>
              )}

              <div className="flex flex-wrap gap-1 mb-2">
                {selectedEvent.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-xs text-gray-500 space-y-0.5">
                {selectedEvent.start_date && (
                  <p>
                    📅{' '}
                    {new Date(selectedEvent.start_date).toLocaleDateString('it-IT', {
                      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                )}
                {selectedEvent.location_text && <p>📍 {selectedEvent.location_text}</p>}
                {selectedEvent.source_url && (
                  <a
                    href={selectedEvent.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline block mt-1"
                  >
                    Fonte ufficiale →
                  </a>
                )}
                <a href={`/eventi/${selectedEvent.id}`} className="text-gray-400 hover:text-gray-600 block">
                  Pagina evento →
                </a>
              </div>

              {selectedGroup.length > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setSelectedGroupIndex((i) => (i - 1 + selectedGroup.length) % selectedGroup.length)}
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
                  >‹</button>
                  <span className="text-xs text-gray-400">{selectedGroupIndex + 1} / {selectedGroup.length}</span>
                  <button
                    onClick={() => setSelectedGroupIndex((i) => (i + 1) % selectedGroup.length)}
                    className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
                  >›</button>
                </div>
              )}
            </div>
          )}

          {/* No-coords warning */}
          {!loading && eventsWithCoords.length === 0 && events.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow px-4 py-2 text-sm text-gray-500 z-[1000]">
              {events.length} eventi trovati, nessuno con coordinate geografiche
            </div>
          )}
        </main>
      </div>

      <InstallBanner />

      {/* Mobile tab bar */}
      <nav
        className="md:hidden shrink-0 flex bg-white border-t border-gray-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={() => setMobileView('map')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium border-t-2 transition-colors ${
            mobileView === 'map'
              ? 'text-gray-900 border-gray-900'
              : 'text-gray-400 border-transparent'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Mappa
        </button>

        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium border-t-2 transition-colors ${
            mobileView === 'list'
              ? 'text-gray-900 border-gray-900'
              : 'text-gray-400 border-transparent'
          }`}
        >
          <div className="relative">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {!loading && events.length > 0 && (
              <span className="absolute -top-1.5 -right-3 bg-blue-600 text-white rounded-full text-[9px] min-w-[16px] h-4 flex items-center justify-center px-0.5">
                {events.length > 99 ? '99+' : events.length}
              </span>
            )}
          </div>
          Lista
        </button>
      </nav>
    </div>
  )
}
