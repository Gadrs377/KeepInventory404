// Limpeza de nomes vindos das fontes: node test/nomes.mjs
import assert from 'node:assert/strict';
import { cleanName } from '../src/index.js';

assert.equal(cleanName('วอสส์น้ำแร่ธรรมชาติ 375มล. Voss Mineral Water 375ml'), 'Voss Mineral Water 375ml', 'tailandês sai, o nome em latim fica');
assert.equal(cleanName('ฟุดดิ้ง วานิลลา'), '', 'só outro alfabeto: vazio (vira "não achei")');
assert.equal(cleanName('Молоко Parmalat 1L'), 'Parmalat 1L', 'cirílico');
assert.equal(cleanName('Kit 3 Sabonete Dove FRETE GRÁTIS'), 'Kit 3 Sabonete Dove', 'ruído de marketplace');
assert.equal(cleanName('Café Melitta 500g - Oferta!'), 'Café Melitta 500g', 'pontuação que sobra no fim');
assert.equal(cleanName('Leite Integral Italac 1L'), 'Leite Integral Italac 1L', 'nome normal não muda');
assert.equal(cleanName('Pão de Açúcar Óleo de Soja 900ml'), 'Pão de Açúcar Óleo de Soja 900ml', 'acentos do português ficam');
console.log('7 testes passaram');
