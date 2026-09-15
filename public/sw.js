/**
 * Service Worker — El Brenz da le Val del Nos
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

// [15/9/2026, audit XSS-06 / PERF-01] Bump a v3: la cache runtime v2 teneva
// anche pagine personali e risposte no-store; l'activate qui sotto cancella
// tutte le cache con nome diverso da questi due, quindi le vecchie spariscono.
const CACHE_NAME = 'el-brenz-v2';
const RUNTIME_CACHE = 'el-brenz-runtime-v3';

// [15/9/2026, audit XSS-06] Cosa NON entra mai nella cache runtime.
// Percorsi che devono sempre passare dalla rete (versione viva, API, il SW stesso).
const PERCORSI_SENZA_CACHE = ['/versione.json', '/api/', '/sw.js'];
// Rotte personali o di curatela: una pagina vista da un socio autenticato non
// deve restare sul dispositivo ne' essere servita a chi lo usa dopo.
const ROTTE_RISERVATE = [
  '/tessera/', '/scheda-domanda/', '/paga-quota/', '/rinnovo/',
  '/app', '/area-soci', '/cruscotto',
  '/convenzioni-curatela', '/custodi-curatela', '/glossario-console',
  '/guardiani-curatela', '/luoghi-curatela', '/museo-gg-curatela',
  '/newsletter-curatela', '/registro-curatela', '/tesseramento-curatela',
];
// Asset con hash o immutabili: qui il cache-first e' sicuro.
const PREFISSI_IMMUTABILI = ['/_astro/', '/fonts/', '/leaflet/'];
const DESTINAZIONI_IMMUTABILI = ['image', 'font', 'script', 'style'];

// Corrisponde al percorso esatto o a una sua sottocartella: '/app' non deve
// prendere '/apple-touch-icon.png'.
function inizioPercorso(pathname, prefisso) {
  if (prefisso.endsWith('/')) return pathname.startsWith(prefisso);
  return pathname === prefisso || pathname.startsWith(prefisso + '/');
}
function percorsoEscluso(pathname) {
  return PERCORSI_SENZA_CACHE.some((p) => inizioPercorso(pathname, p))
    || ROTTE_RISERVATE.some((p) => inizioPercorso(pathname, p));
}
// Una risposta si puo' mettere in cache solo se e' buona e il server non
// l'ha marcata come personale o da non conservare.
function rispostaCachabile(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

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
// [15/9/2026, audit XSS-06 / PERF-01] Riscritto il solo handler fetch:
//   - rotte riservate, /versione.json, /api/, /sw.js: mai in cache, passano
//     dalla rete senza intercettazione;
//   - HTML: network-first come prima, ma si conserva solo cio' che e' cachabile;
//   - image/font/script/style sotto /_astro/, /fonts/, /leaflet/: cache-first;
//   - tutti gli altri asset statici (manifest, /og/*, /scripts/*, /styles/*,
//     icone in root...): stale-while-revalidate, cosi' chi torna vede la
//     versione nuova al giro dopo invece di restare fermo per sempre.
// Precache, install e activate restano come prima.
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

  // Percorsi che non devono mai passare dalla cache: si lascia fare al browser.
  if (url.origin === self.location.origin && percorsoEscluso(url.pathname)) {
    return;
  }

  // Strategia per HTML: network-first
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (rispostaCachabile(response)) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Asset con hash o immutabili: cache-first
  const immutabile = url.origin === self.location.origin
    && DESTINAZIONI_IMMUTABILI.includes(request.destination)
    && PREFISSI_IMMUTABILI.some((p) => url.pathname.startsWith(p));
  if (immutabile) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (rispostaCachabile(response)) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Tutto il resto (asset statici non hashati, manifest, Google Fonts):
  // stale-while-revalidate. Si risponde subito con la copia in cache se c'e',
  // e intanto si aggiorna dalla rete per la prossima volta.
  event.respondWith(
    caches.match(request).then((cached) => {
      const dallaRete = fetch(request).then((response) => {
        if (rispostaCachabile(response)) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      if (cached) {
        event.waitUntil(dallaRete.catch(() => {}));
        return cached;
      }
      return dallaRete;
    })
  );
});
