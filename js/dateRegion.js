// Onde está a validade numa foto, a partir das linhas de texto que o leitor
// rápido (Paddle small) encontrou, com posição (js/ocrLayout.js textRows).
// O small às vezes lê a data errado mas acerta o lugar; o medium, lendo só
// aquele pedaço, lê certo e em 2–3 s em vez de ~19 s na foto inteira
// (docs/INTERFACES.md, versão 3.48). As regiões voltam normalizadas (0–1).

const DATE_LIKE = /\b\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{2,4}\b|\b\d{1,2}\s*[/.\-]\s*(?:20)?\d{2}\b/;
const EXP_WORD = /\b(VAL|VALID|VENC|CONSUM|ANTES|EXP|BB|V:)/i;
const OTHER_WORD = /\b(FAB|LOTE|LOT|L:)/i;

/** Quanto uma linha parece a da validade (0 = nada). */
export function dateScore(text) {
  const t = String(text || '');
  return (DATE_LIKE.test(t) ? 2 : 0) + (EXP_WORD.test(t) ? 2 : 0) + (OTHER_WORD.test(t) ? 0.5 : 0);
}

const clamp = (n) => Math.max(0, Math.min(1, n));

// A linha escolhida e as vizinhas imediatas (FAB/VAL/LOTE costumam vir
// empilhados), com folga em volta.
function around(rows, row, H) {
  const cy = row.y + row.h / 2;
  const near = rows.filter((r) => Math.abs(r.y + r.h / 2 - cy) <= row.h * 2.6);
  const y0 = Math.min(...near.map((r) => r.y));
  const y1 = Math.max(...near.map((r) => r.y + r.h));
  // Na horizontal, a largura inteira: quando o small lê errado, a caixa dele
  // costuma ser mais curta que a linha de verdade e cortaria dígitos.
  const my = row.h * 0.8;
  const y = clamp((y0 - my) / H);
  return { x: 0, y, w: 1, h: clamp((y1 + my) / H) - y };
}

/** Palpite de onde está a validade, ou null se nenhuma linha tem cara disso. */
export function guessRegion(rows, W, H) {
  if (!rows || !rows.length) return null;
  const best = rows.map((r) => ({ r, s: dateScore(r.text) })).sort((a, b) => b.s - a.s)[0];
  return best.s >= 2 ? around(rows, best.r, H) : null;
}

/**
 * Recorte para um toque em (u, v), normalizados. Se o toque cai numa linha
 * de texto encontrada (ou bem perto), pega essa linha e as vizinhas; se não,
 * uma faixa da largura da foto na altura do toque (a data pode estar onde o
 * small não viu nada, como na lata gravada a laser).
 */
export function regionAtTap(rows, W, H, u, v) {
  const px = u * W; const py = v * H;
  const hit = (rows || [])
    .map((r) => {
      const dy = Math.max(0, Math.abs(py - (r.y + r.h / 2)) - r.h / 2);
      const dx = Math.max(0, r.x - px, px - (r.x + r.w));
      return { r, dy, dx };
    })
    .filter(({ r, dy, dx }) => dy <= r.h * 1.2 && dx <= W * 0.2)
    .sort((a, b) => a.dy - b.dy || a.dx - b.dx)[0];
  if (hit) return around(rows, hit.r, H);
  // Largura inteira: o rótulo ("V:", "VAL") costuma estar longe do toque.
  const halfH = 0.08;
  const y = clamp(v - halfH);
  return { x: 0, y, w: 1, h: clamp(v + halfH) - y };
}

/** Impressão pequena da foto (16×12 tons de cinza) para achar repetidas. */
export function fingerprint(source) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 12;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, 16, 12);
  const d = g.getImageData(0, 0, 16, 12).data;
  const out = new Uint8Array(16 * 12);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
  return out;
}

/** Fotos quase iguais (mesmo ângulo, mesma luz): diferença média pequena. */
export function similar(a, b, limit = 12) {
  if (!a || !b || a.length !== b.length) return false;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length < limit;
}
