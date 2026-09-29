// Repassador do KeepInventory404 (Cloudflare Worker, plano grátis).
//
// As lojas online brasileiras (plataforma VTEX) têm busca pública de catálogo
// por código de barras e por nome, mas não liberam leitura direto do navegador
// (sem CORS). Este Worker faz a consulta e devolve o resultado para o app.
//
// Não é um proxy aberto: só consulta a lista fixa de lojas abaixo, só responde
// ao endereço do app e guarda as respostas em cache para consultar o mínimo.
//
// Rotas:
//   GET /health                 -> { ok: true }
//   GET /lookup?ean=789...      -> produto pelo código de barras (primeira loja que achar)
//   GET /search?q=moça 395      -> lista de produtos pelo nome
//   GET /diag                   -> testa cada loja a partir da Cloudflare (e mostra o catálogo)
//
// Catálogo próprio (catalog.js): um banco D1 que um robô agendado enche aos
// poucos com os produtos das lojas. O /lookup olha nele primeiro.
//   POST /identify              -> lê a embalagem numa foto (IA grátis da Cloudflare)
//                                  e devolve marca, produto, tamanho e um texto de busca

import { catalogGet, catalogLearn, catalogStep, catalogStats } from './catalog.js';

// Ordem medida em 100 produtos reais: as primeiras cobrem mais. O Zaffari vem
// antes porque é onde a casa compra (12 de 22 produtos da amostra de fotos).
export const LOOKUP_STORES = [
  'www.zaffari.com.br',
  'www.covabra.com.br',
  'www.drogariasaopaulo.com.br',
  'www.supernosso.com',
  'www.coopsupermercado.com.br',
  'www.mambo.com.br',
  'www.giassi.com.br',
  'www.bistek.com.br',
  'www.savegnago.com.br',
  'www.drogariaspacheco.com.br',
  'www.drogariavenancio.com.br',
  'www.drogal.com.br',
  'www.paguemenos.com.br',
  'www.epocacosmeticos.com.br',
  // Acrescentados em 09/2026: acharam 12 de 41 produtos que as outras não tinham
  // (marcas pequenas, cervejas artesanais, frios fracionados).
  'www.zonasul.com.br',
  'www.gbarbosa.com.br',
  'www.bretas.com.br',
  // Acrescentados em 10/2026. Em amostras de 25 produtos de cada catálogo, o
  // app não conhecia: Sam's 13, São João 10, Cobasi 9 (de 16), Atacadão 9
  // (e 17 de 44 marcas pequenas vendidas no Nordeste), Rissul 7, Super Muffato
  // e Prezunic 6, Lojas Rede 4, Comper 3, Carrefour 2. Extrafarma: 0, ficou fora.
  'www.atacadao.com.br',
  'www.samsclub.com.br',
  'www.saojoaofarmacias.com.br',
  'www.cobasi.com.br',
  'www.rissul.com.br',
  'www.supermuffato.com.br',
  'www.prezunic.com.br',
  // O site principal destes recusa o repassador; o endereço de bastidores da
  // VTEX (conta.vtexcommercestable.com.br) responde a mesma busca pública.
  'lojasrede.vtexcommercestable.com.br',
  'comper.vtexcommercestable.com.br',
  'carrefourbrfood.vtexcommercestable.com.br',
];

// Busca por nome: o Zaffari primeiro (as sugestões dele aparecem no topo),
// depois 3 supermercados e 1 farmácia (10 de 10 no teste), e os gaúchos.
export const SEARCH_STORES = [
  'www.zaffari.com.br',
  'www.covabra.com.br',
  'www.coopsupermercado.com.br',
  'www.savegnago.com.br',
  'www.drogariasaopaulo.com.br',
  // Gaúchos: marcas do RS e a farmácia (10/2026).
  'www.rissul.com.br',
  'www.saojoaofarmacias.com.br',
];

