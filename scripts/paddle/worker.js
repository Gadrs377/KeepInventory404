import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';

// Duas camadas do mesmo PP-OCRv6: "small" para a leitura contínua (rápida,
// muitas tentativas por segundo) e "medium" só para a foto nítida (mais
// lenta por leitura, mas enxerga mais em material difícil) — ver
// docs/LEITURA_VALIDADE.md.
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
      engine = await PaddleOCR.create({
        textDetectionModelName: tier.det,
        textRecognitionModelName: tier.rec,
        textDetectionModelAsset: { url: new URL(tier.detFile, root).href },
        textRecognitionModelAsset: { url: new URL(tier.recFile, root).href },
        // This entire pipeline already lives in our dedicated module worker.
        worker: false,
        textRecognitionBatchSize: 1,
        ortOptions: { backend: 'wasm', numThreads: 1, proxy: false, wasmPaths: root.href, simd: true },
      });
      cv = cvModule instanceof Promise ? await cvModule : cvModule;
      self.postMessage({ id, ready: true });
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
