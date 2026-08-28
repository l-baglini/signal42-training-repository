'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Profile } from '@/types/auth'

export default function AuthButton() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }
      setLoading(false)
    }
    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    await supabase.auth.signOut()
    setProfile(null)
    setMenuOpen(false)
  }

  if (loading) return null

  if (!profile) {
    return (
      <a
        href="/login"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Accedi
      </a>
    )
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : (profile.email?.[0] ?? '?').toUpperCase()

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
          {initials}
        </span>
        <span className="hidden sm:block max-w-[120px] truncate">
          {profile.full_name ?? profile.email ?? 'Profilo'}
        </span>
        {profile.role !== 'user' && (
          <span className={`hidden sm:block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            profile.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {profile.role === 'admin' ? 'admin' : 'assoc.'}
          </span>
        )}
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 text-sm">
            <a href="/profilo"
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
              onClick={() => setMenuOpen(false)}
            >
              <span>👤</span> Profilo
            </a>
            {profile.role === 'user' && (
              <a href="/associazioni/richiesta"
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <span>🏢</span> Diventa associazione
              </a>
            )}
            {profile.role === 'association' && (
              <a href="/associazioni/eventi"
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <span>📅</span> I tuoi eventi
              </a>
            )}
            {profile.role === 'admin' && (
              <a href="/admin"
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <span>⚙️</span> Amministrazione
              </a>
            )}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={handleLogout}
                className="w-full text-left flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"
              >
                <span>→</span> Esci
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
