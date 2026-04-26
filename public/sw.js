/**
 * Service Worker — El Brenz dle Val del Nos
 *
 * Strategia cache:
 *   - Asset statici (icone PWA, font Google, immagini): cache-first
 *   - HTML (pagine): network-first con fallback cache (per vedere subito articoli aggiornati)
 *   - Manifest: stale-while-revalidate
 *
 * Versionamento: bump CACHE_NAME ad ogni deploy importante per invalidare cache vecchie.
 *
 * Pre-cache minima: solo asset PWA + icone (no pre-cache di pagine — troppo rischioso
 * con contenuto dinamico futuro).
 *
 * NOTA: questo è un service worker base, non gestisce push notifications né background
 * sync. Quelli verranno in M3+ quando avremo notifiche soci.
 */

const CACHE_NAME = 'el-brenz-v1';
const RUNTIME_CACHE = 'el-brenz-runtime-v1';

// Asset minimi da pre-cachare durante install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-192x192-maskable.png',
  '/pwa-512x512-maskable.png',
  '/logo-eb-header.png',
  '/logo-eb-header@2x.png',
  '/logo-eb-footer.png',
  '/logo-eb-footer@2x.png'
];

// Install: pre-cache asset critici
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: pulisci cache vecchie con versioni precedenti
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: routing per strategia
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin (eccetto Google Fonts)
  if (url.origin !== self.location.origin && !url.hostname.includes('fonts.googleapis.com') && !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Skip POST e altri metodi non-GET
  if (request.method !== 'GET') {
    return;
  }

  // Strategia per HTML: network-first
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Strategia per asset (immagini, font, JS, CSS): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.status === 200) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