// Modelos de visão do Workers AI (cota grátis diária). O primeiro é o padrão;
// os outros só podem ser escolhidos para comparação (?model=).
export const VISION_MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];
const MAX_IMAGE_CHARS = 1_500_000; // ~1,1 MB de JPEG em base64

const UA = 'Mozilla/5.0 (compatible; KeepInventory404/1.0; inventario domestico pessoal)';
const STORE_TIMEOUT = 5000;
const DAY = 86400;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigin(origin, env);

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), allowed);
    const isIdentify = url.pathname === '/identify';
    if (request.method !== (isIdentify ? 'POST' : 'GET')) return withCors(json({ error: 'Método não permitido' }, 405), allowed);
    // Chamadas de navegador vindas de outro site são recusadas.
    if (origin && !allowed) return json({ error: 'Origem não autorizada' }, 403);

    try {
      switch (url.pathname) {
        case '/':
        case '/health':
          return withCors(json({ ok: true }), allowed);
        case '/lookup': {
          const ean = (url.searchParams.get('ean') || '').trim();
          if (!/^\d{8,14}$/.test(ean)) return withCors(json({ error: 'Código inválido' }, 400), allowed);
          return withCors(await cached(ctx, `lookup:${ean}`, 7 * DAY, () => lookup(ean, env, ctx)), allowed);
        }
        case '/search': {
          const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
          if (normalize(q).length < 2) return withCors(json({ error: 'Digite pelo menos 2 letras.' }, 400), allowed);
          return withCors(await cached(ctx, `search:${normalize(q)}`, DAY, () => search(q, env, ctx)), allowed);
        }
        case '/nfce': {
          // Nota fiscal do consumidor (NFC-e) pelo parâmetro "p" do QR Code.
          const p = (url.searchParams.get('p') || '').trim();
          const key = nfceKey(p);
          if (!key) return withCors(json({ error: 'Esse QR Code não é de nota fiscal. Leia o QR Code no fim do cupom.' }, 400), allowed);
          if (!key.startsWith('43')) return withCors(json({ error: 'Por enquanto o app lê só notas do Rio Grande do Sul.', uf: key.slice(0, 2) }, 422), allowed);
          return withCors(await cached(ctx, `nfce:${key}`, 30 * DAY, () => fetchNfce(p, key)), allowed);
        }
        case '/diag':
          return withCors(json(await diag(env)), allowed);
        case '/identify': {
          if (!env || !env.AI) return withCors(json({ error: 'IA não configurada' }, 503), allowed);
          const body = await request.json().catch(() => null);
          const image = body && typeof body.image === 'string' ? body.image : '';
          if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
            return withCors(json({ error: 'Envie uma foto JPEG, PNG ou WebP de até 1 MB' }, 400), allowed);
          }
          const model = VISION_MODELS.includes(url.searchParams.get('model')) ? url.searchParams.get('model') : VISION_MODELS[0];
          const read = await identify(env.AI, image, model);
          // Já devolve as sugestões das lojas, para o celular fazer uma chamada só.
          read.results = await searchCascade(read, (q) => cached(ctx, `search:${normalize(q)}`, DAY, () => search(q)).then((r) => r.json()));
          return withCors(json(read), allowed);
        }
        default:
          return withCors(json({ error: 'Rota não encontrada' }, 404), allowed);
      }
    } catch (err) {
      return withCors(json({ error: 'Falha no repassador', detail: String(err && err.message || err) }, 500), allowed);
    }
  },

  // Robô do catálogo (wrangler.toml, [triggers]): uma página de uma loja por vez.
  async scheduled(event, env, ctx) {
    if (env && env.CATALOG) ctx.waitUntil(catalogStep(env.CATALOG));
  },
};

// ---------- Consultas ----------

