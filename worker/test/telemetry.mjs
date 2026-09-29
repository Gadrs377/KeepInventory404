// Telemetria no banco (sem rede): node test/telemetry.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { telSave, telRead, telCount, telPrune, telKey } from '../src/telemetry.js';

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
const now = Date.now();
assert.equal(await telSave(db, [
  { id: 'v1', k: 'validade', t: now - 1000, s: 'abc', v: 'v81', d: { how: 'sozinho', ms: 4200 } },
  { k: 'codigo', d: { codigo: '7897500607265', status: 'found' } },
  { k: 'Tipo Ruim', d: {} },
  { k: 'grande', d: { x: 'a'.repeat(20000) } },
  null,
]), 2, 'tipo inválido, evento grande e nulo ficam de fora');

// Mesmo id: a visita é atualizada, não duplicada.
await telSave(db, [{ id: 'v1', k: 'validade', t: now, s: 'abc', v: 'v81', d: { how: 'sozinho', ms: 4200, saved: true } }]);
const all = await telRead(db);
assert.equal(all.length, 2);
assert.deepEqual(all.find((e) => e.id === 'v1').d, { how: 'sozinho', ms: 4200, saved: true });
assert.deepEqual(await telCount(db), { codigo: 1, validade: 1 });
assert.equal((await telRead(db, { kind: 'codigo' }))[0].d.codigo, '7897500607265');

// Data absurda vira a hora de chegada; o antigo sai na limpeza.
await telSave(db, [{ id: 'velho', k: 'erro', t: 1, d: {} }]);
assert.ok((await telRead(db, { kind: 'erro' }))[0].t >= now);
db.prepare('UPDATE tel SET t = ? WHERE id = ?').bind(now - 100 * 86400000, 'velho').run();
await telPrune(db, 90);
assert.equal((await telRead(db, { kind: 'erro' })).length, 0);

// Chave de leitura: só com a chave da Tavily no repassador.
assert.equal(await telKey({}), '');
assert.match(await telKey({ TAVILY_API_KEY: 'x' }), /^[0-9a-f]{32}$/);
console.log('7 testes passaram');
