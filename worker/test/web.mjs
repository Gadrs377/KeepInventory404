// Escolha da página do código de barras na web (sem rede): node test/web.mjs
import assert from 'node:assert/strict';
import { pickWebProduct } from '../src/index.js';

const r = (title, url, content = '', score = 0.5) => ({ title, url, content, score });
assert.equal(pickWebProduct({ results: [
  r('Prefeitura Municipal de Curitiba', 'https://mid.curitiba.pr.gov.br/2019/00277429.pdf', 'lista 7896412802409 ...', 0.9),
] }, '7896412802409'), null, 'código só no texto não vale');
assert.equal(pickWebProduct({ results: [r('7896394807378 - outro', 'https://x.com/p/7896394807378')] }, '7896394807379'), null, 'código parecido não vale');
const p = pickWebProduct({ results: [
  r('7896394807379 - sab maran 80g erva doce', 'https://cosmos.bluesoft.com.br/produtos/7896394807379-sab-maran', '', 0.74),
  r('Sabonete Maran Suave Erva Doce 80Gr | Martins Atacado', 'https://www.martinsatacado.com.br/produto/sabonete-maran_7896394807379', '', 0.7),
] }, '7896394807379');
assert.equal(p.name, 'Sabonete Maran Suave Erva Doce 80Gr');
assert.equal(p.host, 'martinsatacado.com.br');
assert.equal(pickWebProduct({ results: [r('7896394807379 - sab maran 80g erva doce', 'https://cosmos.bluesoft.com.br/produtos/7896394807379')] }, '7896394807379').name, 'Sab maran 80g erva doce');
assert.equal(pickWebProduct({ results: [r('SAB MARAN 80G ERVA DOCE - GTIN/EAN/UPC 7896394807379 - Cadastro de Produto com Tributação e NCM - Cosmos', 'https://cosmos.bluesoft.com.br/produtos/7896394807379')] }, '7896394807379').name, 'SAB MARAN 80G ERVA DOCE');
assert.equal(pickWebProduct({ results: [r('Recheio e Cobertura Pistache 1.01kg – Bom Princípio', 'https://www.fescopan.com.br/recheio/p/7897500607265')] }, '7897500607265').name, 'Recheio e Cobertura Pistache 1.01kg Bom Princípio');
console.log('6 testes passaram');
