// Versões de TESTE do Paddle com GPU (WebGPU), em vendor/paddle/gpu1 (ONNX
// Runtime 1.24.3, o mesmo da produção) e vendor/paddle/gpu2 (1.30.0). Os
// modelos continuam em vendor/paddle/v3 (build.mjs); aqui só entram o worker
// e o onnxruntime com GPU. Ver vendor/paddle/gpu1/README.md.
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VARIANTS = [
  { dir: 'gpu1', pkg: 'onnxruntime-web', version: '1.24.3' },
  { dir: 'gpu2', pkg: 'ort130', version: '1.30.0' },
];

// O onnxruntime com GPU não aceita criar duas sessões ao mesmo tempo ("another
// WebGPU EP inference session is being created"), e o SDK cria detecção e
// reconhecimento em paralelo. Aqui, uma depois da outra.
const serialSessions = {
  name: 'serial-sessions',
  setup(b) {
    b.onLoad({ filter: /paddleocr-js.dist.index\.mjs$/ }, async (a) => {
      const before = await readFile(a.path, 'utf8');
      const after = before
        .replace('const [detModel, recModel] = await Promise.all([\n      createDetModel(', 'const detModel = await createDetModel(')
        .replace('\n      }),\n      createRecModel(', '\n      });\n    const recModel = await createRecModel(')
        .replace('batchSize: recBatchSize\n      })\n    ]);', 'batchSize: recBatchSize\n      });');
      if (after === before) throw new Error('O SDK mudou: ajuste o patch de sessões em série');
      return { contents: after, loader: 'js' };
    });
  },
};

for (const { dir, pkg, version } of VARIANTS) {
const target = resolve(`../../vendor/paddle/${dir}`);
await mkdir(target, { recursive: true });
await build({
  entryPoints: ['worker-gpu.js'], bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['safari16.4', 'chrome100'], minify: true, legalComments: 'linked', outdir: target,
  entryNames: 'worker', chunkNames: '[name]-[hash]',
  alias: { 'onnxruntime-web': resolve(`node_modules/${pkg}/dist/ort.webgpu.bundle.min.mjs`) },
  external: ['fs', 'path', 'crypto'], plugins: [serialSessions],
});
// O onnxruntime com GPU usa a variante "asyncify" do WebAssembly.
for (const suffix of ['mjs', 'wasm']) {
  await copyFile(`node_modules/${pkg}/dist/ort-wasm-simd-threaded.asyncify.${suffix}`, `${target}/ort-wasm-simd-threaded.asyncify.${suffix}`);
}
await writeFile(`${target}/README.md`, `# Paddle com GPU (teste)

Mesmo PP-OCRv6 de ../v3, com o ONNX Runtime Web ${version} que usa a GPU
(WebGPU, variante "asyncify"). Só para a tela de testes do app (#/testes,
js/views/testes.js), que compara esta versão com a de produção no próprio
celular. Os modelos são lidos de ../v3/ (não são duplicados).

O SDK cria as duas sessões em paralelo, e o WebGPU do onnxruntime só aceita
uma por vez: o build aplica um patch que as cria em série.

Reproduzir: \`cd scripts/paddle && npm ci && node build-gpu.mjs\`.
`);
}
