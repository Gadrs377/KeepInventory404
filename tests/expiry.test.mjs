import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findExpiry, findExpiryCandidates, expiryInputValue } from '../js/dates.js';
import { createExpiryConsensus, needsPaddle } from '../js/expiryRecognition.js';

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
test('unlabeled manufacture cannot auto-confirm even with repeated confident readings', () => {
  const c=createExpiryConsensus();
  for(let frame=0;frame<6;frame++)assert.equal(c.add({candidates:findExpiryCandidates('06/25','2026-09-27'),engine:'paddle',frame,at:frame,confidence:95}),null);
});
