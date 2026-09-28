// Validade impressa em pontinhos (lata, algumas tampas). Nem o leitor
// detalhado (Paddle medium) nem o Tesseract leem o bloco como ele é: os
// pontos não formam traço. Reduzindo o texto a ~24–30 px de altura e
// borrando de leve (dotLine), os pontos viram traço e o medium lê. Em dois
// passos: o bloco inteiro (que também diz onde cada linha começa e termina,
// coisa que o leitor rápido erra nesses casos) e depois cada linha, bem
// recortada. Cada leitura isolada ainda erra (9 vira 6, 8 vira 6), então a
// data só vale quando aparece em pelo menos duas leituras e à frente das
// outras. Na foto da lata: "VAL:29/0E2/28" e "UAL/:29>0EZ/28" → 29/12/2028
// (docs/INTERFACES.md, versão 3.51).

import { dotLine } from './ocrImage.js';

// [altura do texto em px, borrão, engordar]: os dois que acertaram na lata.
const BLOCK_VARIANTS = [[30, 2, 0], [24, 2, 1]];
const LINE_VARIANTS = [[30, 2, 0], [24, 2, 1]];
const MAX_LINES = 4;

/**
 * `read(canvas)` → { text, items } (o medium). `source`: a foto (canvas ou
 * imagem). `region`: { x, y, w, h } normalizado. `lineH`: altura estimada de
 * uma linha de texto em px da foto. `parse(text)` → candidatos (dates.js).
 * Devolve { iso, text, texts }: `text` é uma leitura que tem a data vencedora
 * (para a prova e o rótulo), ou iso null quando nenhuma data se repetiu.
 */
export async function readDotPrint(read, source, region, { lineH, parse, seed = [], alive = () => true, progress = () => {} }) {
  const W = source.width; const H = source.height;
  const reg = { x: region.x * W, y: region.y * H, w: region.w * W, h: region.h * H };
  // `seed`: leituras do mesmo pedaço já feitas antes (votam junto).
  const texts = seed.filter(Boolean);
  const boxes = [];
  for (const [textH, blur, passes] of BLOCK_VARIANTS) {
    if (!alive()) return { iso: null, text: '', texts };
    const img = dotLine(source, reg, { rowH: lineH, textH, blur, passes });
    const k = img.width / reg.w;
    let r;
    try { r = await read(img); } catch { continue; }
    texts.push(r.text || '');
    for (const it of r.items || []) {
      if (!it.poly || !it.poly.length) continue;
      const xs = it.poly.map((q) => q[0] / k + reg.x); const ys = it.poly.map((q) => q[1] / k + reg.y);
      boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), text: it.text || '' });
    }
  }
  // Caixas da mesma linha (nas duas leituras do bloco) viram uma só.
  const lines = [];
  for (const b of boxes.sort((a, c) => (a.y0 + a.y1) - (c.y0 + c.y1))) {
    const cy = (b.y0 + b.y1) / 2;
    const same = lines.find((l) => Math.abs((l.y0 + l.y1) / 2 - cy) < lineH * 0.5);
    if (same) { same.x0 = Math.min(same.x0, b.x0); same.x1 = Math.max(same.x1, b.x1); same.y0 = Math.min(same.y0, b.y0); same.y1 = Math.max(same.y1, b.y1); same.text += ` ${b.text}`; }
    else lines.push({ ...b });
  }
  // O lote não interessa: só as outras linhas são lidas de novo.
  const wanted = lines.filter((l) => !/^\s*L[O0U]T/i.test(l.text)).slice(0, MAX_LINES);
  for (const l of wanted) {
    const cy = (l.y0 + l.y1) / 2; const half = lineH * 0.65;
    const x0 = Math.max(0, l.x0 - lineH * 0.3); const x1 = Math.min(W, l.x1 + lineH * 0.3);
    const y0 = Math.max(0, cy - half); const y1 = Math.min(H, cy + half);
    for (const [textH, blur, passes] of LINE_VARIANTS) {
      if (!alive()) return { iso: null, text: '', texts };
      progress();
      try { texts.push((await read(dotLine(source, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { rowH: lineH, textH, blur, passes }))).text || ''); } catch { /* segue */ }
    }
  }
  const votes = new Map();
  for (const t of texts) for (const c of parse(t)) { const v = votes.get(c.iso) || { n: 0, text: t, labeled: false }; v.n++; if (c.labeled && !v.labeled) { v.labeled = true; v.text = t; } votes.set(c.iso, v); }
  const ranked = [...votes.entries()].sort((a, b) => b[1].n - a[1].n);
  const [first, second] = ranked;
  if (!first || first[1].n < 2 || (second && second[1].n >= first[1].n)) return { iso: null, text: '', texts };
  return { iso: first[0], text: first[1].text, texts };
}
