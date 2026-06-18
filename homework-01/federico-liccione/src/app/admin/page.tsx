'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { AssociationRequest, SubmittedEvent } from '@/types/auth'

type Tab = 'richieste' | 'eventi'

interface RequestWithProfile extends AssociationRequest {
  profiles: { email: string | null; full_name: string | null } | null
}

interface EventWithProfile extends SubmittedEvent {
  profiles: { email: string | null; org_name?: string | null } | null
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('richieste')
  const [requests, setRequests] = useState<RequestWithProfile[]>([])
  const [events, setEvents] = useState<EventWithProfile[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{
    type: 'request' | 'event'
    id: string
    action: 'approved' | 'rejected'
  } | null>(null)
  const [adminNote, setAdminNote] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.replace('/')
        return
      }

      await reload()
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload() {
    const [{ data: reqs }, { data: evs }] = await Promise.all([
      supabase
        .from('association_requests')
        .select('*, profiles(email, full_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('submitted_events')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false }),
    ])
    setRequests(reqs ?? [])
    setEvents(evs ?? [])
  }

  async function handleRequest(id: string, action: 'approved' | 'rejected', note: string) {
    setProcessing(id)

    const res = await fetch('/api/admin/approve-association', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, action, adminNote: note }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      alert(`Errore: ${error}`)
      setProcessing(null)
      return
    }

    await reload()
    setProcessing(null)
    setNoteModal(null)
    setAdminNote('')
  }

  async function handleEvent(id: string, action: 'approved' | 'rejected', note: string) {
    setProcessing(id)

    // Server-side route: uses admin client (bypasses RLS) + geocodes before inserting
    const res = await fetch('/api/admin/approve-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: id, action, adminNote: note }),
    })

    if (!res.ok) {
      const { error } = await res.json()
      alert(`Errore: ${error}`)
      setProcessing(null)
      return
    }

    await reload()
    setProcessing(null)
    setNoteModal(null)
    setAdminNote('')
  }

  function openModal(type: 'request' | 'event', id: string, action: 'approved' | 'rejected') {
    setNoteModal({ type, id, action })
    setAdminNote('')
  }

  function confirmModal() {
    if (!noteModal) return
    if (noteModal.type === 'request') {
      handleRequest(noteModal.id, noteModal.action, adminNote)
    } else {
      handleEvent(noteModal.id, noteModal.action, adminNote)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    )
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const pendingEvents = events.filter((e) => e.status === 'pending')

  const STATUS_BADGE = {
    pending:  'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  }
  const STATUS_LABEL = { pending: 'In attesa', approved: 'Approvato', rejected: 'Rifiutato' }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Mappa</a>
          <span className="text-xs text-gray-400 bg-purple-100 text-purple-700 rounded-full px-3 py-1 font-medium">
            Admin
          </span>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">Pannello amministratore</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {([['richieste', `Richieste (${pendingRequests.length})`], ['eventi', `Eventi (${pendingEvents.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Association requests */}
        {tab === 'richieste' && (
          <div className="space-y-4">
            {requests.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                Nessuna richiesta.
              </div>
            )}
            {requests.map((req) => (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{req.org_name}</p>
                    <p className="text-xs text-gray-400">
                      {req.profiles?.email ?? req.contact_email} ·{' '}
                      {new Date(req.created_at).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>

                {req.org_website && (
                  <a href={req.org_website} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline block">
                    {req.org_website}
                  </a>
                )}

                <p className="text-sm text-gray-600">{req.org_description}</p>

                {req.admin_notes && (
                  <p className="text-xs text-gray-400 italic">Nota: {req.admin_notes}</p>
                )}

                {req.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => openModal('request', req.id, 'approved')}
                      disabled={!!processing}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approva
                    </button>
                    <button
                      onClick={() => openModal('request', req.id, 'rejected')}
                      disabled={!!processing}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Rifiuta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submitted events */}
        {tab === 'eventi' && (
          <div className="space-y-4">
            {events.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                Nessun evento da moderare.
              </div>
            )}
            {events.map((ev) => (
              <div key={ev.id} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{ev.title}</p>
                    <p className="text-xs text-gray-400">
                      {ev.event_type} · {ev.city ?? ''} {ev.region ? `(${ev.region})` : ''} ·{' '}
                      {ev.start_date ? new Date(ev.start_date).toLocaleDateString('it-IT') : 'data non definita'} ·{' '}
                      proposto da {ev.profiles?.email ?? '—'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[ev.status]}`}>
                    {STATUS_LABEL[ev.status]}
                  </span>
                </div>

                {ev.description && <p className="text-sm text-gray-600">{ev.description}</p>}

                {ev.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ev.tags.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{t}</span>
                    ))}
                  </div>
                )}

                {ev.source_url && (
                  <a href={ev.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline block">
                    Fonte →
                  </a>
                )}

                {ev.admin_notes && (
                  <p className="text-xs text-gray-400 italic">Nota: {ev.admin_notes}</p>
                )}

                {ev.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => openModal('event', ev.id, 'approved')}
                      disabled={!!processing}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approva e pubblica
                    </button>
                    <button
                      onClick={() => openModal('event', ev.id, 'rejected')}
                      disabled={!!processing}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Rifiuta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
            <h3 className="font-semibold text-gray-900">
              {noteModal.action === 'approved' ? 'Approva' : 'Rifiuta'} — nota opzionale
            </h3>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Aggiungi una nota per l'utente (opzionale)..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setNoteModal(null); setAdminNote('') }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={confirmModal}
                disabled={!!processing}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  noteModal.action === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processing ? '...' : noteModal.action === 'approved' ? 'Conferma approvazione' : 'Conferma rifiuto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
