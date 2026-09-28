import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findExpiry, findExpiryCandidates, expiryInputValue } from '../js/dates.js';
import { createExpiryConsensus, needsPaddle } from '../js/expiryRecognition.js';
import { frameIssue } from '../js/frameQuality.js';

test('known labels, missing separators, ISO and corrupted month names', () => {
  for (const text of ['VAL 15/10/26', 'VAL 2026-10-15', 'VAL 15 10 2026', 'VAL 15 0UT 2026', 'VAL15102026', 'FAB 01/09/2026 VAL 15/10/2026 LOTE 12/27']) {
    assert.equal(findExpiry(text, '2026-09-27')?.iso, '2026-10-15', text);
  }
  assert.equal(findExpiry('VAL 10/26', '2026-09-27')?.iso, '2026-10-31');
  assert.equal(findExpiry('V25/03/27', '2026-09-27')?.iso, '2027-03-25');
});
test('manufacture, lot, impossible dates and long identifiers do not become validity', () => {
  for (const text of ['FAB 15/09/2026', 'FABRICACAO: 15/09/2026', 'LOTE 10/26', 'F: 15/09/2026', 'L: 10/26', 'VAL 31/02/2027', 'VAL 2026-02-31', 'VAL 12315102026', 'ARROZ 500 G']) {
    assert.equal(findExpiry(text, '2026-09-27'), null, text);
  }
  assert.equal(expiryInputValue('FAB 15/09/2026'), '');
});
test('ambiguous dates remain choices instead of silently taking the latest', () => {
  const text = '15/10/2026 20/11/2026';
  assert.equal(findExpiry(text, '2026-09-27'), null);
  assert.equal(findExpiryCandidates(text, '2026-09-27').length, 2);
  assert.equal(findExpiry('VAL 15/10/26 20/11/26', '2026-09-27')?.iso, '2026-10-15');
});
const candidate = iso => [{ iso, labeled: true, ambiguous: false }];
test('engines share votes, require distinct frames, and age out old evidence', () => {
  const c = createExpiryConsensus();
  const add = (engine, frame, at, iso='2026-10-15') => c.add({ candidates: candidate(iso), engine, frame, at, confidence: 90 });
  assert.equal(add('tesseract', 1, 0), null);
  assert.equal(add('tesseract', 1, 1), null);
  assert.equal(add('paddle', 1, 2), null);
  assert.equal(add('paddle', 2, 3), '2026-10-15');
  c.reset(); assert.equal(add('tesseract', 3, 4), null);
  assert.equal(add('paddle', 4, 10000), null);
  assert.equal(add('tesseract', 5, 11000), '2026-10-15');
});
test('conflicts, skips and uncertain results cannot auto-confirm', () => {
  const c = createExpiryConsensus({ skip: ['2026-10-15'] });
  for(let frame=0;frame<4;frame++) assert.equal(c.add({candidates:candidate('2026-10-15'),engine:'paddle',frame,at:frame,confidence:99}),null);
  const d=createExpiryConsensus();
  for(let frame=0;frame<4;frame++) assert.equal(d.add({candidates:candidate('2026-10-15'),engine:'tesseract',frame,at:frame,confidence:20}),null);
  assert.equal(needsPaddle(2,10000),false);
  assert.equal(needsPaddle(3,7000),true);
  assert.equal(needsPaddle(6,500),true);
});
test('real packages: spaced and compact month/year preserve expiry labels', () => {
  for (const text of ['F02 25\nV02 27','F0225\nV0227','F:02/25\nV:02 27'])
    assert.equal(findExpiry(text,'2026-09-27')?.iso,'2027-02-28',text);
  assert.equal(findExpiry('F04 26\nVO4 28','2026-09-27')?.iso,'2028-04-30');
  for(const text of ['F0225','L0227','LOTE 0227','V02\n27','VAL 31 02 2027','V 02 27 123'])
    assert.equal(findExpiry(text,'2026-09-27'),null,text);
  assert.equal(findExpiry('F.:05.2025','2026-09-27'),null);
});
test('filters of one still photo count as a single picture', () => {
  const c = createExpiryConsensus();
  const add = (engine, frame, source, at) => c.add({ candidates: candidate('2026-10-15'), engine, frame, source, at, confidence: 90 });
  for (let i = 0; i < 5; i++) assert.equal(add('tesseract', `photo-0-${i}`, 'photo-0', i), null);
  for (let i = 5; i < 10; i++) assert.equal(add('paddle', `photo-0-${i}`, 'photo-0', i), null);
  assert.equal(add('tesseract', 'photo-1-0', 'photo-1', 20), '2026-10-15');
  const d = createExpiryConsensus();
  assert.equal(d.add({ candidates: candidate('2026-10-15'), engine: 'tesseract', frame: 'photo-0-0', source: 'photo-0', at: 0, confidence: 90 }), null);
  assert.equal(d.add({ candidates: candidate('2026-10-15'), engine: 'tesseract', frame: 1.23, at: 1, confidence: 90 }), '2026-10-15');
});
test('consensus explains why a reading did not confirm', () => {
  const c = createExpiryConsensus();
  const why = () => c.why().code;
  c.add({ candidates: [], engine: 'tesseract', frame: 1, at: 0, confidence: 90 }); assert.equal(why(), 'no-date');
  c.add({ candidates: [{ iso: '2026-10-15', labeled: false, ambiguous: false }], engine: 'tesseract', frame: 2, at: 1, confidence: 90 }); assert.equal(why(), 'unlabeled');
  c.add({ candidates: candidate('2026-10-15'), engine: 'tesseract', frame: 3, at: 2, confidence: 30 }); assert.equal(why(), 'confidence'); assert.equal(c.why().detail, 30);
  c.add({ candidates: candidate('2026-10-15'), engine: 'tesseract', frame: 4, at: 3, confidence: 90 }); assert.equal(why(), 'one-picture');
  c.add({ candidates: candidate('2026-10-15'), engine: 'tesseract', frame: 4, at: 4, confidence: 90 }); assert.equal(why(), 'repeated');
  assert.equal(c.add({ candidates: candidate('2026-10-15'), engine: 'paddle', frame: 5, at: 5, confidence: 90 }), '2026-10-15'); assert.equal(why(), 'confirmed');
  const d = createExpiryConsensus();
  d.add({ candidates: [{ iso: '2026-10-15', ambiguous: true, labeled: true }, { iso: '2026-11-20', ambiguous: true, labeled: true }], engine: 'paddle', frame: 1, at: 0, confidence: 90 });
  assert.equal(d.why().code, 'several');
});
test('frame issues: dark, glare, blur and a sharp frame', () => {
  const frame = (fn, width = 64, height = 32) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = fn(x, y); const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    return { data, width, height };
  };
  assert.equal(frameIssue(frame(() => 20)), 'dark');
  assert.equal(frameIssue(frame((x) => (x < 8 ? 255 : 120))), 'glare');
  assert.equal(frameIssue(frame((x) => 100 + x)), 'blur');
  assert.equal(frameIssue(frame((x, y) => ((x + y) % 2 ? 60 : 200))), null);
});
test('unlabeled manufacture cannot auto-confirm even with repeated confident readings', () => {
  const c=createExpiryConsensus();
  for(let frame=0;frame<6;frame++)assert.equal(c.add({candidates:findExpiryCandidates('06/25','2026-09-27'),engine:'paddle',frame,at:frame,confidence:95}),null);
});
test('real printed labels: misread VAL, FAB block, label on another line, combined heading', () => {
  const today = '2026-09-27';
  const labeled = (text) => { const c = findExpiryCandidates(text, today); return c.length === 1 && c[0].labeled ? c[0].iso : null; };
  // Textos lidos pelo Paddle no copo (tests/real): VAL virou RL, U9L, UAL, BL, URL, UPL.
  for (const text of ['FAB:05/08/24\nRL:17/09/26', 'FAB:05/06/2\nU9L:17/09/26', 'FAB:05/06/2\nUAL:17/09/26', 'AB:05/06/24\nBL:17/09/26', 'FR5:05/06/2/\nURL:17/09/26', 'FRB:05/08/21\nUPL:17/09/26'])
    assert.equal(labeled(text), '2026-09-17', text);
  assert.equal(labeled('FAB:05/08/24\n17/09/26'), '2026-09-17');
  assert.equal(labeled('FAB:05/08/26\n20/08/26'), '2026-08-20');
  // Chocolate: "CONSUMIR ANTES DE/LOTE:" com a data antes do código de lote.
  assert.equal(labeled('ANTESDE/LOIE: 11/08/27 CC22'), '2027-08-11');
  assert.equal(labeled('CONSUMIR ANTES DE/LOTE: 11/08/27 CC22326493 04:50'), '2027-08-11');
  assert.equal(labeled('VAL/LOTE: 11/08/27 L123'), '2027-08-11');
  assert.equal(labeled('VALIDADE: VER NA TAMPA\nLOREM IPSUM DOLOR SIT AMET CONSECTETUR ADIPISCING ELIT SED\n11/08/27'), '2027-08-11');
  // Proteções: fabricação e lote mal lidos, datas antes da fabricação, sem rótulo nenhum.
  for (const text of ['FAL:05/08/26', 'PL:05/08/26', 'ML: 12/27', 'RL:17/09/24', 'FAB:05/08/27\n20/08/26', 'UAL:05/08/26\nFAB:10/08/26', '06/08/28', '11/08/27 CC22326', 'O SURIOD LEDHE SNPOLVO\n11/08/27 CC22326493 04:50\nBRICADO POR TOP CAU'])
    assert.equal(labeled(text), null, text);
  assert.deepEqual(findExpiryCandidates('FAB/LOTE: 05/06/26', today), []);
  assert.deepEqual(findExpiryCandidates('L: 10/26', today), []);
});
test('validade antiga com VAL escrito vale; sem rótulo, não', () => {
  // Sabonete real (tests da Bancada, 28/09/2026): "VAL 07/2021 11:34 / LOTE 250719BR341L".
  assert.equal(findExpiry('VAL 07/2021 11:34\nLOTE 250719BR341L', '2026-09-28')?.iso, '2021-07-31');
  assert.deepEqual(findExpiryCandidates('07/2021', '2026-09-28'), []);
  assert.deepEqual(findExpiryCandidates('FAB 07/2021', '2026-09-28'), []);
});
