// Service worker: guarda o app para abrir sem internet.
// Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
// Fontes e fotos de produto: cache primeiro. API do Open Food Facts: só rede.

const VERSION = 'v5';
const APP_CACHE = `app-${VERSION}`;
const ASSET_CACHE = 'assets-v1';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/areas.js',
  './js/store.js',
  './js/lookup.js',
  './js/scanner.js',
  './js/ui.js',
  './js/icons.js',
  './js/sound.js',
  './js/views/armario.js',
  './js/views/camera.js',
  './js/views/dados.js',
  './js/views/inventario.js',
  './js/views/productSheet.js',
  './js/views/produto.js',
  './js/views/revisao.js',
  './js/views/scan.js',
  './vendor/barcode-detector/ponyfill.js',
  './vendor/barcode-detector/barcode-detector.js',
  './vendor/barcode-detector/zxing_reader.wasm',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname.endsWith('openfoodfacts.org') && url.pathname.startsWith('/api/')) return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Fotos de produto das lojas (VTEX) também vão para o cache.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname.endsWith('openfoodfacts.org')
    || url.hostname.endsWith('vteximg.com.br') || url.hostname.endsWith('vtexassets.com')) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}
