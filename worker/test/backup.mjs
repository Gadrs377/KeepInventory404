// Cópia automática no banco (sem rede): node test/backup.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { backupSave, backupLatest, backupRoute, backupKeyOk, BACKUP_MAX } from '../src/backup.js';

function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    first: async () => sql.prepare(q).get(...args) || null,
    all: async () => ({ results: sql.prepare(q).all(...args) }),
    run: async () => { if (/^\s*CREATE/i.test(q)) sql.exec(q); else sql.prepare(q).run(...args); return { success: true }; },
  });
  return { prepare: (q) => stmt(q), batch: async (list) => { for (const s of list) await s.run(); } };
}

const db = fakeD1();
const key = 'a'.repeat(32);
assert.equal(backupKeyOk('curta'), false);
assert.equal(backupKeyOk(key), true);
await assert.rejects(backupSave(db, 'X!', new Uint8Array([1])), /Chave/);
await assert.rejects(backupSave(db, key, new Uint8Array(BACKUP_MAX + 1)), /grande/);

// Só ficam as 3 mais recentes; a última volta igual.
for (let i = 1; i <= 5; i++) { await backupSave(db, key, new Uint8Array([i, i, i])); await new Promise((r) => setTimeout(r, 3)); }
const last = await backupLatest(db, key);
assert.deepEqual([...last.bytes], [5, 5, 5]);
assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bk WHERE k = ?').bind(key).first()).n, 3);
assert.equal(await backupLatest(db, 'b'.repeat(32)), null);

// Pela rota: POST guarda, GET devolve em base64; código desconhecido dá 404.
const env = { CATALOG: db };
const url = (k) => new URL(`https://x/backup?chave=${k}`);
const post = await backupRoute(new Request(url(key), { method: 'POST', body: new Uint8Array([9, 8, 7]) }), url(key), env);
assert.equal(post.status, 200);
const got = await (await backupRoute(new Request(url(key)), url(key), env)).json();
assert.deepEqual([...Buffer.from(got.dados, 'base64')], [9, 8, 7]);
assert.equal((await backupRoute(new Request(url('c'.repeat(32))), url('c'.repeat(32)), env)).status, 404);
assert.equal((await backupRoute(new Request(url('ruim')), url('ruim'), env)).status, 400);
console.log('8 testes passaram');
