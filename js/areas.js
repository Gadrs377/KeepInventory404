// Ambientes da casa e como o app decide o ambiente de um produto novo.
// Em ordem (vale a primeira que tiver certeza):
//   1. base da Anvisa: é remédio;
//   2. o que a casa já corrigiu (produtos com areaByUser, mesmo começo de nome);
//   3. exceções da casa (papel higiênico fica na limpeza, não na "higiene");
//   4. categoria da loja, lida por palavras ("Limpeza e Lavanderia");
//   5. palavras conhecidas do nome ("sabonete" é beleza, "sabão" é limpeza);
//   6. modelo treinado com os produtos das lojas (areaModel.js), se tiver certeza.
// Sem certeza, o app pergunta ao Mercado Livre (repassador, /area) e mostra
// "Confira onde fica" na folha. A pessoa sempre pode trocar.

import { compileModel } from './areaModel.js';

export const AREAS = [
  { id: 'cozinha', label: 'Cozinha', short: 'Cozinha', icon: 'pot' },
  { id: 'limpeza', label: 'Banheiro e limpeza', short: 'Limpeza', icon: 'spray' },
  { id: 'beleza', label: 'Beleza e cuidados', short: 'Beleza', icon: 'lotus' },
  { id: 'remedios', label: 'Remédios', short: 'Remédios', icon: 'pill' },
];

export const isMed = (p) => !!p && p.area === 'remedios';

export const AREA_IDS = AREAS.map((a) => a.id);

export function areaLabel(id, short = false) {
  const a = AREAS.find((x) => x.id === id) || AREAS[0];
  return short ? a.short : a.label;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Itens que as lojas classificam de um jeito, mas que em casa ficam em outro
// lugar (papel higiênico aparece em "Higiene e beleza" nas lojas).
const OVERRIDES = [
  [/\b(papel higienico|saco (plastico )?(de |para )?lixo|lixo|toalha de papel|papel toalha|guardanapo|inseticida|repelente)\b/, 'limpeza'],
  [/\b(protetor (labial|solar)|balm labial)\b/, 'beleza'],
];

// Segmentos da categoria das lojas, lidos por palavras ("Limpeza e Lavanderia",
// "Higiene e Perfumaria"). Vale o primeiro segmento que aponta um ambiente só;
// um segmento misto ("Higiene e Limpeza") não decide.
// Remédio em qualquer nível da categoria (as farmácias usam "/Farmácia/Medicamentos/...").
const MED_CATEGORY = /^(medicamentos?.*|remedios|genericos|similares|dor e febre|gripe e resfriado|antialergicos)$/;

const CATEGORY_RULES = [
  [/\b(limpeza|lavanderia|descartaveis|utilidades domesticas)\b/, 'limpeza'],
  [/\b(mercearia|bebidas?|hortifruti|frios|laticinios|padaria|confeitaria|carnes?|aves|acougue|peixaria|congelados|matinais|doces|biscoitos|alimentos?|alimentacao|bomboniere|pets?|cafe da manha|cafeteria|pratos prontos|massas frescas|rotisserie|churrasco|vinhos|cervejas?)\b/, 'cozinha'],
  [/\b(perfumaria|higiene|beleza|cuidados? pessoa(l|is)|dermocosmeticos?|cosmeticos?|cabelos?|maquiagem|bebes?|mamaes?|infantil|farmacia|drogaria|barbear|barbeadores?|aparador de pelos|fraldas?)\b/, 'beleza'],
];

function areaFromCategory(category) {
  const segments = norm(category).split('/').map((x) => x.trim()).filter(Boolean);
  if (segments.some((seg) => MED_CATEGORY.test(seg))) return 'remedios';
  for (const seg of segments) {
    const hit = CATEGORY_RULES.filter(([re]) => re.test(seg));
    if (hit.length === 1) return hit[0][1];
  }
  return null;
}

// Palavras do nome, quando a categoria não resolve. "sabonete" é beleza, "sabão" é limpeza.
const NAME_RULES = [
  [/\b(shampoo|xampu|condicionador|sabonete|desodorante|antitranspirante|creme dental|pasta de dente|escova dental|escova de dente|fio dental|enxaguante|anti-?s?septico|antisseptico bucal|barbeador|prestobarba|aparelho de barbear|umedecid[ao]s?|capilar|micelar|demaquilante|creme de pentear|filtro solar|hidratante|locao|creme (facial|de rosto|corporal|para pentear)|serum|maquiagem|base liquida|batom|rimel|esmalte|perfume|colonia|barbear|lamina|absorvente|cotonete|haste flexivel|algodao|fralda|lenco umedecido|talco|tintura|coloracao)\b/, 'beleza'],
  [/\b(detergente|lava[ -]?loucas?|lava[ -]?roupas?|sabao|amaciante|desinfetante|agua sanitaria|alvejante|cloro|multiuso|limpa[ -]?vidros?|limpador|lustra[ -]?moveis|tira[ -]?manchas|(?<!bob )esponja|palha de aco|odorizador|purificador de ar|cera (liquida|para pisos?)|luva (de limpeza|para louca|esfrebom)|luva bettanin|pano (de chao|microfibra|esfregao|multiuso)|esfregao|rodo|vassoura|pedra sanitaria|veja|pinho sol|sanol|omo|comfort|downy|harpic|bombril)\b/, 'limpeza'],
];

// ---------- O que a casa ensinou ----------
// Produto em que alguém escolheu o ambiente à mão (areaByUser) ensina os
// próximos com o mesmo começo de nome: "Vela aromática" na limpeza leva as
// próximas "Vela aromática" para lá. As duas primeiras palavras decidem; só a
// primeira ("vela") vale quando nada mais tem certeza.
let hints = new Map();

function hintKeys(name) {
  const ws = norm(name).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !/^\d/.test(w));
  return ws.length ? [ws.slice(0, 2).join(' '), ws[0]] : [];
}

