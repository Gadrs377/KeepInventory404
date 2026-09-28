import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const target = resolve('../../vendor/paddle/v3');
await mkdir(target, { recursive: true });
await build({ entryPoints: ['worker.js'], bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['safari16.4', 'chrome100'], minify: true, legalComments: 'linked', outdir: target,
  entryNames: 'worker', chunkNames: '[name]-[hash]',
  alias: { 'onnxruntime-web': resolve('node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs') },
  external: ['fs', 'path', 'crypto'],
});
for (const suffix of ['mjs', 'wasm']) await copyFile(`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.${suffix}`, `${target}/ort-wasm-simd-threaded.${suffix}`);
// Download script verifies hashes before these models are accepted.
// small: leitura contínua (rápida). medium: só a foto nítida (mais lenta
// por leitura, enxerga mais em material difícil) — ver worker.js (TIERS).
const MODEL_HASHES = {
  'small-det': ['PP-OCRv6_small_det', 'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4'],
  'small-rec': ['PP-OCRv6_small_rec', 'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1'],
  'medium-det': ['PP-OCRv6_medium_det', 'c5adb0b15de1b1838934eba1dd72e7529e7d80132216c6ee6d26eba6fa054fcf'],
  'medium-rec': ['PP-OCRv6_medium_rec', 'd8cc46c7163c83a151aef8fce5856b965860df90a875029216d605b0f607eaec'],
};
for (const [outName, [modelName, expected]] of Object.entries(MODEL_HASHES)) {
  const path = resolve(`../../experiments/ocr/public/models/${modelName}.tar`);
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Modelo ${modelName} inválido`);
  await copyFile(path, `${target}/${outName}.tar`);
}
for (const [source, name] of [
  ['licenses/LICENSE-onnxruntime', 'LICENSE-onnxruntime'],
  ['licenses/LICENSE-opencv', 'LICENSE-opencv'],
  ['licenses/LICENSE-boost', 'LICENSE-boost'],
  ['node_modules/js-yaml/LICENSE', 'LICENSE-js-yaml'],
  ['node_modules/@techstark/opencv-js/LICENSE', 'LICENSE-opencv-js'],
  ['../../vendor/tesseract/LICENSE-tesseract.js.md', 'LICENSE-Apache-2.0'],
]) await copyFile(source, `${target}/../${name}`);
await writeFile(`${target}/../README.md`, `# PaddleOCR local

SDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv6 (duas
camadas, veja abaixo), ONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa
somente em WebAssembly, uma thread, no worker local. Nenhuma imagem ou
texto é enviado a servidores.

Duas camadas do mesmo PP-OCRv6, escolhidas por \`tier\` na mensagem \`init\`
do worker (\`worker.js\`, mapa \`TIERS\`):

- **small** (31,2 MB): usada na leitura contínua ao vivo. Rápida (~0,6 s por
  leitura) — o que importa ali é tentar muitos quadros por segundo.
- **medium** (138,8 MB): usada só na foto nítida (manual ou automática
  durante a dica de inclinar/luz). Mais lenta (~4 s por leitura, quase 7x),
  mas enxerga mais em material difícil: no mesmo conjunto de quadros reais
  de uma lata com validade gravada a laser, a small só recuperava o LOTE; a
  medium também achou fragmentos da própria data (ex. "AB-29/DEZ", que bate
  com a validade real). Só é baixada quando a foto nítida realmente entra
  em ação, não na leitura contínua. Ver docs/LEITURA_VALIDADE.md.

Assets em cada pasta vN são imutáveis; ao mudar qualquer dependência/modelo,
gerar a próxima vN e atualizar js/paddleOcr.js e o cache no service worker.

Reproduzir a partir da raiz:

    python3 experiments/ocr/download_models.py
    cd scripts/paddle
    npm ci
    npm run build

Fontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime
Modelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.
`);
