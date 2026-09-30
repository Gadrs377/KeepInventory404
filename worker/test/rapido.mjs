// Busca do código em paralelo (sem rede, fetch simulado): node test/rapido.mjs
import assert from 'node:assert/strict';
import { lookup } from '../src/index.js';

const EAN = '7891000100103';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cadastro = (name) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, gtin13: EAN, brand: { name: 'Nestlé' } })}</script>`;
const vtex = [{ productName: 'Leite Condensado Moça 395g', brand: 'Moça', items: [{ ean: EAN, images: [] }], categories: [] }];
let calls = [];
function fakeFetch({ storeMs, storeHas, cadMs, cadName }) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push(u);
    const abort = () => new Promise((_, rej) => opts.signal && opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))));
    if (u.includes('/api/catalog_system/')) {
      await Promise.race([sleep(storeMs), abort()]);
      return new Response(JSON.stringify(storeHas ? vtex : []), { headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('cadastroproduto.com.br')) {
      await Promise.race([sleep(cadMs), abort()]);
      return cadName ? new Response(cadastro(cadName)) : new Response('', { status: 404 });
    }
    if (u.includes('api.tavily.com')) return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
    return new Response('', { status: 404 });
  };
}

// 1. Nenhuma loja tem, o catálogo grátis tem: responde sem esperar a fila.
fakeFetch({ storeMs: 200, storeHas: false, cadMs: 300, cadName: 'Leite Condensado Moça 395g' });
let t = Date.now();
let etapas = {};
let r = await lookup(EAN, {}, null, etapas);
assert.ok(r.found && etapas.achou === 'catalogos', 'achou no catálogo');
assert.ok(Date.now() - t < 1500, `em menos de 1,5 s (${Date.now() - t} ms)`);
assert.ok(!calls.some((u) => u.includes('tavily')), 'não gastou a web');

// 2. Loja tem e responde rápido: vale a loja.
fakeFetch({ storeMs: 100, storeHas: true, cadMs: 100, cadName: 'Outro nome' });
etapas = {};
r = await lookup(EAN, {}, null, etapas);
assert.equal(etapas.achou, 'lojas');

// 3. Lojas lentas (3 s) e catálogo já respondeu: aos 2,5 s vale o catálogo.
fakeFetch({ storeMs: 3000, storeHas: true, cadMs: 200, cadName: 'Leite Condensado Moça 395g' });
t = Date.now(); etapas = {};
r = await lookup(EAN, {}, null, etapas);
assert.equal(etapas.achou, 'catalogos');
const ms = Date.now() - t;
assert.ok(ms >= 2400 && ms < 2900, `saiu aos 2,5 s (${ms} ms)`);

// 4. Ninguém tem: a web entra e o nome em outro alfabeto vira "não achei".
fakeFetch({ storeMs: 100, storeHas: false, cadMs: 100, cadName: 'วอสส์ ฟุดดิ้ง' });
r = await lookup(EAN, {}, null, {});
assert.equal(r.found, false, 'nome só em tailandês não conta como achado');
console.log('4 testes passaram');
process.exit(0);
