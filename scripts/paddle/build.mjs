import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const target = resolve('../../vendor/paddle/v2');
await mkdir(target, { recursive: true });
await build({ entryPoints: ['worker.js'], bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['safari16.4', 'chrome100'], minify: true, legalComments: 'linked', outdir: target,
  entryNames: 'worker', chunkNames: '[name]-[hash]',
  alias: { 'onnxruntime-web': resolve('node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs') },
  external: ['fs', 'path', 'crypto'],
});
for (const suffix of ['mjs', 'wasm']) await copyFile(`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.${suffix}`, `${target}/ort-wasm-simd-threaded.${suffix}`);
// Download script verifies hashes before these models are accepted.
for (const [kind, expected] of Object.entries({ det: 'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4', rec: 'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1' })) {
  const path = resolve(`../../experiments/ocr/public/models/PP-OCRv6_small_${kind}.tar`);
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Modelo ${kind} inválido`);
  await copyFile(path, `${target}/${kind}.tar`);
}
for (const [source, name] of [
  ['licenses/LICENSE-onnxruntime', 'LICENSE-onnxruntime'],
  ['licenses/LICENSE-opencv', 'LICENSE-opencv'],
  ['licenses/LICENSE-boost', 'LICENSE-boost'],
  ['node_modules/js-yaml/LICENSE', 'LICENSE-js-yaml'],
  ['node_modules/@techstark/opencv-js/LICENSE', 'LICENSE-opencv-js'],
  ['../../vendor/tesseract/LICENSE-tesseract.js.md', 'LICENSE-Apache-2.0'],
]) await copyFile(source, `${target}/../${name}`);
await writeFile(`${target}/../README.md`, `# PaddleOCR local\n\nSDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv6 small det/rec,\nONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa somente em WebAssembly,\numa thread, no worker local. Nenhuma imagem ou texto é enviado a servidores.\n\nOs modelos somam 29,8 MB (era PP-OCRv5 mobile, 21,5 MB); o runtime e JS\ntambém são baixados no primeiro fallback. Trocado em v2 porque o PP-OCRv6\nsmall leu corretamente todo um teste sintético em que o v5 mobile errou\n2 de 6 casos, e recuperou texto limpo (LOTE completo, duas vezes, a 99% de\nconfiança) numa foto real de relevo em metal onde o v5 mobile só achou\nruído — ver docs/LEITURA_VALIDADE.md.\n\nAssets em cada pasta vN são imutáveis; ao mudar qualquer dependência/modelo,\ngerar a próxima vN e atualizar js/paddleOcr.js e o cache no service worker.\n\nReproduzir a partir da raiz:\n\n    python3 experiments/ocr/download_models.py\n    cd scripts/paddle\n    npm ci\n    npm run build\n\nFontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime\nModelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.\n`);
