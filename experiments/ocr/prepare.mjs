import { cp, mkdir, readdir, copyFile } from 'node:fs/promises';
await mkdir('public/baseline/js', { recursive: true });
await cp('../../vendor/tesseract', 'public/baseline/vendor/tesseract', { recursive: true });
for (const f of ['ocr.js', 'dates.js']) await copyFile(`../../js/${f}`, `public/baseline/js/${f}`);
await mkdir('public/ort', { recursive: true });
for (const f of await readdir('node_modules/onnxruntime-web/dist')) {
  if (f.startsWith('ort-wasm') && /\.(wasm|mjs)$/.test(f)) await copyFile(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}