// Código de barras: primeiro as lojas (nome completo, foto e categoria). Se
// nenhuma conhece, os catálogos de código de barras (seção 5.4 do system design):
// CadastroProduto (página pública, 945 mil produtos) e, quando o Worker tem a
// chave, Cosmos (Bluesoft, 25 consultas grátis por dia) e Kodebar (50 por dia).
// Antes de tudo, o catálogo próprio; o que vem de fora entra nele.
export async function lookup(ean, env = {}, ctx = null) {
  const db = env.CATALOG;
  if (db) {
    const hit = await catalogGet(db, ean).catch(() => null);
    if (hit) return { found: true, product: { ...hit, size: sizeOf(hit.name) } };
  }
  const result = await lookupLive(ean, env);
  if (result.found && db && ctx) ctx.waitUntil(catalogLearn(db, result.product).catch(() => {}));
  return result;
}

async function lookupLive(ean, env) {
  const found = await lookupStores(ean);
  if (found.found) return found;
  const catalogs = [lookupCadastroProduto(ean)];
  if (env.COSMOS_TOKEN) catalogs.push(lookupCosmos(ean, env.COSMOS_TOKEN));
  if (env.KODEBAR_KEY) catalogs.push(lookupKodebar(ean, env.KODEBAR_KEY));
  try {
    return { found: true, product: await Promise.any(catalogs) };
  } catch {
    return { found: false };
  }
}

async function lookupStores(ean) {
  const tries = LOOKUP_STORES.map((host) =>
    storeJson(host, `/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`).then((data) => {
      const p = Array.isArray(data) && data[0];
      if (!p) throw new Error('vazio');
      return toProduct(p, host, ean);
    }));
  try {
    const product = await Promise.any(tries);
    // A loja da casa (a primeira da lista) tem preferência: se outra respondeu
    // antes, espera ela mais um pouco.
    if (product.store !== LOOKUP_STORES[0]) {
      const preferred = await Promise.race([tries[0].catch(() => null), new Promise((r) => setTimeout(() => r(null), 800))]);
      if (preferred) return { found: true, product: preferred };
    }
    return { found: true, product };
  } catch {
    return { found: false };
  }
}

export async function search(q, env = {}, ctx = null) {
  const tokens = tokensOf(q);
  const lists = await Promise.allSettled(SEARCH_STORES.map((host) =>
    storeJson(host, `/api/io/_v/api/intelligent-search/product_search/?${new URLSearchParams({ query: q, count: '8' })}`)
      .then((d) => (d && Array.isArray(d.products) ? d.products.map((p) => toProduct(p, host)) : []))));

  // Intercala os resultados das lojas (1º de cada, 2º de cada...) e remove repetidos.
  const perStore = lists.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const seen = new Set();
  const out = [];
  for (let i = 0; i < 8; i++) {
    for (const list of perStore) {
      const p = list[i];
      if (!p || !p.ean || seen.has(p.ean)) continue;
      // Só mostra o que contém as palavras digitadas (a farmácia devolve remédio para "feijão").
      if (!matches(p, tokens)) continue;
      seen.add(p.ean);
      out.push(p);
    }
  }
  // Tudo que as lojas devolveram (com código de barras) também entra no catálogo.
  if (env.CATALOG && ctx) ctx.waitUntil(catalogLearn(env.CATALOG, perStore.flat()).catch(() => {}));
  return { results: out.slice(0, 12) };
}

export async function diag(env = {}) {
  const probes = ['7891024134702', '7891000100103'];
  const rows = await Promise.all(LOOKUP_STORES.map(async (host) => {
    const t0 = Date.now();
    let hits = 0;
    let status = 'ok';
    for (const ean of probes) {
      try {
        const d = await storeJson(host, `/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`);
        if (Array.isArray(d) && d.length) hits++;
      } catch (err) {
        status = String(err.message || err);
      }
    }
    return { host, status, hits, ms: Date.now() - t0 };
  }));
  const s = await search('sanol lavanda').catch((err) => ({ error: String(err) }));
  return {
    stores: rows,
    storesOk: rows.filter((r) => r.hits > 0).length,
    searchSample: (s.results || []).slice(0, 3).map((p) => `${p.name} [${p.ean}]`),
    catalogo: env.CATALOG ? await catalogStats(env.CATALOG) : { ligado: false },
  };
}

