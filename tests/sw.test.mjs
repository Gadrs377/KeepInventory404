import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Arquivo do app fora da lista do sw.js: funciona com internet e quebra
// offline (o import falha). Fácil de esquecer ao criar um módulo novo.
test('todo módulo de js/ está no cache do app (sw.js)', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = new Set([...sw.matchAll(/'\.\/(js\/[^']+\.js)'/g)].map((m) => m[1]));
  const files = (await readdir(new URL('../js/', import.meta.url), { recursive: true }))
    .filter((f) => f.endsWith('.js')).map((f) => `js/${f.replaceAll('\\', '/')}`);
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `faltam no APP_FILES do sw.js: ${missing.join(', ')}`);
});
