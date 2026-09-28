// Lazy per-camera worker. Closing the reader terminates it and releases WASM.
// Its JS, models and runtime are self-hosted and cached by sw.js after use.
// `tier`: 'small' (leitura contínua, rápida) ou 'medium' (foto nítida, mais
// lenta por leitura mas enxerga mais em material difícil) — mesmo worker,
// modelos PP-OCRv6 diferentes. Ver docs/LEITURA_VALIDADE.md.
// `gpu`: só para a tela de testes. Usa vendor/paddle/gpu1 (onnxruntime com
// WebGPU); `gpu: 'wasm'` roda esse mesmo pacote sem GPU, para comparar.
// `readTimeout`: quanto uma leitura pode levar antes de desistir.
import { textRows } from './ocrLayout.js';
export function createPaddleReader(tier = 'small', { gpu = null, readTimeout = 30000 } = {}) {
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
        worker = new Worker(new URL(gpu ? '../vendor/paddle/gpu1/worker.js' : '../vendor/paddle/v3/worker.js', import.meta.url), { type: 'module' });
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