const IDENTIFY_PROMPT = `Você vê a foto de uma embalagem de produto de supermercado ou farmácia do Brasil.
Leia o que está escrito na embalagem e responda SOMENTE um JSON, sem texto antes ou depois:
{"marca": "", "produto": "", "variante": "", "tamanho": "", "busca": ""}
- marca: a marca como está na embalagem (ex.: "Nescau", "Ypê", "Camil").
- produto: o tipo de produto em português (ex.: "achocolatado em pó", "detergente", "feijão carioca").
- variante: sabor, fragrância ou versão, se aparecer (ex.: "coco", "lavanda", "zero açúcar").
- tamanho: peso ou volume com unidade, se aparecer (ex.: "400g", "500ml", "1kg").
- busca: 2 a 5 palavras para achar esse produto numa loja online, começando pela marca (ex.: "nescau achocolatado 400g").
Se não conseguir ler algum campo, deixe "". Não invente marca.`;

export async function identify(ai, image, model) {
  const t0 = Date.now();
  const res = await ai.run(model, {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: IDENTIFY_PROMPT },
        { type: 'image_url', image_url: { url: image } },
      ],
    }],
    max_tokens: 200,
    temperature: 0.1,
  });
  const text = typeof res === 'string' ? res : (res && (res.response ?? (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content))) || '';
  const raw = typeof text === 'string' ? text : JSON.stringify(text);
  const parsed = parseJsonLoose(raw);
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const out = {
    brand: clean(parsed.marca),
    product: clean(parsed.produto),
    variant: clean(parsed.variante),
    size: clean(parsed.tamanho),
    query: clean(parsed.busca) || [parsed.marca, parsed.produto, parsed.tamanho].map(clean).filter(Boolean).join(' '),
    model,
    ms: Date.now() - t0,
  };
  if (res && res.usage) out.usage = res.usage;
  return out;
}

// Busca em cascata a partir do que a IA leu: da busca mais específica para a
// mais larga, até juntar 6 sugestões. Validado com 22 fotos reais: o produto
// certo aparece nas sugestões em 17 delas (docs/SYSTEM_DESIGN.md, seção 5.2).
export async function searchCascade(read, run = search) {
  const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const queries = [read.query, join(read.brand, read.product, read.variant), join(read.brand, read.product), read.brand];
  const tried = new Set();
  const out = [];
  for (const q of queries) {
    if (!q || normalize(q).length < 2 || tried.has(normalize(q))) continue;
    tried.add(normalize(q));
    const r = await run(q).catch(() => ({ results: [] }));
    for (const p of r.results || []) if (!out.some((x) => x.ean === p.ean)) out.push(p);
    if (out.length >= 6) break;
  }
  return out.slice(0, 12);
}

function parseJsonLoose(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return {};
  try { return JSON.parse(m[0]); } catch { return {}; }
}

// ---------- Catálogos de código de barras ----------
// Não têm foto boa nem categoria de loja: devolvem nome, marca e tamanho, que
// é o que o app precisa. Os nomes vêm em maiúsculas de cupom ("ARROZ TIPO 1
// CAMIL 1KG") e ficam com letra de frase.

async function fetchText(url, headers = {}, timeout = STORE_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function catalogProduct(name, brand, ean, source) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('sem nome');
  const niceBrand = titleCase(String(brand || '').trim());
  return { name: sentenceCase(clean, niceBrand), brand: niceBrand, size: sizeOf(clean), ean, image: '', category: '', store: source };
}

// Página pública do produto (dados em JSON-LD, schema.org/Product).
export async function lookupCadastroProduto(ean) {
  const html = await fetchText(`https://cadastroproduto.com.br/produto/${ean}`);
  const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .flat()
    .find((x) => x && x['@type'] === 'Product' && String(x.gtin13 || x.gtin || '') === ean);
  if (!block) throw new Error('não encontrado');
  return catalogProduct(decodeEntities(block.name), block.brand && decodeEntities(block.brand.name), ean, 'cadastroproduto.com.br');
}

