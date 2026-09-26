// Service worker: guarda o app para abrir sem internet.
// Arquivos do app: rede primeiro (pega atualizações), cache se estiver offline.
// Fontes e fotos de produto: cache primeiro. API do Open Food Facts: só rede.
// Base de remédios (data/remedios): responde do cache na hora e atualiza por
// trás; muda uma vez por mês e não se perde quando o app ganha versão nova.

const VERSION = 'v33';
const APP_CACHE = `app-${VERSION}`;
const ASSET_CACHE = 'assets-v1';
const DATA_CACHE = 'remedios-v1';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/urbanist.woff2',
  './fonts/schibsted-grotesk.woff2',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/areas.js',
  './js/dates.js',
  './js/consumo.js',
  './js/photo.js',
  './js/store.js',
  './js/lookup.js',
  './js/remedios.js',
  './js/scanner.js',
  './js/ui.js',
  './js/icons.js',
  './js/sound.js',
  './js/shop.js',
  './js/views/armario.js',
  './js/views/camera.js',
  './js/views/compras.js',
  './js/views/cupons.js',
  './js/views/dados.js',
  './js/views/inventario.js',
  './js/views/productSheet.js',
  './js/views/produto.js',
  './js/views/nota.js',
  './js/views/receipt.js',
  './js/views/remedioInfo.js',
  './js/views/revisao.js',
  './js/views/scan.js',
  './vendor/barcode-detector/ponyfill.js',
  './vendor/barcode-detector/barcode-detector.js',
  './vendor/barcode-detector/zxing_reader.wasm',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './icons/atalho-entrada.png',
  './icons/atalho-saida.png',
  './icons/atalho-compras.png',
  './icons/atalho-contar.png',
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

  if (url.origin === self.location.origin && url.pathname.includes('/data/remedios/')) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

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
    if (res.ok) {
      cache.put(request, res.clone());
      return res;
    }
    // Site fora do ar (404, 5xx): abre a versão guardada no celular, se houver.
    const saved = await cache.match(request, { ignoreSearch: true })
      || (request.mode === 'navigate' ? await cache.match('./index.html') : null);
    return saved || res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}
