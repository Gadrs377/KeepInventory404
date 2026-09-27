// Lazy per-camera worker. Closing the reader terminates it and releases WASM.
// Its JS, models and runtime are self-hosted and cached by sw.js after use.
export function createPaddleReader() {
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
        worker = new Worker(new URL('../vendor/paddle/v1/worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const item = pending.get(data.id); if (!item) return;
          clearTimeout(item.timer); pending.delete(data.id);
          if (data.error) item.reject(new Error(data.error)); else item.resolve(data);
        };
        worker.onerror = () => dispose(new Error('Leitor complementar indisponível'));
        worker.onmessageerror = () => dispose(new Error('Resposta do leitor inválida'));
        init = request('init', {}, [], 60000);
      } catch (error) { init = Promise.reject(error); }
    }
    return init;
  }
  async function read(canvas) {
    await ready();
    if (stopped) throw new Error('Leitura encerrada');
    const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const result = await request('read', { width: image.width, height: image.height, pixels: image.data.buffer }, [image.data.buffer]);
    const items = result.items || [];
    return { text: items.map(item => item.text).join('\n'), confidence: items.length ? 100 * Math.min(...items.map(item => item.score)) : 0, items };
  }
  return { ready, read, dispose };
}
