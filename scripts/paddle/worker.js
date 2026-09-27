import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';

let engine;
let cv;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const root = new URL('./', self.location.href);
      engine = await PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textRecognitionModelName: 'PP-OCRv5_mobile_rec',
        textDetectionModelAsset: { url: new URL('det.tar', root).href },
        textRecognitionModelAsset: { url: new URL('rec.tar', root).href },
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
