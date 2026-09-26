// Ambientes da casa e a regra que sugere o ambiente de um produto.
// Sem IA: usa a categoria da loja (ex.: "/Limpeza/Desinfetante/") e, sem ela,
// palavras do nome. A pessoa sempre pode trocar na página do produto.
// Remédios são um ambiente à parte: têm aba própria e não aparecem no Armário.

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

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Itens que as lojas classificam de um jeito, mas que em casa ficam em outro
// lugar (papel higiênico aparece em "Higiene e beleza" nas lojas).
const OVERRIDES = [
  [/\b(papel higienico|saco (plastico )?(de |para )?lixo|lixo|toalha de papel|papel toalha|guardanapo|inseticida|repelente)\b/, 'limpeza'],
  [/\b(protetor (labial|solar)|balm labial)\b/, 'beleza'],
];

// Segmentos da categoria das lojas. Vale o primeiro segmento reconhecido.
// Remédio em qualquer nível da categoria (as farmácias usam "/Farmácia/Medicamentos/...").
const MED_CATEGORY = /^(medicamentos?.*|remedios|genericos|similares|dor e febre|gripe e resfriado|antialergicos)$/;

const CATEGORY_RULES = [
  [/^(limpeza|lavanderia|utilidades domesticas|descartaveis|casa e limpeza|produtos de limpeza|cuidado e limpeza|limpeza da casa)$/, 'limpeza'],
  [/^(perfumaria.*|higiene.*|beleza.*|.*cuidado pessoal|dermocosmeticos|cabelos?|maquiagem|saude e beleza|mamae e bebe|infantil|farmacia|aparador de pelos|barbeadores?)$/, 'beleza'],
  [/^(mercearia.*|bebidas.*|hortifruti|frios.*|laticinios|padaria|carnes.*|acougue|congelados|matinais|doces.*|biscoitos|alimentos|bomboniere|pet.*|cafe da manha)$/, 'cozinha'],
];

// Palavras do nome, quando a categoria não resolve. "sabonete" é beleza, "sabão" é limpeza.
const NAME_RULES = [
  [/\b(shampoo|xampu|condicionador|sabonete|desodorante|antitranspirante|creme dental|pasta de dente|escova dental|escova de dente|fio dental|enxaguante|anti-?s?septico|antisseptico bucal|barbeador|prestobarba|aparelho de barbear|umedecid[ao]s?|capilar|micelar|demaquilante|creme de pentear|filtro solar|hidratante|locao|creme (facial|de rosto|corporal|para pentear)|serum|maquiagem|base liquida|batom|rimel|esmalte|perfume|colonia|barbear|lamina|absorvente|cotonete|haste flexivel|algodao|fralda|lenco umedecido|talco|tintura|coloracao)\b/, 'beleza'],
  [/\b(detergente|lava[ -]?loucas?|lava[ -]?roupas?|sabao|amaciante|desinfetante|agua sanitaria|alvejante|cloro|multiuso|limpa[ -]?vidros?|limpador|lustra[ -]?moveis|tira[ -]?manchas|esponja|palha de aco|odorizador|purificador de ar|cera (liquida|para pisos?)|luva (de limpeza|para louca|esfrebom)|luva bettanin|pano (de chao|microfibra|esfregao|multiuso)|esfregao|rodo|vassoura|pedra sanitaria|veja|pinho sol|sanol|omo|comfort|downy|harpic|bombril)\b/, 'limpeza'],
];

export function guessArea(p) {
  // Achado na base da Anvisa: é remédio.
  if (p && p.med) return 'remedios';
  const text = norm(`${(p && p.name) || ''} ${(p && p.brand) || ''}`).replace(/\bsem perfume\b/g, '');
  for (const [re, area] of OVERRIDES) if (re.test(text)) return area;
  const segments = norm(p && p.category).split('/').map((x) => x.trim()).filter(Boolean);
  if (segments.some((seg) => MED_CATEGORY.test(seg))) return 'remedios';
  for (const seg of segments) {
    for (const [re, area] of CATEGORY_RULES) if (re.test(seg)) return area;
  }
  for (const [re, area] of NAME_RULES) if (re.test(text)) return area;
  return 'cozinha';
}