export async function lookupCosmos(ean, token) {
  const data = JSON.parse(await fetchText(`https://api.cosmos.bluesoft.com.br/gtins/${ean}.json`, { 'X-Cosmos-Token': token, Accept: 'application/json' }));
  return catalogProduct(data.description, data.brand && data.brand.name, ean, 'cosmos.bluesoft.com.br');
}

export async function lookupKodebar(ean, key) {
  const data = JSON.parse(await fetchText(`https://kodebar.korvensistemas.com.br/gtin/lookup?gtin=${ean}`, { 'X-API-Key': key, Accept: 'application/json' }));
  return catalogProduct(data.nome, data.marca, ean, 'kodebar');
}

function decodeEntities(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// "ARROZ AGULHINHA TIPO 1 CAMIL 1KG" -> "Arroz agulhinha tipo 1 Camil 1kg": letra de
// frase, com a marca (quando veio) de volta com iniciais maiúsculas.
export function sentenceCase(s, brand = '') {
  if (s !== s.toUpperCase()) return s;
  let low = s.toLocaleLowerCase('pt-BR');
  low = low.charAt(0).toLocaleUpperCase('pt-BR') + low.slice(1);
  if (!brand) return low;
  const i = low.toLocaleLowerCase('pt-BR').indexOf(brand.toLocaleLowerCase('pt-BR'));
  return i < 0 ? low : low.slice(0, i) + brand + low.slice(i + brand.length);
}

function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLocaleLowerCase('pt-BR').replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('pt-BR'));
}

// ---------- Auxiliares ----------

