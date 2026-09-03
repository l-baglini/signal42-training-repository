const CACHE = 'protestapp-v1'

// Precache the app shell on install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(['/', '/manifest.webmanifest']).catch(() => {})
    )
  )
  self.skipWaiting()
})

// Remove old caches on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip cross-origin (map tiles, external CDN — don't pollute cache)
  if (url.origin !== self.location.origin) return

  // Next.js static assets: cache-first (content-hashed, safe to cache forever)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((res) => {
              cache.put(request, res.clone())
              return res
            })
        )
      )
    )
    return
  }

  // API events: network-first, fall back to cache (stale data is better than nothing)
  if (url.pathname === '/api/events') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()))
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // HTML navigation: network-first, fall back to cached home page
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then(
          (cached) =>
            cached ||
            new Response('<h1>Offline</h1><p>Riconnettiti per vedere gli eventi.</p>', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
        )
      )
    )
    return
  }
})
