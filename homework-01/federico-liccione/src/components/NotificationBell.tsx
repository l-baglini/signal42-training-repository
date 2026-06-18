'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function NotificationBell() {
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setHref(data.user ? '/profilo' : '/login?redirect=/profilo')
    })
  }, [])

  if (!href) return null

  return (
    <a
      href={href}
      title="Attiva notifiche per il tuo territorio"
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      <span>🔔</span>
      <span className="hidden sm:inline">Notifiche</span>
    </a>
  )
}
