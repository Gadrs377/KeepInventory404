// Escolha da página do código de barras na web (sem rede): node test/web.mjs
import assert from 'node:assert/strict';
import { pickWebProduct, pickWebByName, gtinOk, pickWebImages, smallWebImage } from '../src/index.js';

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
assert.equal(gtinOk('7896394807379'), true);
assert.equal(gtinOk('7896394807378'), false, 'dígito verificador errado não gasta busca');

// Pelo que a foto mostra: marca obrigatória, 3 de 4 palavras, código do endereço.
const cat = (title, ean, site = 'cosmos.bluesoft.com.br/produtos') => ({ title, url: `https://${site}/${ean}-x` });
const read = { brand: 'Santa Amália', product: 'macarrão espaguete', size: '500g' };
assert.deepEqual(pickWebByName({ results: [cat('MACARRÃO AMALIA C/OVOS 500GR TORTELONI', '7896021300457')] }, read), [], 'torteloni não é espaguete');
assert.deepEqual(pickWebByName({ results: [cat('MAC STA FELICIDADE ESPAGUETE 500G', '7896423702811')] }, read), [], 'outra marca');
const maran = pickWebByName({ results: [
  { title: 'Sabonete - Cosmos', url: 'https://cosmos.bluesoft.com.br/lista/sabonete?page=127' },
  cat('SAB MARAN 80G ERVA DOCE - GTIN/EAN/UPC 7896394807379 - Cadastro de Produto com Tributação e NCM - Cosmos', '7896394807379'),
  { title: 'Systax - EAN 07896394807379 - Sabonete maran erva doce 80g', url: 'https://www.systax.com.br/ean/07896394807379' },
] }, { brand: 'Maran', product: 'sabonete', variant: 'erva doce', size: '80g' });
assert.equal(maran.length, 1, 'mesmo código, uma sugestão só');
assert.equal(maran[0].ean, '7896394807379');
assert.equal(maran[0].name, 'Sab Maran 80g erva doce');
// Foto: só a imagem cuja descrição cita 2 palavras do nome (em inglês também).
const imgs = { images: [
  { url: 'https://target.scene7.com/x.jpg', description: 'A cylindrical container of Up&Up Gentle Infant Formula' },
  { url: 'https://i0.wp.com/sugarkingdom.cl/p.png?fit=1080%2C1080&ssl=1', description: 'A package of pistachios from the brand Bom Princípio stands upright' },
] };
assert.deepEqual(pickWebImages(imgs, 'Recheio cobert bom principio 1,01kg pistache'), ['https://i0.wp.com/sugarkingdom.cl/p.png?fit=1080%2C1080&ssl=1']);
assert.deepEqual(pickWebImages(imgs, 'Sab maran 80g erva doce'), []);
// Reduz pelo wsrv.nl; o servidor do WordPress vai direto ao site (o wsrv recusa).
const small = new URL(smallWebImage('https://i0.wp.com/sugarkingdom.cl/p.png?fit=1080%2C1080&ssl=1'));
assert.equal(small.host, 'wsrv.nl');
assert.equal(small.searchParams.get('url'), 'https://sugarkingdom.cl/p.png');
assert.equal(small.searchParams.get('w'), '320');
console.log('15 testes passaram');
