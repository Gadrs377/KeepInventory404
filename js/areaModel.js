// Ambiente pelo nome do produto, sem internet: Naive Bayes com pedaços de 3 a 5
// letras de cada palavra ("<det", "dete", "deter"...). Treinado com os produtos
// das lojas (scripts/area-model.mjs), que já vêm separados por departamento.
// Os pedaços é que fazem "DET YPE NEUTRO" (nome de cupom) virar limpeza: "<det"
// aparece em "detergente". Medido em lojas que o treino não viu (docs/SYSTEM_DESIGN
// 5.6): 98% com o nome normal, 96% com o nome abreviado.

export const MODEL_AREAS = ['cozinha', 'limpeza', 'beleza', 'remedios'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Pedaços de cada palavra; números e medidas ("500ml", "2x") ficam de fora.
export function grams(name) {
  const out = [];
  for (const w of norm(name).split(' ')) {
    if (!w || /^\d+([a-z]{1,3})?$/.test(w)) continue;
    const p = `<${w}>`;
    for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= p.length; i++) out.push(p.slice(i, i + n));
  }
  return out;
}

// Contagem para o treino: em quantos produtos de cada ambiente cada pedaço aparece.
export function countGrams(rows) {
  const f = new Map();
  const d = [0, 0, 0, 0];
  for (const { name, area } of rows) {
    const k = MODEL_AREAS.indexOf(area);
    if (k < 0) continue;
    d[k]++;
    for (const g of new Set(grams(name))) {
      let c = f.get(g);
      if (!c) f.set(g, (c = [0, 0, 0, 0]));
      c[k]++;
    }
  }
  return { d, f };
}

// Arquivo do modelo: { v, d: [produtos por ambiente], f: { pedaço: [4 contagens] } }.
export function compileModel(data) {
  const f = new Map(Object.entries(data.f || {}));
  const d = data.d;
  const N = d.reduce((a, b) => a + b, 0);
  const V = f.size;
  const tot = [0, 1, 2, 3].map((k) => { let t = 0; for (const c of f.values()) t += c[k]; return t; });
  const prior = d.map((x) => Math.log(x / N));
  return {
    // { area, conf }: conf de 0 a 1. Os pedaços de uma palavra dependem uns dos
    // outros, então a soma é "esfriada" (dividida por um quarto dos pedaços)
    // para a confiança não sair exagerada.
    classify(name) {
      const gs = grams(name).filter((g) => f.has(g));
      if (!gs.length) return { area: null, conf: 0 };
      const sc = prior.map((p, k) => gs.reduce((a, g) => a + Math.log((f.get(g)[k] + 1) / (tot[k] + V)), p));
      const t = Math.max(1, gs.length / 4);
      const m = Math.max(...sc);
      const e = sc.map((v) => Math.exp((v - m) / t));
      const S = e.reduce((a, b) => a + b, 0);
      let k = 0;
      for (let i = 1; i < 4; i++) if (e[i] > e[k]) k = i;
      return { area: MODEL_AREAS[k], conf: e[k] / S };
    },
  };
}
