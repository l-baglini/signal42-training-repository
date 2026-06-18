'use client'

import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'protestapp_install_dismissed_until'
const DISMISS_DAYS = 30

type BannerState = 'hidden' | 'android' | 'ios'

export default function InstallBanner() {
  const [state, setState] = useState<BannerState>('hidden')
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Don't show until the snooze period expires
    const until = localStorage.getItem(DISMISSED_KEY)
    if (until && Date.now() < Number(until)) return

    // Don't show if already running as installed PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    if (isStandalone) return

    // iOS Safari — no API, show manual instructions after a short delay
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS) {
      const t = setTimeout(() => setState('ios'), 5000)
      return () => clearTimeout(t)
    }

    // Chrome / Android / Edge — intercept the native install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setState('android')
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISSED_KEY, String(until))
    setState('hidden')
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') setState('hidden')
    // if dismissed by user in native dialog, keep banner visible so they can retry
  }

  if (state === 'hidden') return null

  return (
    <div
      className="fixed left-4 right-4 z-[1002] md:hidden"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
      <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-xl flex items-center gap-3">
        <span className="text-xl shrink-0">✊</span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-snug">Installa ProtestApp</p>
          {state === 'ios' ? (
            <p className="text-[11px] text-gray-300 leading-snug mt-0.5">
              Tocca{' '}
              <svg className="inline w-3 h-3 mb-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {' '}→ &ldquo;Aggiungi alla schermata Home&rdquo;
            </p>
          ) : (
            <p className="text-[11px] text-gray-300 leading-snug mt-0.5">
              Accesso rapido dalla schermata principale
            </p>
          )}
        </div>

        {state === 'android' && (
          <button
            onClick={install}
            className="shrink-0 bg-white text-gray-900 rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            Installa
          </button>
        )}

        <button
          onClick={dismiss}
          className="shrink-0 text-gray-500 hover:text-white text-base leading-none"
          aria-label="Chiudi"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
