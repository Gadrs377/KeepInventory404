// Roda o Worker no Node, sem Cloudflare, para testar a lógica.
// No ambiente com proxy: NODE_USE_ENV_PROXY=1 node test/local.mjs
import worker, { sizeOf, smallImage } from '../src/index.js';
import assert from 'node:assert/strict';

const env = { ALLOWED_ORIGINS: 'https://gadrs377.github.io' };
const call = async (path, origin = 'https://gadrs377.github.io') => {
  const res = await worker.fetch(new Request(`https://x.dev${path}`, { headers: origin ? { Origin: origin } : {} }), env, { waitUntil() {} });
  return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), body: await res.json() };
};

assert.equal(sizeOf('Leite Condensado Moça Lata 395g'), '395 g');
assert.equal(sizeOf('Desinfetante Sanol 2l Lavanda'), '2 l');
assert.equal(sizeOf('Sabão Líquido 1,5 Litros'), '1,5 l');
assert.equal(smallImage('https://x.vtexassets.com/arquivos/ids/564471/foto.jpg'), 'https://x.vtexassets.com/arquivos/ids/564471-200-200/foto.jpg');

let r = await call('/health');
assert.equal(r.status, 200); assert.equal(r.cors, 'https://gadrs377.github.io');
r = await call('/health', 'https://site-estranho.com');
assert.equal(r.status, 403, 'origem estranha deve ser recusada');
r = await call('/lookup?ean=abc');
assert.equal(r.status, 400);

let t = Date.now();
r = await call('/lookup?ean=7896183301019');
console.log(`lookup Sanol (${Date.now() - t} ms):`, r.body);
assert.equal(r.body.found, true);
t = Date.now();
r = await call('/lookup?ean=7891150037397');
console.log(`lookup Seda (${Date.now() - t} ms):`, r.body.product && r.body.product.name, '|', r.body.product && r.body.product.category);
r = await call('/lookup?ean=7890000000017');
console.log('lookup inexistente:', r.body);
assert.equal(r.body.found, false);

for (const q of ['moça 395', 'detergente ype', 'feijao camil', 'protetor solar nivea']) {
  t = Date.now();
  r = await call(`/search?q=${encodeURIComponent(q)}`);
  console.log(`search "${q}" (${Date.now() - t} ms): ${r.body.results.length} resultados ->`, r.body.results.slice(0, 3).map((p) => `${p.name} [${p.ean}] ${p.size}`).join(' | '));
  assert.ok(r.body.results.length > 0);
}
// /identify com uma IA de mentira: confere a cascata de busca.
const fakeAI = { run: async () => ({ response: '{"marca":"Ypê","produto":"detergente","variante":"neutro","tamanho":"500ml","busca":"ype detergente neutro 500ml"}' }) };
const idRes = await worker.fetch(new Request('https://x.dev/identify', { method: 'POST', headers: { Origin: 'https://gadrs377.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA' }) }), { ...env, AI: fakeAI }, { waitUntil() {} });
const idBody = await idRes.json();
console.log('identify:', idBody.query, '->', idBody.results.length, 'sugestões:', idBody.results.slice(0, 3).map((p) => p.name).join(' | '));
assert.ok(idBody.results.length > 0 && idBody.results.length <= 12);

r = await call('/diag', null);
console.log('diag:', r.body.storesOk, 'lojas OK de', r.body.stores.length);
console.log('todos os testes passaram');

// Nota fiscal do RS (NFC-e): QR Code de uma nota real de exemplo
r = await call('/nfce?p=' + encodeURIComponent('43260907718633007868650080002005971056148317|3|1'));
console.log('nfce:', r.body.store, r.body.items && r.body.items.length, 'itens, total', r.body.total);
assert.equal(r.body.found, true);
assert.equal(r.body.items.length, 21);
r = await call('/nfce?p=abc');
assert.equal(r.status, 400);
r = await call('/nfce?p=' + encodeURIComponent('35260907718633007868650080002005971056148317|3|1'));
assert.equal(r.status, 422, 'nota de outro estado');
