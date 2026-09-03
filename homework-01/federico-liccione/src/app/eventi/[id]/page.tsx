import { getSupabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const TYPE_LABEL: Record<string, string> = {
  sciopero: 'Sciopero', manifestazione: 'Manifestazione',
  corteo: 'Corteo', presidio: 'Presidio', altro: 'Altro',
}

const TYPE_COLOR: Record<string, string> = {
  sciopero: 'bg-red-100 text-red-700',
  manifestazione: 'bg-orange-100 text-orange-700',
  corteo: 'bg-purple-100 text-purple-700',
  presidio: 'bg-blue-100 text-blue-700',
  altro: 'bg-gray-100 text-gray-600',
}

async function getEvent(id: string) {
  const { data } = await getSupabase()
    .from('events')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const event = await getEvent(params.id)
  if (!event) return {}
  return {
    title: `${event.title} — ProtestApp`,
    description: event.description ?? `${TYPE_LABEL[event.event_type] ?? 'Evento'} a ${event.city ?? event.region ?? 'Italia'}`,
  }
}

export default async function EventPage({ params }: { params: { id: string } }) {
  const event = await getEvent(params.id)
  if (!event) notFound()

  const dateStr = event.start_date
    ? new Date(event.start_date).toLocaleDateString('it-IT', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      })
    : null
  const endDateStr = event.end_date
    ? new Date(event.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  const badge = TYPE_COLOR[event.event_type] ?? TYPE_COLOR.altro
  const typeLabel = TYPE_LABEL[event.event_type] ?? 'Evento'

  return (
    <div className="min-h-screen bg-gray-50 px-4 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
      <div className="max-w-xl mx-auto">

        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors">
          ← Torna alla mappa
        </a>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}>{typeLabel}</span>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-4 leading-snug">{event.title}</h1>

          {event.description && (
            <p className="text-sm text-gray-600 mb-5 leading-relaxed">{event.description}</p>
          )}

          <div className="space-y-2 text-sm text-gray-700 mb-5">
            {dateStr && (
              <div className="flex items-start gap-2">
                <span className="shrink-0">📅</span>
                <span>
                  {dateStr}
                  {endDateStr && ` – ${endDateStr}`}
                </span>
              </div>
            )}
            {(event.location_text || event.city || event.region) && (
              <div className="flex items-start gap-2">
                <span className="shrink-0">📍</span>
                <span>
                  {[event.location_text, event.city, event.region].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {event.tags.map((tag: string) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
            >
              Fonte ufficiale →
            </a>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
          <span>Fonte: {event.source_name ?? '—'}</span>
          <a
            href={`/api/events/ical?id=${event.id}`}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
            title="Aggiungi al calendario"
          >
            📆 Aggiungi al calendario
          </a>
        </div>

      </div>
    </div>
  )
}
