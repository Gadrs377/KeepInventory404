// Testes da leitura da Systax (sem rede): node test/systax.mjs
// Com REDE=1, consulta também as páginas de verdade.
import assert from 'node:assert/strict';
import { parseSystax, lookupSystax } from '../src/index.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok  ${name}`); } catch (err) { console.log(`ERRO ${name}\n  ${err.stack}`); process.exitCode = 1; }
}

// Mesmo desenho da página real (bloco principal, depois "Produtos semelhantes").
const page = ({ canonical, main, name, ncm, similar = [] }) => `<html><head>
<title>Systax - EAN ${main} - ${name}</title>
<link rel="canonical" href="https://www.systax.com.br/ean/${canonical}">
</head><body><div id="box_ean">
<div class="estilo-box-03" id="main_ean" get-ordid="0" get-ncm_ex="19059090">
  <div><h2 class="fonte-open-title h1-title" style="text-align:center;">
    ${name}                    </h2></div>
  <img alt="${main}" src="data:image/svg+xml;base64,AAAA"> <p>${main}</p>
  <p class="fonte-open-body"><strong>
    GTIN/EAN:
    <a href="https://www.systax.com.br/ean/${main}/slug" class="link-list-ean">
      ${main}                                </a>
  </strong><br>NCM:
  <a href="https://www.systax.com.br/classificacaofiscal/ncm/${ncm}" target="_blank">${ncm}</a></p>
</div>
<h3 class="fonte-open-title">Produtos semelhantes - EAN</h3>
<div id="box_list_ean">
${similar.map((e) => `<a href="https://www.systax.com.br/ean/${e}/x" class="link-list-ean">${e}</a>
  <a href="https://www.systax.com.br/classificacaofiscal/ncm/19053100">19053100</a>`).join('\n')}
</div></div></body></html>`;

await test('código que existe: nome e NCM do produto principal', () => {
  const html = page({ canonical: '07896412802409', main: '07896412802409', name: 'Macarrao integral parafuso 500g orquidea', ncm: '19021900', similar: ['07896412802416'] });
  assert.deepEqual(parseSystax(html, '7896412802409'), { name: 'Macarrao integral parafuso 500g orquidea', ncm: '19021900' });
  assert.deepEqual(parseSystax(html, '07896412802409'), { name: 'Macarrao integral parafuso 500g orquidea', ncm: '19021900' });
});

await test('código que não existe: página de um parecido (200) é "não encontrado"', () => {
  // Pedido 7897500607265 (pistache); a Systax mostrou 7897500607388 (creme de avelã).
  const html = page({ canonical: '07897500607388', main: '07897500607388', name: 'Creme de avelã com cacau bom princípio 250 g', ncm: '18069000', similar: ['07897503000957'] });
  assert.equal(parseSystax(html, '7897500607265'), null);
});

await test('o código pedido só nos semelhantes não conta', () => {
  const html = page({ canonical: '07897500607388', main: '07897500607388', name: 'Creme de avelã', ncm: '18069000', similar: ['07897500607265'] });
  assert.equal(parseSystax(html, '7897500607265'), null);
});

await test('bloco principal certo mas endereço canônico de outro: não conta', () => {
  const html = page({ canonical: '07897500607388', main: '07897500607265', name: 'Pistache', ncm: '18069000' });
  assert.equal(parseSystax(html, '7897500607265'), null);
});

await test('página sem o bloco principal ou sem nome: não conta', () => {
  assert.equal(parseSystax('<html><title>Systax</title></html>', '7896412802409'), null);
  assert.equal(parseSystax(page({ canonical: '07896412802409', main: '07896412802409', name: '', ncm: '19021900' }), '7896412802409'), null);
});

await test('EAN-8 e UPC-12 também comparados com 14 dígitos', () => {
  const html = page({ canonical: '00000096385074', main: '00000096385074', name: 'produto curto', ncm: '12345678' });
  assert.equal(parseSystax(html, '96385074').name, 'Produto curto');
  assert.equal(parseSystax(html, '96385075'), null);
});

if (process.env.REDE) {
  await test('rede: Orquídea achado, pistache Bom Princípio não', async () => {
    const hit = await lookupSystax('7896412802409');
    console.log('   ', JSON.stringify(hit));
    assert.equal(hit.ean, '7896412802409');
    assert.match(hit.name, /parafuso 500g orquidea/i);
    assert.equal(hit.ncm, '19021900');
    await assert.rejects(lookupSystax('7897500607265'), /não encontrado/);
  });
}

console.log(`\n${passed} testes passaram`);
