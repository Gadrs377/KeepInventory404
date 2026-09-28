import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateScore, guessRegion, regionAtTap, similar } from '../js/dateRegion.js';

// Linhas como as do sabonete real (900×1600): o CEP lá embaixo não pode puxar o recorte.
const W = 900; const H = 1600;
const rows = [
  { text: 'VAL 07/2021_11:34', x: 250, y: 640, w: 420, h: 50 },
  { text: 'LOTE 250719BR341L', x: 250, y: 700, w: 420, h: 50 },
  { text: 'Protex Nutri Protect Macadamia', x: 150, y: 820, w: 600, h: 40 },
  { text: 'CEP 09845-000.', x: 100, y: 1500, w: 300, h: 30 },
];

test('pontuação: data e rótulo de validade valem mais que lote', () => {
  assert.ok(dateScore('VAL 07/2021') > dateScore('LOTE 250719'));
  assert.equal(dateScore('Protex Nutri Protect'), 0);
  assert.ok(dateScore('11/08/27 CC22326') >= 2);
});

test('palpite pega a linha da validade e as vizinhas, não o CEP', () => {
  const r = guessRegion(rows, W, H);
  assert.ok(r.y * H < 640 && (r.y + r.h) * H > 750, 'contém VAL e LOTE');
  assert.ok((r.y + r.h) * H < 1400, 'não desce até o CEP');
  assert.equal(guessRegion([{ text: 'Protex', x: 0, y: 0, w: 10, h: 10 }], W, H), null);
  assert.equal(guessRegion([], W, H), null);
});

test('toque encaixa na linha tocada; longe de texto, uma faixa em volta', () => {
  const onVal = regionAtTap(rows, W, H, 400 / W, 660 / H);
  assert.ok(onVal.y * H < 640 && (onVal.y + onVal.h) * H > 690);
  const empty = regionAtTap(rows, W, H, 0.5, 0.3);
  assert.ok(Math.abs(empty.y + empty.h / 2 - 0.3) < 0.01 && empty.w > 0.7);
  const edge = regionAtTap([], W, H, 0.02, 0.98);
  assert.ok(edge.x >= 0 && edge.y + edge.h <= 1.0001);
});

test('fotos parecidas', () => {
  const a = new Uint8Array(192).fill(100);
  const b = new Uint8Array(192).fill(105);
  const c = new Uint8Array(192).fill(160);
  assert.equal(similar(a, b), true);
  assert.equal(similar(a, c), false);
});
