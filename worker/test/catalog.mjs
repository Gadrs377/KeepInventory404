// Testes do catálogo (sem rede): node test/catalog.mjs
// O D1 é imitado com o SQLite que vem no Node (mesmo motor do D1).
// Com REDE=1, baixa algumas páginas reais das lojas e mede os bytes por produto.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  varints, unvarints, tidyName, gtinNumber, imageUrlOf, packImage, rowsFromVtex, leavesOf,
  saveRows, catalogGet, catalogLearn, photoSave, photoGet, catalogStep, catalogStats, ensureSchema, CATALOG_STORES, PAGE,
} from '../src/catalog.js';

// D1 de mentira: prepare().bind().first()/all()/run() e batch().
function fakeD1(file = ':memory:') {
  const sql = new DatabaseSync(file);
  const conv = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  const rowOut = (r) => { const o = { ...r }; for (const k in o) if (o[k] instanceof Uint8Array) o[k] = Array.from(o[k]); return o; };
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a.map(conv)),
    first: async () => { const r = sql.prepare(q).get(...args); return r ? rowOut(r) : null; },
    all: async () => ({ results: sql.prepare(q).all(...args).map(rowOut) }),
    run: async () => { if (/^\s*CREATE/i.test(q)) sql.exec(q); else sql.prepare(q).run(...args); return { success: true }; },
  });
  let queries = 0;
  return {
    sql,
    get queries() { return queries; },
    prepare: (q) => { queries++; return stmt(q); },
    batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok  ${name}`); } catch (err) { console.log(`ERRO ${name}\n  ${err.stack}`); process.exitCode = 1; }
}

const vtexProduct = (over = {}) => ({
  productName: 'DETERGENTE LÍQUIDO YPÊ NEUTRO 500ML',
  brand: 'Ypê',
  categories: ['/Limpeza/Cuidados com a cozinha/Lava louça/', '/Limpeza/'],
  items: [{ ean: '7896098900208', name: 'Detergente', images: [{ imageUrl: 'https://zaffari.vteximg.com.br/arquivos/ids/123456/detergente.jpg?v=1' }] }],
  ...over,
});

await test('varint vai e volta', () => {
  const nums = [0, 1, 127, 128, 16383, 16384, 2 ** 21, 2 ** 35 + 7];
  assert.deepEqual(unvarints(varints(nums)), nums);
  assert.equal(varints([127]).length, 1);
  assert.equal(varints([128]).length, 2);
  assert.deepEqual(unvarints(Array.from(varints([300, 5]))), [300, 5]); // D1 devolve BLOB como lista
});

await test('nome em maiúsculas vira título; nome normal fica', () => {
  assert.equal(tidyName('  DETERGENTE  LÍQUIDO YPÊ 500ML '), 'Detergente Líquido Ypê 500ml');
  assert.equal(tidyName('Leite UHT Integral Piracanjuba 1L'), 'Leite UHT Integral Piracanjuba 1L');
});

await test('código de barras: dígito verificador e zeros à esquerda', () => {
  assert.equal(gtinNumber('7896098900208'), 7896098900208);
  assert.equal(gtinNumber('7896098900209'), null);
  assert.equal(gtinNumber('0047400179240'), gtinNumber('047400179240'));
  assert.equal(gtinNumber('96385074'), 96385074);
  assert.equal(gtinNumber('abc'), null);
});

await test('foto: loja e número da imagem num número só', () => {
  assert.equal(imageUrlOf(packImage(0, 123456)), 'https://zaffari.vteximg.com.br/arquivos/ids/123456-320-320');
  const carrefour = CATALOG_STORES.findIndex(([h]) => h.startsWith('carrefourbrfood'));
  assert.equal(imageUrlOf(packImage(carrefour, 9)), 'https://carrefourbr.vteximg.com.br/arquivos/ids/9-320-320');
  assert.equal(imageUrlOf(packImage(63, 0)), '');
  assert.ok(CATALOG_STORES.length < 63);
});

await test('grava e lê de volta: nome, marca, categoria, foto', async () => {
  const db = fakeD1();
  const rows = rowsFromVtex(vtexProduct(), 'www.zaffari.com.br');
  await ensureSchema(db);
  assert.equal(await saveRows(db, rows), 1);
  const p = await catalogGet(db, '7896098900208');
  assert.equal(p.name, 'Detergente Líquido Ypê Neutro 500ml');
  assert.equal(p.brand, 'Ypê');
  assert.equal(p.category, '/Limpeza/Cuidados com a cozinha/Lava louça/');
  assert.equal(p.image, 'https://zaffari.vteximg.com.br/arquivos/ids/123456-320-320');
  assert.equal(p.store, 'www.zaffari.com.br');
  assert.equal(await catalogGet(db, '7891000100103'), null);
  // Repetido não grava de novo; palavras repetidas não duplicam o dicionário.
  assert.equal(await saveRows(db, rows), 0);
  const words = db.sql.prepare('SELECT count(*) n FROM w').get().n;
  await saveRows(db, rowsFromVtex(vtexProduct({ productName: 'Detergente Líquido Ypê Limão 500ml', items: [{ ean: '7896098900215' }] }), 'www.zaffari.com.br'));
  assert.equal(db.sql.prepare('SELECT count(*) n FROM w').get().n, words + 1); // só "Limão" é nova
  assert.equal((await catalogGet(db, '7896098900215')).image, '');
});

await test('produto de fora das lojas (CadastroProduto) entra sem foto', async () => {
  const db = fakeD1();
  await catalogLearn(db, { name: 'Sabonete Maran Erva Doce 90g', brand: 'Maran', ean: '7896394807379', store: 'cadastroproduto.com.br' });
  const p = await catalogGet(db, '7896394807379');
  assert.equal(p.name, 'Sabonete Maran Erva Doce 90g');
  assert.equal(p.brand, 'Maran');
  assert.equal(p.category, '');
  assert.equal(p.image, '');
  assert.equal(p.store, 'catalogo');
});

await test('foto de fora das lojas: bytes guardados no banco', async () => {
  const db = fakeD1();
  await catalogLearn(db, { name: 'Recheio cobert bom principio 1,01kg pistache', ean: '7897500607265', store: 'api.cosmos.bluesoft.com.br' });
  assert.equal((await catalogGet(db, '7897500607265')).photo, false);
  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]).buffer;
  assert.equal(await photoSave(db, '7897500607265', bytes, 'https://sugarkingdom.cl/p.png'), true);
  const p = await catalogGet(db, '7897500607265');
  assert.equal(p.photo, true);
  assert.equal(p.image, '');
  assert.deepEqual(Array.from(await photoGet(db, '07897500607265')), [82, 73, 70, 70, 1, 2, 3]);
  assert.equal(await photoGet(db, '7896394807379'), null);
  // Produto de loja usa a foto da loja, não pergunta ao banco de fotos.
  await catalogLearn(db, { name: 'Detergente', ean: '7896098900208', store: 'www.zaffari.com.br', image: 'https://zaffari.vteximg.com.br/arquivos/ids/123456-320-320' });
  assert.equal((await catalogGet(db, '7896098900208')).photo, false);
});

await test('muitas palavras novas de uma vez (mais de 100 parâmetros)', async () => {
  const db = fakeD1();
  const base = 789100000000;
  const products = [];
  for (let k = 0; k < 60; k++) {
    const d = String(base + k).split('').map(Number);
    const sum = d.slice().reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
    products.push({ name: `Produto${k} Sabor${k} Extra${k}`, ean: `${base + k}${(10 - (sum % 10)) % 10}`, store: 'www.zaffari.com.br' });
  }
  assert.equal(await catalogLearn(db, products), 60);
  assert.equal((await catalogGet(db, products[59].ean)).name, 'Produto59 Sabor59 Extra59');
});

await test('robô: árvore de categorias, páginas, próxima categoria, próxima loja', async () => {
  const db = fakeD1();
  const tree = [{ id: 1, children: [{ id: 10 }, { id: 11 }] }, { id: 2, children: [] }];
  assert.deepEqual(leavesOf(tree), ['/1/10/', '/1/11/', '/2/']);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith('/category/tree/2')) return Response.json(tree);
    const from = Number(u.searchParams.get('_from'));
    const leaf = u.searchParams.get('fq');
    const count = leaf === 'C:/1/10/' && from === 0 ? PAGE : 3; // 1ª categoria tem 2 páginas
    return Response.json(Array.from({ length: count }, (_, k) => {
      const n = 100000000000 + from + k + (leaf.length * 1000) + calls.length * 100000;
      const d = String(n).split('').map(Number);
      const sum = d.slice().reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
      return vtexProduct({ productName: `Item ${n}`, items: [{ ean: `${n}${(10 - (sum % 10)) % 10}` }] });
    }));
  };
  const stores = [['a.test', 'a'], ['b.test', 'b']];
  const seen = [];
  for (let k = 0; k < 5; k++) seen.push((await catalogStep(db, { fetchImpl, stores })).host);
  assert.deepEqual(seen, ['a.test', 'a.test', 'a.test', 'a.test', 'b.test']);
  assert.ok(calls.some((u) => u.includes('fq=C:/1/10/&_from=20&_to=39')));
  const stats = await catalogStats(db);
  assert.equal(stats.rodadas, 5);
  assert.equal(stats.produtos, PAGE + 3 + 3 + 3 + PAGE); // a loja b começa pela 1ª página cheia
});

await test('robô: loja fora do ar não trava (pula depois de 3 erros)', async () => {
  const db = fakeD1();
  const fetchImpl = async () => new Response('não', { status: 503 });
  const stores = [['a.test', 'a'], ['b.test', 'b']];
  const seen = [];
  for (let k = 0; k < 4; k++) seen.push((await catalogStep(db, { fetchImpl, stores })).host);
  assert.deepEqual(seen, ['a.test', 'a.test', 'a.test', 'b.test']);
  assert.equal((await catalogStats(db)).erros, 4);
});

await test('robô: poucas consultas por rodada (limite do D1: 50)', async () => {
  const db = fakeD1();
  const fetchImpl = async (url) => {
    if (url.includes('/category/tree/2')) return Response.json([{ id: 1, children: [] }]);
    return Response.json(Array.from({ length: PAGE }, (_, k) => vtexProduct({
      productName: `Palavra${k}a Palavra${k}b Palavra${k}c Palavra${k}d Palavra${k}e Palavra${k}f`,
      items: [{ ean: String(gtin(200000000000 + k)) }],
    })));
  };
  const before = db.queries;
  await catalogStep(db, { fetchImpl, stores: [['a.test', 'a']] });
  assert.ok(db.queries - before < 50, `${db.queries - before} consultas`);
});

function gtin(n12) {
  const d = String(n12).split('').map(Number);
  const sum = d.slice().reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return `${n12}${(10 - (sum % 10)) % 10}`;
}

// Medida real (rede): algumas páginas de lojas de verdade num arquivo SQLite.
if (process.env.REDE) {
  const { rmSync, statSync } = await import('node:fs');
  const file = `${process.env.TMPDIR || '/tmp'}/catalogo-medida.sqlite`;
  rmSync(file, { force: true });
  const db = fakeD1(file);
  db.sql.exec('PRAGMA page_size = 4096');
  const stores = CATALOG_STORES.filter(([h]) => /zaffari|atacadao|drogariasaopaulo|cobasi/.test(h));
  const pages = Number(process.env.PAGINAS || 60);
  let json = 0;
  const fetchImpl = async (url, init) => { const r = await fetch(url, init); const t = await r.text(); json += t.length; return new Response(t, { status: r.status }); };
  for (let k = 0; k < pages; k++) {
    // Pula de loja a cada 15 páginas para misturar supermercado, farmácia e pet.
    if (k && k % 15 === 0) db.sql.exec(`UPDATE c SET v = json_set(v, '$.s', json_extract(v, '$.s') + 1, '$.k', 0, '$.f', 0) WHERE k = 'cur'`);
    await catalogStep(db, { fetchImpl, stores });
  }
  db.sql.exec('VACUUM');
  const n = db.sql.prepare('SELECT count(*) n FROM p').get().n;
  const size = (t) => db.sql.prepare(`SELECT coalesce(sum(pgsize), 0) s FROM dbstat WHERE name = '${t}'`).get().s;
  const payload = (t) => db.sql.prepare(`SELECT coalesce(sum(payload), 0) s FROM dbstat WHERE name = '${t}'`).get().s;
  const words = db.sql.prepare('SELECT count(*) n FROM w').get().n;
  const nameBytes = db.sql.prepare('SELECT avg(length(n)) a FROM p').get().a;
  console.log(`\nMedida real: ${n} produtos, ${words} palavras no dicionário (JSON das lojas: ${(json / 1e6).toFixed(1)} MB)`);
  console.log(`  tabela p: ${(payload('p') / n).toFixed(1)} bytes de dados por produto, ${(size('p') / n).toFixed(1)} com as páginas; nome codificado: ${nameBytes.toFixed(1)} bytes`);
  console.log(`  dicionário (w + índice): ${((size('w') + size('sqlite_autoindex_w_1')) / 1024).toFixed(0)} KB`);
  console.log(`  arquivo inteiro: ${(statSync(file).size / n).toFixed(1)} bytes por produto`);
  const sample = db.sql.prepare('SELECT e FROM p ORDER BY random() LIMIT 3').all();
  for (const r of sample) console.log('  ', JSON.stringify(await catalogGet(db, String(r.e))));
}

console.log(`\n${passed} testes passaram`);
