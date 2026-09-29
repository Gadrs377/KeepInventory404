import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guessArea, guessAreaInfo, setAreaHints, setAreaModel } from '../js/areas.js';
import { grams } from '../js/areaModel.js';

const model = JSON.parse(await readFile(new URL('../data/area-model.json', import.meta.url), 'utf8'));
const withModel = (fn) => { setAreaModel(model); try { fn(); } finally { setAreaModel(null); } };

test('categoria da loja lida por palavras, não pelo texto exato', () => {
  assert.equal(guessArea({ name: 'X', category: '/Limpeza e Lavanderia/Lava-Louças/' }), 'limpeza');
  assert.equal(guessArea({ name: 'X', category: '/Higiene e Perfumaria/Sabonete/' }), 'beleza');
  assert.equal(guessArea({ name: 'X', category: '/Pratos Prontos e Massas Frescas/Nhoque/' }), 'cozinha');
  assert.equal(guessArea({ name: 'X', category: '/Drogaria/Medicamentos/Dor/' }), 'remedios');
  assert.equal(guessAreaInfo({ name: 'X', category: '/Limpeza/' }).by, 'loja');
});

test('categoria mista não decide; o nome decide', () => {
  const g = guessAreaInfo({ name: 'Sabonete Lux 85g', category: '/Higiene e Limpeza/' });
  assert.equal(g.area, 'beleza');
  assert.equal(g.by, 'regra');
});

test('Anvisa e exceções da casa vêm antes da loja', () => {
  assert.equal(guessAreaInfo({ name: 'Dorflex', med: { substancia: 'dipirona' } }).by, 'anvisa');
  assert.equal(guessArea({ name: 'Papel Higiênico Neve 12 rolos', category: '/Higiene e Beleza/Papel Higiênico/' }), 'limpeza');
});

test('sem nada que decida: chuta Cozinha, mas avisa que não tem certeza', () => {
  assert.deepEqual(guessAreaInfo({ name: 'Zqxw' }), { area: 'cozinha', sure: false, by: 'padrao' });
});

test('"Bob Esponja" não é esponja de limpeza', () => {
  withModel(() => assert.equal(guessArea({ name: 'Iogurte Morango Bob Esponja Batavo 120g' }), 'cozinha'));
  assert.equal(guessArea({ name: 'Esponja Scotch-Brite' }), 'limpeza');
});

test('modelo: nomes sem categoria e nomes de cupom', () => {
  withModel(() => {
    for (const [name, area] of [
      ['DET YPE NEUTRO 500ML', 'limpeza'],
      ['AMAC COMFORT CONC 500ML', 'limpeza'],
      ['Requeijão Cremoso Tirolez 200g', 'cozinha'],
      ['Losartana Potássica 50mg 30 comprimidos', 'remedios'],
      ['CR DENT COLGATE TOT 90G', 'beleza'],
    ]) {
      const g = guessAreaInfo({ name });
      assert.equal(g.area, area, `${name}: ${JSON.stringify(g)}`);
    }
    assert.equal(guessAreaInfo({ name: 'Losartana Potássica 50mg 30 comprimidos' }).by, 'modelo');
  });
});

test('pedaços de letras: palavra com as bordas, sem números e medidas', () => {
  assert.deepEqual(grams('Ypê 500ml'), ['<yp', 'ype', 'pe>', '<ype', 'ype>', '<ype>']);
});

test('o que a casa corrigiu ensina os próximos parecidos', () => {
  setAreaHints([
    { name: 'Vela Aromática Lavanda', area: 'limpeza', areaByUser: true },
    { name: 'Vela Aromática Baunilha', area: 'beleza' }, // não foi escolhido à mão: não conta
  ]);
  try {
    assert.deepEqual(guessAreaInfo({ name: 'Vela Aromática Canela' }), { area: 'limpeza', sure: true, by: 'casa' });
    // Só a primeira palavra: vale quando nada mais tem certeza.
    assert.equal(guessAreaInfo({ name: 'Vela Palito' }).by, 'casa');
    // A casa vence a loja (é onde ela guarda).
    assert.equal(guessArea({ name: 'Vela aromática pote', category: '/Bazar/Decoração/' }), 'limpeza');
  } finally {
    setAreaHints([]);
  }
});
