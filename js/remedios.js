// Remédios: a base pública da Anvisa (tabela CMED), montada por
// scripts/remedios.py em data/remedios/. Pelo código de barras o app baixa só
// uma parte pequena da base; a busca pelo nome baixa a lista enxuta uma vez.
// Sem fotos: de remédio o app guarda só os dados oficiais.

const BASE = 'data/remedios/';
const shards = new Map(); // "NN" -> Promise<{ [ean]: remédio }>
let searchList = null;    // Promise<[ean, nome, substância, tamanho, laboratório, vendido][]>
let infoPromise = null;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function getJson(path, timeout = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Resolve com os dados do remédio ou null. Lança erro se a base não abrir
// (sem internet e ainda não guardada no celular).
export async function medByEan(ean) {
  if (!/^\d{8,14}$/.test(String(ean || ''))) return null;
  const key = ean.slice(-3, -1);
  if (!shards.has(key)) {
    const p = getJson(`ean/${key}.json`);
    shards.set(key, p);
    p.catch(() => shards.delete(key));
  }
  const data = await shards.get(key);
  return data[ean] || null;
}

// Do jeito que o resto do app cadastra um produto.
export function medInfo(med) {
  return {
    name: med.nome,
    brand: med.laboratorio || '',
    size: med.tamanho || '',
    image: '',
    category: '',
    area: 'remedios',
    med,
    source: 'anvisa',
  };
}

// Busca pelo nome, pelo princípio ativo, pela dose ou pelo laboratório. Cada palavra
// digitada tem de aparecer; o nome que começa com o que foi digitado vem
// primeiro, depois o princípio ativo, e o que ainda é vendido antes do resto.
export async function searchMeds(query, limit = 40) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (!searchList) {
    searchList = getJson('busca.json', 30000).then((rows) => rows.map((r) => ({
      ean: r[0], nome: r[1], substancia: r[2], tamanho: r[3], laboratorio: r[4], vendido: !!r[5],
      key: fold(`${r[1]} ${r[2]} ${r[3]} ${r[4]}`), nameKey: fold(r[1]), substKey: fold(r[2]),
    })));
    searchList.catch(() => { searchList = null; });
  }
  const rows = await searchList;
  const first = words[0];
  const score = (r) => (r.nameKey.startsWith(first) ? 0 : r.substKey.startsWith(first) ? 1 : 2) * 2 + (r.vendido ? 0 : 1);
  return rows
    .filter((r) => words.every((w) => r.key.includes(w)))
    .map((r) => [score(r), r])
    .sort((a, b) => a[0] - b[0] || a[1].nome.localeCompare(b[1].nome, 'pt-BR') || a[1].tamanho.localeCompare(b[1].tamanho, 'pt-BR', { numeric: true }))
    .slice(0, limit)
    .map(([, r]) => r);
}

// { fonte, url, data: AAAA-MM-DD, codigos }
export function baseInfo() {
  if (!infoPromise) {
    infoPromise = getJson('info.json');
    infoPromise.catch(() => { infoPromise = null; });
  }
  return infoPromise;
}

// ---------- Textos ----------

export const TARJA = {
  livre: { label: 'Sem tarja', note: 'Venda sem receita' },
  vermelha: { label: 'Tarja vermelha', note: 'Venda com receita' },
  'vermelha-retencao': { label: 'Tarja vermelha', note: 'A farmácia retém a receita' },
  preta: { label: 'Tarja preta', note: 'Receita especial, retida na farmácia' },
};

export const TIPO = {
  'Genérico': 'Genérico',
  Similar: 'Similar',
  Novo: 'Referência ou novo',
  'Específico': 'Específico',
  'Biológico': 'Biológico',
  'Fitoterápico': 'Fitoterápico',
};

// Bula no Bulário Eletrônico da Anvisa, pelo nome do remédio.
export function bulaUrl(med) {
  return `https://consultas.anvisa.gov.br/#/bulario/q/?nomeProduto=${encodeURIComponent(med.nome)}`;
}

// Registro de 13 números como a Anvisa escreve: 1.0573.0376.001-1.
export function registroText(r) {
  const d = String(r || '').replace(/\D/g, '');
  if (d.length !== 13) return d;
  return `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 9)}.${d.slice(9, 12)}-${d[12]}`;
}

export function money(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
