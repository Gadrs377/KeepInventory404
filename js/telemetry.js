// Telemetria: o app registra sozinho o que acontece no uso de verdade (buscas,
// cadastros, câmera da validade, erros) e manda em lote para o repassador
// (POST /telemetria, guardado 90 dias). Os eventos esperam numa fila no
// celular: sem internet, vão depois. Leitura: scripts/telemetria.mjs.

import { API_URL, APP_VERSION } from './config.js';

const KEY = 'ki.tel.fila';
const MAX = 300;
const BATCH = 40;
const session = Math.random().toString(36).slice(2, 10);
let timer = 0;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* sem espaço: perde a telemetria, não o app */ }
}

/** Registra um evento. `id` igual substitui o anterior (a visita que é atualizada). */
export function tel(k, d = {}, id = '') {
  try {
    const eventId = id || newId();
    const list = load().filter((e) => e.id !== eventId);
    list.push({ id: eventId, k, t: Date.now(), s: session, v: APP_VERSION, d });
    save(list);
    clearTimeout(timer);
    if (list.length >= 20) flush();
    else { timer = setTimeout(flush, 10000); if (timer.unref) timer.unref(); }
  } catch { /* telemetria nunca derruba o app */ }
}

export function flush() {
  clearTimeout(timer);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const list = load();
  if (!list.length) return;
  const batch = list.slice(0, BATCH);
  const sent = new Set(batch.map((e) => e.id));
  const drop = () => save(load().filter((e) => !sent.has(e.id) || !batch.some((b) => b.id === e.id && b.t === e.t)));
  const body = JSON.stringify(batch);
  // sendBeacon sobrevive ao app ir para segundo plano; texto puro não pede licença (CORS).
  let queued = false;
  try { queued = !!(navigator.sendBeacon && navigator.sendBeacon(`${API_URL}/telemetria`, new Blob([body], { type: 'text/plain' }))); } catch { queued = false; }
  if (queued) {
    drop();
    if (list.length > BATCH) { timer = setTimeout(flush, 2000); if (timer.unref) timer.unref(); }
    return;
  }
  fetch(`${API_URL}/telemetria`, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
    .then((r) => { if (r.ok) drop(); })
    .catch(() => {});
}

// Abertura do app: aparelho, tela, se está instalado; erros; envio ao sair.
export function telStart() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  tel('abriu', {
    ua: navigator.userAgent,
    instalado: standalone,
    tela: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    online: navigator.onLine,
    gpu: 'gpu' in navigator,
    rota: location.hash || '#/',
  });
  window.addEventListener('error', (e) => tel('erro', {
    msg: String(e.message || '').slice(0, 300),
    onde: `${String(e.filename || '').split('/').pop()}:${e.lineno || 0}:${e.colno || 0}`,
    pilha: String((e.error && e.error.stack) || '').slice(0, 1200),
    rota: location.hash,
  }));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    tel('erro', { msg: String((r && r.message) || r || '').slice(0, 300), pilha: String((r && r.stack) || '').slice(0, 1200), promessa: true, rota: location.hash });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', () => setTimeout(flush, 1000));
  setTimeout(flush, 3000);
}
