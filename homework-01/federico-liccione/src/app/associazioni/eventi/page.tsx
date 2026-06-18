'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { SubmittedEvent } from '@/types/auth'

const EVENT_TYPES = [
  { value: 'sciopero', label: 'Sciopero' },
  { value: 'manifestazione', label: 'Manifestazione' },
  { value: 'corteo', label: 'Corteo' },
  { value: 'presidio', label: 'Presidio' },
  { value: 'altro', label: 'Altro' },
]

const REGIONS = [
  'Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna',
  'Friuli-Venezia Giulia','Lazio','Liguria','Lombardia','Marche',
  'Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
  'Trentino-Alto Adige','Umbria',"Valle d'Aosta",'Veneto',
]

const STATUS_BADGE = {
  pending:  { label: 'In revisione', classes: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approvato',    classes: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rifiutato',    classes: 'bg-red-100 text-red-800' },
}

const emptyForm = {
  title: '',
  description: '',
  event_type: 'manifestazione',
  tags: '',
  location_text: '',
  city: '',
  region: '',
  start_date: '',
  end_date: '',
  source_url: '',
}

export default function AssociazioneEventiPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [submittedEvents, setSubmittedEvents] = useState<SubmittedEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/associazioni/eventi'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || !['association', 'admin'].includes(profile.role)) {
        router.replace('/associazioni/richiesta')
        return
      }

      setUserId(user.id)
      const { data: events } = await supabase
        .from('submitted_events')
        .select('*')
        .eq('submitted_by', user.id)
        .order('created_at', { ascending: false })
      setSubmittedEvents(events ?? [])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(patch: Partial<typeof emptyForm>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSubmitting(true)
    setError(null)

    const { error: err, data } = await supabase
      .from('submitted_events')
      .insert({
        submitted_by: userId,
        title: form.title,
        description: form.description || null,
        event_type: form.event_type,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        location_text: form.location_text || null,
        city: form.city || null,
        region: form.region || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        source_url: form.source_url || null,
      })
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else {
      setSubmittedEvents((prev) => [data, ...prev])
      setForm(emptyForm)
      setShowForm(false)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <a href="/profilo" className="text-sm text-gray-400 hover:text-gray-600">← Profilo</a>
          <button
            onClick={() => { setShowForm((v) => !v); setError(null) }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {showForm ? 'Annulla' : '+ Nuovo evento'}
          </button>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">Area associazione</h1>

        {/* New event form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Proponi un evento</h2>
            <p className="text-xs text-gray-400 mb-5">
              L'evento verrà revisionato dal team prima di essere pubblicato.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Titolo *</label>
                <input
                  type="text" required value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo *</label>
                  <select
                    value={form.event_type} onChange={(e) => set({ event_type: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Regione</label>
                  <select
                    value={form.region} onChange={(e) => set({ region: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Data inizio</label>
                  {form.start_date ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date" value={form.start_date}
                        onChange={(e) => set({ start_date: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => set({ start_date: '' })}
                        className="text-gray-400 hover:text-gray-600 px-1 text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => set({ start_date: new Date().toISOString().slice(0, 10) })}
                      className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 text-left">
                      non definita
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Data fine</label>
                  {form.end_date ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date" value={form.end_date}
                        onChange={(e) => set({ end_date: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => set({ end_date: '' })}
                        className="text-gray-400 hover:text-gray-600 px-1 text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => set({ end_date: new Date().toISOString().slice(0, 10) })}
                      className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 text-left">
                      non definita
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Città</label>
                  <input
                    type="text" value={form.city}
                    onChange={(e) => set({ city: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Luogo</label>
                  <input
                    type="text" value={form.location_text} placeholder="es. Piazza del Duomo"
                    onChange={(e) => set({ location_text: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descrizione</label>
                <textarea
                  value={form.description} rows={3}
                  onChange={(e) => set({ description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Tag <span className="text-gray-400 normal-case font-normal">(separati da virgola)</span>
                </label>
                <input
                  type="text" value={form.tags} placeholder="lavoro, ambiente, antifascismo..."
                  onChange={(e) => set({ tags: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Link fonte</label>
                <input
                  type="url" value={form.source_url} placeholder="https://..."
                  onChange={(e) => set({ source_url: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="submit" disabled={submitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Invio...' : 'Proponi evento'}
              </button>
            </form>
          </div>
        )}

        {/* Submitted events list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              I tuoi eventi proposti
              <span className="ml-2 text-xs font-normal text-gray-400">({submittedEvents.length})</span>
            </h2>
          </div>

          {submittedEvents.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              Nessun evento proposto ancora.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {submittedEvents.map((ev) => {
                const badge = STATUS_BADGE[ev.status]
                return (
                  <div key={ev.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {ev.event_type} · {ev.city || ev.region || '—'} ·{' '}
                          {ev.start_date ? new Date(ev.start_date).toLocaleDateString('it-IT') : 'data non definita'}
                        </p>
                        {ev.admin_notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            Nota: {ev.admin_notes}
                          </p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
