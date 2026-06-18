'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { Profile, NotificationPreferences } from '@/types/auth'

const REGIONS = [
  'Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna',
  'Friuli-Venezia Giulia','Lazio','Liguria','Lombardia','Marche',
  'Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
  'Trentino-Alto Adige','Umbria',"Valle d'Aosta",'Veneto',
]

const EVENT_TYPES = [
  { value: 'sciopero', label: 'Sciopero' },
  { value: 'manifestazione', label: 'Manifestazione' },
  { value: 'corteo', label: 'Corteo' },
  { value: 'presidio', label: 'Presidio' },
  { value: 'altro', label: 'Altro' },
]

const TAGS = [
  'lavoro','ambiente','palestina','no-guerra','trasporti','sanità',
  'istruzione','femminismo','antifascismo','pensioni','precariato',
  'casa','migranti','diritti-lgbtq','energia',
]

export default function ProfiloPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Editable state
  const [fullName, setFullName] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      setUserId(user.id)
      setUserEmail(user.email ?? null)

      const [{ data: p }, { data: n }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      ])

      if (p) {
        setProfile(p)
        setFullName(p.full_name ?? '')
      }
      if (n) {
        setEmailEnabled(n.email_enabled)
        setSelectedRegions(n.regions)
        setSelectedTypes(n.event_types)
        setSelectedTags(n.tags)
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)

    // upsert handles both first save (no row yet) and subsequent updates
    const { data: updatedProfile, error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, email: userEmail, full_name: fullName, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (profileError) {
      setSaveError(`Errore profilo: ${profileError.message}`)
      setSaving(false)
      return
    }

    if (updatedProfile) setProfile(updatedProfile)

    const { error: prefError } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        regions: selectedRegions,
        event_types: selectedTypes,
        tags: selectedTags,
        email_enabled: emailEnabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (prefError) {
      setSaveError(`Errore preferenze: ${prefError.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Torna alla mappa</a>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600">
            Esci
          </button>
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h1 className="text-lg font-semibold text-gray-900">Il tuo profilo</h1>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</label>
            <p className="text-sm text-gray-700">{profile?.email}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Il tuo nome (opzionale)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Ruolo:</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              profile?.role === 'admin' ? 'bg-purple-100 text-purple-700' :
              profile?.role === 'association' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {profile?.role === 'admin' ? 'Amministratore' :
               profile?.role === 'association' ? 'Associazione verificata' : 'Utente'}
            </span>
          </div>

          {profile?.role === 'user' && (
            <div className="pt-1 border-t border-gray-100">
              <a
                href="/associazioni/richiesta"
                className="text-sm text-blue-600 hover:underline"
              >
                Sei un'associazione? Richiedi l'accesso →
              </a>
            </div>
          )}
          {profile?.role === 'association' && (
            <div className="pt-1 border-t border-gray-100">
              <a
                href="/associazioni/eventi"
                className="text-sm text-blue-600 hover:underline"
              >
                Vai alla tua area — aggiungi eventi →
              </a>
            </div>
          )}
        </div>

        {/* Notification preferences */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notifiche email</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Ricevi un'email quando vengono pubblicati nuovi eventi che corrispondono ai tuoi interessi.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-gray-700">Attiva notifiche email</span>
          </label>

          {emailEnabled && (
            <div className="space-y-5 pt-2 border-t border-gray-100">
              {/* Regions */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Regioni di interesse <span className="text-gray-400 normal-case font-normal">(tutte se nessuna selezionata)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRegions(toggle(selectedRegions, r))}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        selectedRegions.includes(r)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event types */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Tipi di evento <span className="text-gray-400 normal-case font-normal">(tutti se nessuno selezionato)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTypes(toggle(selectedTypes, t.value))}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        selectedTypes.includes(t.value)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Temi <span className="text-gray-400 normal-case font-normal">(tutti se nessuno selezionato)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags(toggle(selectedTags, tag))}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-default ${
              saved
                ? 'bg-green-600'
                : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
            }`}
          >
            {saving ? 'Salvataggio...' : saved ? '✓ Salvato' : 'Salva'}
          </button>
          {saveError && (
            <p className="text-sm text-red-600">{saveError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
