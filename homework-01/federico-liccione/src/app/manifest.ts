import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ProtestApp — Scioperi e manifestazioni in Italia',
    short_name: 'ProtestApp',
    description: 'Mappa interattiva di scioperi, cortei e manifestazioni in Italia',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#18181b',
    theme_color: '#18181b',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      {
        name: 'Mappa eventi',
        url: '/',
        description: 'Apri la mappa degli eventi',
      },
    ],
  }
}
