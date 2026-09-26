// Câmera + decodificação de código de barras.
// Usa o BarcodeDetector nativo quando existe (Android/Chrome) e o polyfill ZXing
// em WebAssembly quando não existe (iPhone/Safari, desktop Firefox).

// qr_code: o QR Code da nota fiscal do mercado (importa a compra inteira).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];
const SCAN_INTERVAL = 150;
// O mesmo código só é aceito de novo depois de sumir do visor por este tempo.
const GONE_BEFORE_REPEAT = 800;

let detectorPromise;

async function getDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.length) return new window.BarcodeDetector({ formats });
      } catch { /* cai no polyfill */ }
    }
    const mod = await import('../vendor/barcode-detector/ponyfill.js');
    const wasmUrl = new URL('../vendor/barcode-detector/zxing_reader.wasm', import.meta.url).href;
    mod.setZXingModuleOverrides({
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    });
    return new mod.BarcodeDetector({ formats: FORMATS });
  })();
  detectorPromise.catch(() => { detectorPromise = null; });
  return detectorPromise;
}

// Pré-carrega o decodificador para a primeira leitura ser rápida.
export function warmUp() {
  getDetector().catch(() => {});
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Cria um leitor ligado a um <video>.
 * onCode(code) é chamado uma vez por código confirmado; o leitor fica pausado
 * até resume() ser chamado.
 */
export function createScanner(video, { onCode, onError }) {
  let stream = null;
  let running = false;
  let paused = false;
  let raf = 0;
  let lastScan = 0;
  let busy = false;
  let candidate = null;
  let lastAccepted = { code: null, seenAt: 0 };

  async function start() {
    if (running) return;
    if (!cameraSupported()) {
      onError?.({ kind: 'unsupported' });
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err) {
      const kind = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'nocamera';
      onError?.({ kind, err });
      return;
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch { /* autoplay bloqueado raramente; o frame ainda chega */ }
    running = true;
    try {
      await getDetector();
    } catch (err) {
      onError?.({ kind: 'decoder', err });
      return;
    }
    loop();
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (paused || busy || now - lastScan < SCAN_INTERVAL || video.readyState < 2) return;
    lastScan = now;
    busy = true;
    detect().finally(() => { busy = false; });
  }

  async function detect() {
    let codes;
    try {
      const detector = await getDetector();
      codes = await detector.detect(video);
    } catch {
      return;
    }
    if (!running || paused) return;
    const value = codes && codes[0] && String(codes[0].rawValue || '').trim();
    if (!value) { candidate = null; return; }
    const t = Date.now();
    // A embalagem que acabou de ser registrada continua na frente da câmera:
    // ignora até ela sair do visor.
    if (value === lastAccepted.code && t - lastAccepted.seenAt < GONE_BEFORE_REPEAT) {
      lastAccepted.seenAt = t;
      return;
    }
    // Confirmação dupla: aceita só quando duas leituras seguidas concordam.
    if (candidate !== value) { candidate = value; return; }
    candidate = null;
    lastAccepted = { code: value, seenAt: t };
    paused = true;
    onCode?.(value);
  }

  function pause() { paused = true; }

  function resume() {
    candidate = null;
    lastAccepted.seenAt = Date.now();
    paused = false;
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    video.srcObject = null;
  }

  // Resolução maior para o QR Code da nota; volta ao normal para poupar bateria.
  async function setHighRes(on) {
    const track = stream && stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;
    const size = on ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : { width: { ideal: 1280 }, height: { ideal: 720 } };
    try { await track.applyConstraints(size); } catch { /* fica como está */ }
  }

  function torchAvailable() {
    const track = stream && stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    return !!caps.torch;
  }

  async function setTorch(on) {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  return { start, stop, pause, resume, torchAvailable, setTorch, setHighRes, get running() { return running; } };
}
