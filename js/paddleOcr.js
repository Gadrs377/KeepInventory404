// Lazy per-camera worker. Closing the reader terminates it and releases WASM.
// Its JS, models and runtime are self-hosted and cached by sw.js after use.
// `tier`: 'small' (leitura contínua, rápida) ou 'medium' (foto nítida, mais
// lenta por leitura mas enxerga mais em material difícil) — mesmo worker,
// modelos PP-OCRv6 diferentes. Ver docs/LEITURA_VALIDADE.md.
// `gpu`: só para a tela de testes. Usa o pacote `pack` (vendor/paddle/gpu1,
// onnxruntime 1.24.3, ou gpu2, 1.30.0, com WebGPU); `gpu: 'wasm'` roda esse
// mesmo pacote sem GPU, para comparar.
// `readTimeout`: quanto uma leitura pode levar antes de desistir.
import { textRows } from './ocrLayout.js';
import { gpuAllowed, gpuReadStarted, gpuReadEnded } from './gpuGuard.js';
export function createPaddleReader(tier = 'small', { gpu = null, pack = 'gpu1', readTimeout = 30000 } = {}) {
  let worker;
  let init;
  let stopped = false;
  let seq = 0;
  const pending = new Map();
  function dispose(reason = new Error('Leitura encerrada')) {
    stopped = true;
    worker?.terminate(); worker = null;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(reason); }
    pending.clear();
  }
  function request(type, payload = {}, transfer = [], timeout = 30000) {
    if (stopped || !worker) return Promise.reject(new Error('Leitura encerrada'));
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => dispose(new Error('Leitor complementar demorou demais')), timeout);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, type, ...payload }, transfer); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  function ready() {
    if (stopped) return Promise.reject(new Error('Leitura encerrada'));
    if (!init) {
      try {
        worker = new Worker(new URL(gpu ? `../vendor/paddle/${pack}/worker.js` : '../vendor/paddle/v3/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const item = pending.get(data.id); if (!item) return;
          clearTimeout(item.timer); pending.delete(data.id);
          if (data.error) item.reject(new Error(data.error)); else item.resolve(data);
        };
        worker.onerror = () => dispose(new Error('Leitor complementar indisponível'));
        worker.onmessageerror = () => dispose(new Error('Resposta do leitor inválida'));
        init = request('init', gpu ? { tier, backend: gpu === 'wasm' ? 'wasm' : 'webgpu' } : { tier }, [], 120000);
      } catch (error) { init = Promise.reject(error); }
    }
    return init;
  }
  async function read(canvas) {
    await ready();
    if (stopped) throw new Error('Leitura encerrada');
    const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const result = await request('read', { width: image.width, height: image.height, pixels: image.data.buffer }, [image.data.buffer], readTimeout);
    const items = result.items || [];
    return { text: textRows(items).map(row => row.text).join('\n'), confidence: items.length ? 100 * Math.min(...items.map(item => item.score)) : 0, items };
  }
  return { ready, read, dispose };
}

/**
 * Leitor small para a câmera ao vivo e as fotos: tenta a GPU (pacote gpu2,
 * onnxruntime 1.30) quando o aparelho deixa, e se ela não preparar volta
 * sozinho para o leitor sem GPU (v3). Mesma interface de createPaddleReader;
 * `backend()` diz qual está em uso ('gpu' ou 'wasm'). Só o small: o medium
 * na GPU derrubou o app no iPhone.
 */
export function createSmallReader() {
  let inner = null;
  let kind = 'wasm';
  let init = null;
  let stopped = false;
  function ready() {
    if (stopped) return Promise.reject(new Error('Leitura encerrada'));
    if (!init) {
      init = (async () => {
        if (gpuAllowed()) {
          const gpu = createPaddleReader('small', { gpu: 'webgpu', pack: 'gpu2', readTimeout: 60000 });
          try {
            const r = await gpu.ready();
            if (r.summary && r.summary.detProvider === 'webgpu') { inner = gpu; kind = 'gpu'; return r; }
            gpu.dispose();
          } catch { gpu.dispose(); }
          if (stopped) throw new Error('Leitura encerrada');
        }
        inner = createPaddleReader('small');
        kind = 'wasm';
        return inner.ready();
      })();
    }
    return init;
  }
  async function read(canvas) {
    await ready();
    if (kind !== 'gpu') return inner.read(canvas);
    gpuReadStarted();
    try { return await inner.read(canvas); } finally { gpuReadEnded(); }
  }
  function dispose() {
    stopped = true;
    if (inner) inner.dispose();
    gpuReadEnded();
  }
  return { ready, read, dispose, backend: () => kind };
}

// Leitores que sobrevivem de uma abertura da câmera para a outra. Criar e
// destruir o worker a cada abertura (o medium carrega ~140 MB; o small na GPU
// abre uma sessão WebGPU) fazia o iPhone fechar o app na 2ª ou 3ª vez, na
// tela de testes: o Safari demora a devolver essa memória. Agora a mesma
// instância é reaproveitada e só é encerrada depois de `idleMs` sem uso (ou
// quando a página é fechada). As leituras passam numa fila: uma abertura nova
// não lê junto com uma leitura que a anterior deixou no meio.
const SHARED = new Map();
let sharedPagehide = false;

/**
 * `create()` → leitor (createPaddleReader/createSmallReader). Devolve a mesma
 * interface, onde `dispose()` só solta este uso e `kill()` encerra o worker
 * de vez (leitura travada ou com erro: a próxima abertura cria outro).
 */
export function sharedReader(key, create, { idleMs = 120000 } = {}) {
  if (!sharedPagehide && typeof window !== 'undefined') {
    sharedPagehide = true;
    window.addEventListener('pagehide', () => { for (const e of [...SHARED.values()]) e.kill(); });
  }
  let entry = SHARED.get(key);
  if (!entry || entry.dead) {
    entry = { reader: create(), users: 0, timer: 0, dead: false, queue: Promise.resolve() };
    entry.kill = () => {
      if (entry.dead) return;
      entry.dead = true; clearTimeout(entry.timer);
      if (SHARED.get(key) === entry) SHARED.delete(key);
      entry.reader.dispose();
    };
    SHARED.set(key, entry);
  }
  const mine = entry;
  clearTimeout(mine.timer);
  mine.users++;
  let released = false;
  const closed = () => new Error('Leitura encerrada');
  function dispose() {
    if (released) return;
    released = true;
    if (--mine.users > 0 || mine.dead) return;
    mine.timer = setTimeout(mine.kill, idleMs);
  }
  function kill() { released = true; mine.users = Math.max(0, mine.users - 1); mine.kill(); }
  function ready() {
    if (released || mine.dead) return Promise.reject(closed());
    return mine.reader.ready().catch((e) => { mine.kill(); throw e; });
  }
  function read(canvas) {
    if (released || mine.dead) return Promise.reject(closed());
    const run = mine.queue.then(() => {
      if (released || mine.dead) throw closed();
      return mine.reader.read(canvas);
    });
    mine.queue = run.catch(() => {});
    // Erro de leitura: o worker pode ter travado ou caído. Só encerra se o
    // erro não é o "encerrada" desta própria abertura.
    return run.catch((e) => { if (!released && !mine.dead) mine.kill(); throw e; });
  }
  return { ready, read, dispose, kill, backend: () => (mine.reader.backend ? mine.reader.backend() : 'wasm') };
}
