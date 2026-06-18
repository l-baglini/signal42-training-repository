'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { AssociationRequest } from '@/types/auth'

export default function RichiestaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [existing, setExisting] = useState<AssociationRequest | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')

  const [orgName, setOrgName] = useState('')
  const [orgWebsite, setOrgWebsite] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/associazioni/richiesta'); return }
      setUserId(user.id)
      setUserEmail(user.email ?? '')
      setContactEmail(user.email ?? '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'association' || profile?.role === 'admin') {
        router.replace('/associazioni/eventi')
        return
      }

      const { data: req } = await supabase
        .from('association_requests')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      setExisting(req)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSubmitting(true)
    setError(null)

    const { error: err } = await supabase.from('association_requests').insert({
      user_id: userId,
      org_name: orgName,
      org_website: orgWebsite || null,
      org_description: orgDescription,
      contact_email: contactEmail,
    })

    if (err) {
      setError(err.message)
      setSubmitting(false)
    } else {
      const { data } = await supabase
        .from('association_requests')
        .select('*')
        .eq('user_id', userId)
        .single()
      setExisting(data)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    )
  }

  const STATUS_INFO = {
    pending: { label: 'In attesa di approvazione', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    approved: { label: 'Approvata', color: 'bg-green-100 text-green-800', icon: '✅' },
    rejected: { label: 'Non approvata', color: 'bg-red-100 text-red-800', icon: '❌' },
  }

  if (existing) {
    const info = STATUS_INFO[existing.status]
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          <a href="/profilo" className="text-sm text-gray-400 hover:text-gray-600">← Torna al profilo</a>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h1 className="text-lg font-semibold text-gray-900">Richiesta associazione</h1>

            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${info.color}`}>
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <p><span className="font-medium text-gray-900">Organizzazione:</span> {existing.org_name}</p>
              {existing.org_website && <p><span className="font-medium text-gray-900">Sito:</span> {existing.org_website}</p>}
              <p><span className="font-medium text-gray-900">Contatto:</span> {existing.contact_email}</p>
              <p className="text-xs text-gray-400">
                Inviata il {new Date(existing.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {existing.admin_notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p className="text-xs font-medium text-gray-500 mb-1">Note dell'amministratore:</p>
                <p>{existing.admin_notes}</p>
              </div>
            )}

            {existing.status === 'approved' && (
              <a
                href="/associazioni/eventi"
                className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Vai all'area associazione →
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <a href="/profilo" className="text-sm text-gray-400 hover:text-gray-600">← Torna al profilo</a>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Richiesta accesso associazione</h1>
            <p className="text-sm text-gray-400 mt-1">
              Compila il modulo per richiedere l'accesso come associazione verificata.
              Potrai aggiungere eventi e segnalare feed da monitorare.
              La richiesta verrà valutata entro pochi giorni.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Nome dell'organizzazione *
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="es. CGIL Milano, Extinction Rebellion Roma..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Sito web
              </label>
              <input
                type="url"
                value={orgWebsite}
                onChange={(e) => setOrgWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Descrizione *
              </label>
              <textarea
                required
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                rows={3}
                placeholder="Chi siete e che tipo di eventi organizzate..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Email di contatto *
              </label>
              <input
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Invio in corso...' : 'Invia richiesta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
