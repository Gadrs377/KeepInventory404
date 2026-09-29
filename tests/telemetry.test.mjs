import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Fila no localStorage de mentira; o envio fica registrado em `sent`.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const sent = [];
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } }, configurable: true });

const { tel, flush } = await import('../js/telemetry.js');
const { APP_VERSION } = await import('../js/config.js');

test('versão do app igual à do service worker', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], APP_VERSION);
});

test('fila: mesmo id substitui; envia em lote e esvazia', async () => {
  tel('validade', { ms: 100 }, 'val-1');
  tel('validade', { ms: 100, saved: true }, 'val-1');
  tel('codigo', { codigo: '7897500607265', status: 'found' });
  const queued = JSON.parse(localStorage.getItem('ki.tel.fila'));
  assert.equal(queued.length, 2);
  assert.deepEqual(queued.find((e) => e.id === 'val-1').d, { ms: 100, saved: true });
  assert.equal(queued[0].v, APP_VERSION);
  flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/telemetria$/);
  const body = JSON.parse(await sent[0].blob.text());
  assert.deepEqual(body.map((e) => e.k).sort(), ['codigo', 'validade']);
  assert.deepEqual(JSON.parse(localStorage.getItem('ki.tel.fila')), []);
});

test('sem internet: fica na fila', () => {
  navigator.onLine = false;
  tel('busca', { q: 'feijão' });
  flush();
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(localStorage.getItem('ki.tel.fila')).length, 1);
  navigator.onLine = true;
});
