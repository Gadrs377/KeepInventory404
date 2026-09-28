// Busca por nome no armário, sem internet e sem IA. Pensada para como se
// digita no celular, com pressa:
// - sem acento e sem maiúscula: "feijao" acha "Feijão";
// - palavras em qualquer ordem, cada uma pelo começo: "ninho lei" acha
//   "Leite em Pó Ninho";
// - singular e plural: "ovos" acha "Ovo", "pao" acha "Pães";
// - um erro de digitação por palavra (dois nas longas): "detergnte" acha
//   "Detergente";
// - palavras coladas: "papelhigienico" acha "Papel Higiênico";
// - também marca, tamanho, princípio ativo do remédio, ambiente e código.
// Todas as palavras digitadas têm de bater. O nome pesa mais que a marca,
// e a marca mais que o resto.

import { AREAS } from './areas.js';

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const WORD = /[\p{L}\p{N}]+/gu;
const words = (s) => fold(s).match(WORD) || [];

// Plural simples do português: "pães" -> "pao", "papéis" -> "papel",
// "colheres" -> "colher", "pudins" -> "pudim", "ovos" -> "ovo".
export function stem(w) {
  if (w.length < 4) return w;
  return w
    .replace(/(oes|aes|aos)$/, 'ao')
    .replace(/eis$/, 'el').replace(/ais$/, 'al').replace(/ois$/, 'ol')
    .replace(/ns$/, 'm')
    .replace(/([rz])es$/, '$1')
    .replace(/s$/, '');
}

// Distância de edição com troca de letras vizinhas; para cedo acima de `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

const typos = (q) => (q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0);

// Palavras de ligação no nome ("Leite de Coco"): batem, mas valem pouco,
// senão "de" (começo de "detergente") traria todo "… de …" na frente.
const SMALL = new Set(['a', 'o', 'e', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'com', 'sem', 'para', 'por', 'ou']);

// Quanto a palavra digitada `q` bate com a palavra `w` do produto, e que
// pedaço de `w` bateu (para destacar). 0 = não bate.
function wordHit(q, w) {
  const hit = rawHit(q, w);
  if (hit && SMALL.has(w)) hit.score = Math.min(hit.score, 0.5);
  return hit;
}

function rawHit(q, w) {
  if (w === q || stem(w) === stem(q)) return { score: 4, from: 0, to: w.length };
  if (w.startsWith(q)) return { score: 3, from: 0, to: q.length };
  const max = typos(q);
  if (max && (distance(q, w, max) <= max || stem(w) !== w && distance(stem(q), stem(w), max) <= max)) return { score: 1.5, from: 0, to: w.length };
  // Digitando ainda: o erro está no começo de uma palavra mais comprida.
  if (max && w.length > q.length && distance(q, w.slice(0, q.length), max) <= max) return { score: 1.2, from: 0, to: q.length };
  if (q.length >= 3) {
    const at = w.indexOf(q);
    if (at > 0) return { score: 1, from: at, to: at + q.length };
  }
  return null;
}

// Textos do produto onde procurar, do mais forte para o mais fraco.
function fields(p) {
  const area = AREAS.find((a) => a.id === (p.area || 'cozinha'));
  return [
    { text: p.name, weight: 1 },
    { text: p.brand, weight: 0.75 },
    { text: [p.size, p.med && p.med.substancia, area && area.label].filter(Boolean).join(' '), weight: 0.5 },
  ];
}

/**
 * Nota do produto para a busca (quanto maior, mais parecido), ou 0 se alguma
 * palavra digitada não bate em nada.
 */
export function scoreProduct(p, query) {
  const qs = words(query);
  if (!qs.length) return 0;
  const fs = fields(p).map((f) => ({ ...f, words: words(f.text), joined: fold(f.text).replace(/[^\p{L}\p{N}]+/gu, '') }));
  const codes = [p.code, ...(p.barcodes || [])].map((c) => String(c || ''));
  let total = 0;
  for (const q of qs) {
    let best = 0;
    if (/^\d{4,}$/.test(q) && codes.some((c) => c.includes(q))) best = 3;
    for (const f of fs) {
      for (const w of f.words) {
        const hit = wordHit(q, w);
        if (hit && hit.score * f.weight > best) best = hit.score * f.weight;
      }
      // Palavras coladas ("papelhigienico") ou pedaço que atravessa palavras.
      if (q.length >= 5 && f.joined.includes(q) && 1 * f.weight > best) best = 1 * f.weight;
    }
    if (!best) return 0;
    total += best;
  }
  const name = words(p.name);
  if (name[0] && name[0].startsWith(qs[0])) total += 1.5; // começa pelo que foi digitado
  return total - name.length * 0.01; // nomes curtos primeiro, no empate
}

/** Produtos que batem com `query`, do mais parecido para o menos. */
export function searchProducts(products, query) {
  return products
    .map((p) => ({ p, score: scoreProduct(p, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'pt-BR'))
    .map((r) => r.p);
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * `text` em HTML, com o que bateu com `query` dentro de <mark>. Mantém os
 * acentos e maiúsculas originais: só a comparação é sem acento.
 */
export function highlight(text, query) {
  const src = String(text || '');
  const qs = words(query);
  if (!qs.length) return escHtml(src);
  const marks = new Array(src.length).fill(false);
  for (const m of src.matchAll(WORD)) {
    // Palavra sem acento, com o índice de cada letra no texto original.
    let w = ''; const at = [];
    for (let i = 0; i < m[0].length; i++) {
      const f = fold(m[0][i]);
      for (const ch of f) { w += ch; at.push(m.index + i); }
    }
    let best = null;
    for (const q of qs) {
      const hit = wordHit(q, w);
      if (hit && (!best || hit.score > best.score)) best = hit;
    }
    if (best) for (let k = best.from; k < best.to && k < at.length; k++) marks[at[k]] = true;
  }
  let html = ''; let open = false;
  for (let i = 0; i < src.length; i++) {
    if (marks[i] && !open) { html += '<mark class="hit">'; open = true; }
    if (!marks[i] && open) { html += '</mark>'; open = false; }
    html += escHtml(src[i]);
  }
  return open ? `${html}</mark>` : html;
}
