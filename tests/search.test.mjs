import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts, highlight, stem } from '../js/search.js';

const P = (code, name, brand = '', extra = {}) => ({ code, name, brand, size: '', area: 'cozinha', barcodes: [code], ...extra });
const products = [
  P('7896006711117', 'Leite em Pó Ninho', 'Nestlé', { size: '400 g' }),
  P('7891000100103', 'Leite Condensado', 'Moça', { size: '395 g' }),
  P('7896005800018', 'Feijão Carioca', 'Camil', { size: '1 kg' }),
  P('7891024134702', 'Detergente Líquido', 'Ypê', { area: 'limpeza', size: '500 ml' }),
  P('7896104998462', 'Papel Higiênico Folha Dupla', 'Neve', { area: 'limpeza' }),
  P('7891000053508', 'Pães de Queijo', 'Forno de Minas'),
  P('SEM-1', 'Ovo', ''),
  P('7896658000017', 'Dorflex', 'Sanofi', { area: 'remedios', med: { substancia: 'dipirona monoidratada, citrato de orfenadrina, cafeína' } }),
  P('7891150020948', 'Colher de Pau', ''),
];
const names = (q) => searchProducts(products, q).map((p) => p.name);

test('sem acento e sem maiúscula', () => {
  assert.deepEqual(names('feijao'), ['Feijão Carioca']);
  assert.deepEqual(names('FEIJÃO'), ['Feijão Carioca']);
  assert.deepEqual(names('higienico'), ['Papel Higiênico Folha Dupla']);
});
test('palavras em qualquer ordem, cada uma pelo começo', () => {
  assert.deepEqual(names('ninho leite'), ['Leite em Pó Ninho']);
  assert.deepEqual(names('lei cond'), ['Leite Condensado']);
  assert.deepEqual(names('pap hig'), ['Papel Higiênico Folha Dupla']);
  assert.deepEqual(names('leite ninho x'), []); // toda palavra tem de bater
});
test('mais parecido primeiro: começa pelo que foi digitado, nome antes da marca', () => {
  assert.deepEqual(names('leite').slice(0, 2).sort(), ['Leite Condensado', 'Leite em Pó Ninho']);
  assert.equal(names('moça')[0], 'Leite Condensado'); // pela marca
});
test('palavras de ligação valem pouco', () => {
  const list = [P('1', 'Leite de Coco'), P('2', 'Detergente Neutro'), P('3', 'Pães de Queijo')];
  assert.equal(searchProducts(list, 'de')[0].name, 'Detergente Neutro');
  assert.equal(searchProducts(list, 'pao de queijo')[0].name, 'Pães de Queijo');
});
test('singular e plural', () => {
  assert.deepEqual(names('ovos'), ['Ovo']);
  assert.deepEqual(names('pao de queijo'), ['Pães de Queijo']);
  assert.deepEqual(names('colheres'), ['Colher de Pau']);
  assert.equal(stem('papeis'), 'papel');
});
test('erro de digitação', () => {
  assert.deepEqual(names('detergnte'), ['Detergente Líquido']);
  assert.deepEqual(names('feijap'), ['Feijão Carioca']);
  assert.deepEqual(names('condensdo'), ['Leite Condensado']);
  assert.deepEqual(names('detre'), ['Detergente Líquido']); // ainda digitando, letras trocadas
  assert.deepEqual(names('ovi'), []); // palavra curta: sem tolerância, senão tudo bate
});
test('palavras coladas, princípio ativo, ambiente e código', () => {
  assert.deepEqual(names('papelhigienico'), ['Papel Higiênico Folha Dupla']);
  assert.deepEqual(names('dipirona'), ['Dorflex']);
  assert.deepEqual(names('limpeza').sort(), ['Detergente Líquido', 'Papel Higiênico Folha Dupla']);
  assert.deepEqual(names('0053508'), ['Pães de Queijo']);
});
test('destaque mantém acentos e marca só o que bateu', () => {
  assert.equal(highlight('Feijão Carioca', 'feij'), '<mark class="hit">Feij</mark>ão Carioca');
  assert.equal(highlight('Leite em Pó Ninho', 'ninho lei'), '<mark class="hit">Lei</mark>te em Pó <mark class="hit">Ninho</mark>');
  assert.equal(highlight('Pães de Queijo', 'pao'), '<mark class="hit">Pães</mark> de Queijo');
  assert.equal(highlight('<b>', 'b'), '&lt;<mark class="hit">b</mark>&gt;');
});
