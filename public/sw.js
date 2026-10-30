/**
 * Service Worker - Santa Casa de Ponta Grossa (Escala Maternidade)
 * Estratégia Network-First (Sempre busca a versão mais recente na internet ao abrir na Tela Inicial)
 */

const CACHE_NAME = 'santacasapg-escala-v10';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-First com no-store para ignorar o cache congelado do WebView da Tela de Início (iOS/Android)
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});
