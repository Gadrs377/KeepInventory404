import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';

// Versão de TESTE do leitor Paddle: o mesmo PP-OCRv6 do worker.js, mas com o
// onnxruntime que sabe usar a GPU (WebGPU). `backend` vem na mensagem init
// ('webgpu' ou 'wasm'); os modelos são os mesmos arquivos de ../v3/, sem
// duplicar download. Usado só pela tela #/testes (js/views/testes.js).
const TIERS = {
  small: { det: 'PP-OCRv6_small_det', rec: 'PP-OCRv6_small_rec', detFile: 'small-det.tar', recFile: 'small-rec.tar' },
  medium: { det: 'PP-OCRv6_medium_det', rec: 'PP-OCRv6_medium_rec', detFile: 'medium-det.tar', recFile: 'medium-rec.tar' },
};

let engine;
let cv;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const tier = TIERS[data.tier];
      if (!tier) throw new Error(`Camada de modelo desconhecida: ${data.tier}`);
      const root = new URL('./', self.location.href);
      const models = new URL('../v3/', root);
      engine = await PaddleOCR.create({
        textDetectionModelName: tier.det,
        textRecognitionModelName: tier.rec,
        textDetectionModelAsset: { url: new URL(tier.detFile, models).href },
        textRecognitionModelAsset: { url: new URL(tier.recFile, models).href },
        worker: false,
        textRecognitionBatchSize: 1,
        ortOptions: { backend: data.backend === 'wasm' ? 'wasm' : 'webgpu', numThreads: 1, proxy: false, wasmPaths: root.href, simd: true },
      });
      cv = cvModule instanceof Promise ? await cvModule : cvModule;
      const s = engine.lastInitializationSummary || {};
      self.postMessage({ id, ready: true, summary: { backend: s.backend, webgpuAvailable: s.webgpuAvailable, detProvider: s.detProvider, recProvider: s.recProvider } });
    } else if (type === 'read') {
      if (!engine || !cv) throw new Error('Leitor ainda não preparado');
      const mat = cv.matFromImageData({ width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixels) });
      try {
        const [result] = await engine.predict(mat, { textDetLimitSideLen: 960, textDetLimitType: 'max', textRecScoreThresh: .35 });
        self.postMessage({ id, items: result.items });
      } finally { mat.delete(); }
    }
  } catch (error) { self.postMessage({ id, error: error?.message || 'Falha na leitura complementar' }); }
};
