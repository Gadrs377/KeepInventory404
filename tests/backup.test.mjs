// Cópia automática: compactar e voltar igual. node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, String(v)); } };
const { packBackup, unpackBackup, formatCode, parseCode, backupKey } = await import('../js/backup.js');

test('backup: gzip vai e volta igual', async () => {
  const data = { app: 'KeepInventory404', products: [{ code: '789', name: 'Café Melitta', qty: 2 }], movements: [] };
  const bytes = await packBackup(data);
  assert.equal(bytes[0], 0x1f);
  assert.deepEqual(await unpackBackup(bytes), data);
});

test('backup: texto sem gzip também abre', async () => {
  const bytes = new TextEncoder().encode('{"a":1}');
  assert.deepEqual(await unpackBackup(bytes), { a: 1 });
});

test('backup: código da casa em grupos e de volta', () => {
  const k = backupKey();
  assert.match(k, /^[a-z0-9]{24,48}$/);
  assert.equal(backupKey(), k, 'a mesma chave nas próximas vezes');
  assert.equal(parseCode(formatCode(k)), k);
  assert.equal(parseCode(' abcd-EFGH 1234 '), 'abcdefgh1234');
});
