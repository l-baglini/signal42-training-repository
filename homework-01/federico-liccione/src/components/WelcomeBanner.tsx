'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'protestapp_welcomed'

export default function WelcomeBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="hidden md:block absolute top-4 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-sm px-4 sm:px-0">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✊</span>
            <h2 className="text-sm font-semibold text-gray-900">Benvenuto su ProtestApp</h2>
          </div>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">✕</button>
        </div>

        <ul className="text-xs text-gray-600 space-y-1.5 mb-4">
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0">🗺️</span>
            <span>Mappa interattiva di scioperi, manifestazioni e cortei in Italia</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0">🔍</span>
            <span>Filtra per regione, tipo di evento, data e parole chiave</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0">🔔</span>
            <span>Registrati per ricevere notifiche email sugli eventi del tuo territorio</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px shrink-0">🏛️</span>
            <span>Sei un'associazione? Puoi proporre eventi direttamente sulla mappa</span>
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <a
            href="/login"
            className="flex-1 text-center rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Registrati gratis →
          </a>
          <button
            onClick={dismiss}
            className="flex-1 text-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  )
}