async function storeJson(host, path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STORE_TIMEOUT);
  try {
    const res = await fetch(`https://${host}${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(err && err.name === 'AbortError' ? 'tempo esgotado' : (err.message || String(err)));
  } finally {
    clearTimeout(timer);
  }
}

export function toProduct(p, host, wantedEan) {
  const items = Array.isArray(p.items) ? p.items : [];
  const item = (wantedEan && items.find((it) => it.ean === wantedEan)) || items[0] || {};
  const image = item.images && item.images[0] && item.images[0].imageUrl;
  return {
    name: (p.productName || '').trim(),
    brand: (p.brand || '').trim(),
    size: sizeOf(p.productName || ''),
    ean: item.ean || wantedEan || '',
    image: image ? smallImage(image) : '',
    category: Array.isArray(p.categories) && p.categories[0] ? p.categories[0] : '',
    store: host,
  };
}

// Pede à loja a versão 200x200 da foto (bem mais leve no celular).
export function smallImage(url) {
  const https = url.replace(/^http:/, 'https:');
  return https.replace(/\/arquivos\/ids\/(\d+)(?:-\d+-\d+)?\//, '/arquivos/ids/$1-200-200/');
}

export function sizeOf(name) {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s?(kg|g|mg|ml|l|lt|litros?|un|unidades?)\b/i);
  if (!m) return '';
  const unit = m[2].toLowerCase().replace(/^lt$|^litros?$/, 'l').replace(/^unidades?$/, 'un');
  return `${m[1].replace('.', ',')} ${unit}`;
}

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokensOf(q) {
  return normalize(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

// Cada palavra digitada precisa ser o começo de uma palavra do produto
// ("renata" acha "Macarrão Renata", mas não o colírio "Drenatan").
function matches(p, tokens) {
  const hay = ` ${normalize(`${p.name} ${p.brand}`).replace(/[^a-z0-9]+/g, ' ')}`;
  return tokens.every((t) => hay.includes(` ${t}`));
}

async function cached(ctx, key, ttl, compute) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://cache.keepinventory/${encodeURIComponent(key)}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, hit);
  }
  const body = await compute();
  // Não guarda "não encontrado" por muito tempo: a loja pode cadastrar depois.
  // Erro passageiro (SEFAZ fora do ar, nota ainda não autorizada) não fica guardado.
  const maxAge = body && body.found === false ? (body.error ? 0 : DAY) : ttl;
  const res = json(body, 200, { 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' });
  if (maxAge && cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

function allowedOrigin(origin, env) {
  const list = String((env && env.ALLOWED_ORIGINS) || 'https://gadrs377.github.io').split(',').map((s) => s.trim());
  return origin && list.includes(origin) ? origin : '';
}

function withCors(res, origin) {
  const h = new Headers(res.headers);
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Vary', 'Origin');
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return new Response(res.body, { status: res.status, headers: h });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

// ---------- NFC-e do RS (portal da SVRS) ----------
// O QR Code do cupom abre dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=CHAVE|versão|ambiente...
// A página lista cada item com descrição, "Código" (do mercado; às vezes é o
// código de barras), quantidade, unidade e valores. Nada é guardado aqui além
// do cache da resposta, que é pública e não muda.

const NFCE_URL = 'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=';

export function nfceKey(p) {
  const m = /^(\d{44})(\|[\w.:-]*){1,10}$/.exec(String(p || ''));
  return m ? m[1] : '';
}

async function fetchNfce(p, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(NFCE_URL + p.split('|').map(encodeURIComponent).join('%7C'), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepInventory404/1.0)', Accept: 'text/html' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { found: false, error: `A SEFAZ respondeu ${res.status}` };
    const html = await res.text();
    const nota = parseNfce(html);
    if (!nota.items.length) return { found: false, error: 'A SEFAZ não mostrou itens para esta nota. Ela pode ainda não ter sido autorizada.' };
    if (nota.key && nota.key !== key) return { found: false, error: 'A SEFAZ devolveu outra nota. Leia o QR Code de novo.' };
    return { found: true, ...nota, key };
  } catch (err) {
    return { found: false, error: 'A SEFAZ não respondeu. Tente de novo em instantes.', detail: String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

const decodeHtml = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\u00AD/g, '').replace(/\s+/g, ' ').trim();
const brNumber = (s) => {
  const t = String(s || '').replace(/[^\d.,]/g, '');
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const grab = (re, s) => { const m = re.exec(s); return m ? decodeHtml(m[1]) : ''; };

export function parseNfce(html) {
  const items = [];
  const rows = String(html).split(/<tr id="Item \+ \d+">/).slice(1);
  for (const row of rows) {
    const name = grab(/<span class="txtTit">([^<]*)<\/span>/, row);
    if (!name) continue;
    items.push({
      name,
      code: grab(/\(C[oó]digo:\s*([^)]*?)\s*\)/i, row).replace(/\s/g, ''),
      qty: brNumber(grab(/Qtde\.:<\/strong>\s*([\d.,]+)/, row)),
      unit: grab(/UN:\s*<\/strong>\s*([^<]*)/, row).toUpperCase(),
      unitPrice: brNumber(grab(/Vl\. Unit\.:<\/strong>\s*([\d.,]+)/, row)),
      total: brNumber(grab(/<span class="valor">([\d.,]+)/, row)),
    });
  }
  const issued = grab(/Emiss[aã]o:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/, html);
  let issuedAt = '';
  if (issued) {
    const [d, t] = issued.split(' ');
    const [dd, mm, yyyy] = d.split('/');
    issuedAt = `${yyyy}-${mm}-${dd}T${t}-03:00`;
  }
  return {
    store: {
      name: grab(/id="u20"[^>]*>([^<]*)</, html),
      cnpj: grab(/CNPJ:\s*([\d./-]+)/, html).replace(/\D/g, ''),
    },
    issuedAt,
    total: brNumber(grab(/Valor a pagar R\$:<\/label>\s*<span[^>]*>([\d.,]+)/, html)),
    discount: brNumber(grab(/Descontos R\$:<\/label>\s*<span[^>]*>([\d.,]+)/, html)),
    key: grab(/class="chave">([\d\s]+)</, html).replace(/\s/g, ''),
    items,
  };
}
