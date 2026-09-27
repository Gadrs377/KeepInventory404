import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const target = resolve('../../vendor/paddle/v1');
await mkdir(target, { recursive: true });
await build({ entryPoints: ['worker.js'], bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['safari16.4', 'chrome100'], minify: true, legalComments: 'linked', outdir: target,
  entryNames: 'worker', chunkNames: '[name]-[hash]',
  alias: { 'onnxruntime-web': resolve('node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs') },
  external: ['fs', 'path', 'crypto'],
});
for (const suffix of ['mjs', 'wasm']) await copyFile(`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.${suffix}`, `${target}/ort-wasm-simd-threaded.${suffix}`);
// Download script verifies hashes before these models are accepted.
for (const [kind, expected] of Object.entries({ det: '781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30', rec: 'f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c' })) {
  const path = resolve(`../../experiments/ocr/public/models/PP-OCRv5_mobile_${kind}.tar`);
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
await writeFile(`${target}/../README.md`, `# PaddleOCR local\n\nSDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv5 mobile det/rec,\nONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa somente em WebAssembly,\numa thread, no worker local. Nenhuma imagem ou texto é enviado a servidores.\n\nOs modelos somam 21,5 MB; o runtime e JS também são baixados no primeiro fallback.\nAssets em v1 são imutáveis; ao mudar qualquer dependência/modelo, gerar v2 e\natualizar js/paddleOcr.js e o cache no service worker.\n\nReproduzir a partir da raiz:\n\n    python3 experiments/ocr/download_models.py\n    cd scripts/paddle\n    npm ci\n    npm run build\n\nFontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime\nModelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.\n`);