export function setAreaHints(products) {
  const votes = new Map();
  for (const p of products || []) {
    if (!p || !p.areaByUser || !AREA_IDS.includes(p.area)) continue;
    for (const k of new Set(hintKeys(p.name))) {
      const v = votes.get(k) || {};
      v[p.area] = (v[p.area] || 0) + 1;
      votes.set(k, v);
    }
  }
  hints = new Map([...votes].map(([k, v]) => [k, Object.entries(v).sort((x, y) => y[1] - x[1])[0][0]]));
}

// ---------- Modelo (areaModel.js) ----------
let model = null;
// Confiança mínima para decidir sem perguntar: com 0,7 o modelo decidiu 95%
// dos produtos de teste e acertou todos esses.
export const MODEL_SURE = 0.7;

export function setAreaModel(data) {
  model = data && data.d && data.f ? compileModel(data) : null;
}

let modelLoading = null;
export function loadAreaModel(url = './data/area-model.json') {
  if (!modelLoading) {
    modelLoading = fetch(url).then((res) => (res.ok ? res.json() : null)).then(setAreaModel).catch(() => { modelLoading = null; });
  }
  return modelLoading;
}

// { area, sure, by }: by = anvisa | casa | regra | loja | modelo | padrao.
export function guessAreaInfo(p) {
  if (p && p.med) return { area: 'remedios', sure: true, by: 'anvisa' };
  const name = (p && p.name) || '';
  const [key2, key1] = hintKeys(name);
  if (key2 && hints.has(key2)) return { area: hints.get(key2), sure: true, by: 'casa' };
  const text = norm(`${name} ${(p && p.brand) || ''}`).replace(/\bsem perfume\b/g, '');
  for (const [re, area] of OVERRIDES) if (re.test(text)) return { area, sure: true, by: 'regra' };
  const fromStore = areaFromCategory(p && p.category);
  if (fromStore) return { area: fromStore, sure: true, by: 'loja' };
  for (const [re, area] of NAME_RULES) if (re.test(text)) return { area, sure: true, by: 'regra' };
  const guess = model && name ? model.classify(name) : { area: null, conf: 0 };
  if (guess.area && guess.conf >= MODEL_SURE) return { area: guess.area, sure: true, by: 'modelo' };
  if (key1 && hints.has(key1)) return { area: hints.get(key1), sure: true, by: 'casa' };
  if (guess.area) return { area: guess.area, sure: false, by: 'modelo' };
  return { area: 'cozinha', sure: false, by: 'padrao' };
}

export function guessArea(p) {
  return guessAreaInfo(p).area;
}
