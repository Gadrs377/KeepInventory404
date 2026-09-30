// Nomes da comunidade no banco (sem rede): node test/comunidade.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { suggestName, voteName, bestName, nameOk, communityRoute } from '../src/community.js';

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
const EAN = '7891234567895';

assert.equal(nameOk('Pó para Pudim Royal 50g'), true);
assert.equal(nameOk('ab'), false, 'curto');
assert.equal(nameOk('Compre em www.loja.com'), false, 'link');
assert.equal(nameOk('Ligue 51 99999-8888'), false, 'telefone');

// Sugestão de um aparelho: já aparece (1 a 0), ainda não confirmada.
await suggestName(db, { ean: EAN, name: 'Pó para Pudim Royal 50g', brand: 'Royal', size: '50 g', device: 'aparelhoum1' });
let b = await bestName(db, EAN);
assert.equal(b.name, 'Pó para Pudim Royal 50g');
assert.deepEqual(b.comunidade, { sim: 1, nao: 0, confirmado: false });

// Outro aparelho confirma: confirmado. Votar de novo não conta duas vezes.
await voteName(db, { ean: EAN, name: b.name, vote: 1, device: 'aparelhodois2' });
await voteName(db, { ean: EAN, name: b.name, vote: 1, device: 'aparelhodois2' });
b = await bestName(db, EAN);
assert.deepEqual(b.comunidade, { sim: 2, nao: 0, confirmado: true });

// Dois "não é este" e um nome concorrente: o concorrente passa na frente.
await voteName(db, { ean: EAN, name: 'Pó para Pudim Royal 50g', vote: -1, device: 'aparelhotres3' });
await voteName(db, { ean: EAN, name: 'Pó para Pudim Royal 50g', vote: -1, device: 'aparelhoquatro' });
await voteName(db, { ean: EAN, name: 'Pó para Pudim Royal 50g', vote: -1, device: 'aparelhodois2' });
assert.equal(await bestName(db, EAN), null, 'mais "não é" que "é": sai da frente');
await suggestName(db, { ean: EAN, name: 'Pudim Royal Chocolate 50g', device: 'aparelhotres3' });
assert.equal((await bestName(db, EAN)).name, 'Pudim Royal Chocolate 50g');

// Voto em nome que não existe e pedidos ruins.
await assert.rejects(voteName(db, { ean: EAN, name: 'Outro', vote: 1, device: 'aparelhoum1' }), /desconhecido/);
await assert.rejects(suggestName(db, { ean: '12', name: 'Nome bom', device: 'aparelhoum1' }), /inválido/);

// Limite por aparelho por dia.
for (let i = 0; i < 20; i++) await suggestName(db, { ean: `78900000000${String(i).padStart(2, '0')}`, name: `Produto número ${i}`, device: 'aparelhospam' }).catch(() => {});
await assert.rejects(suggestName(db, { ean: '7890000009999', name: 'Mais um', device: 'aparelhospam' }), /Limite/);

// Pela rota.
const env = { CATALOG: db };
const u = new URL('https://x/comunidade/voto');
const r = await communityRoute(new Request(u, { method: 'POST', body: JSON.stringify({ ean: EAN, name: 'Pudim Royal Chocolate 50g', voto: 1, aparelho: 'aparelhocinco' }) }), u, env);
assert.equal(r.status, 200);
assert.equal((await bestName(db, EAN)).comunidade.sim, 2);
console.log('11 testes passaram');
