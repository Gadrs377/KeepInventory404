// Catálogo próprio de produtos brasileiros, num banco D1 (SQLite) da Cloudflare,
// feito para gastar o mínimo de bytes por produto (plano grátis: 5 GB, 5 milhões
// de linhas lidas e 100 mil escritas por dia).
//
// Um robô agendado (cron, 1 vez por minuto) copia aos poucos os catálogos das
// lojas VTEX, categoria por categoria; o /lookup consulta o catálogo antes de
// perguntar às lojas, e o que as lojas acham ao vivo também entra nele.
//
// Como fica pequeno (medido em test/catalog.mjs):
// - p.e: o código de barras como NÚMERO e chave da tabela (INTEGER PRIMARY KEY
//   é o próprio rowid do SQLite): sem índice separado, 1 a 8 bytes.
// - p.n: o nome e a categoria como números de palavras de um dicionário (w),
//   em varint (1 byte até 127, 2 até 16 mil, 3 até 2 milhões): "Detergente
//   Líquido Ypê Neutro 500ml" são 5 números, uns 8 bytes em vez de 35. Depois
//   do nome, um 0 e mais dois números: a categoria inteira ("/Limpeza/Cuidados
//   com a cozinha/Lava louça/") e a marca, cada uma uma "palavra" só.
// - p.i: loja e foto num número só: número da imagem × 64 + loja. O endereço
//   da foto é remontado: https://{conta}.vteximg.com.br/arquivos/ids/{n}-320-320
// - O tamanho não é guardado: sai do nome.

// Lojas do catálogo: [endereço da busca, conta das imagens]. SÓ ACRESCENTAR NO
// FIM: a posição de cada uma está gravada nos produtos (p.i % 64).
export const CATALOG_STORES = [
  ['www.zaffari.com.br', 'zaffari'],
  ['www.covabra.com.br', 'covabra'],
  ['www.drogariasaopaulo.com.br', 'drogariasp'],
  ['www.supernosso.com', 'supernossoio'],
  ['www.coopsupermercado.com.br', 'coopsp'],
  ['www.mambo.com.br', 'mambodelivery'],
  ['www.giassi.com.br', 'giassi'],
  ['www.bistek.com.br', 'bistek'],
  ['www.savegnago.com.br', 'savegnagoio'],
  ['www.drogariaspacheco.com.br', 'drogariaspacheco'],
  ['www.drogariavenancio.com.br', 'drogariavenancio'],
  ['www.drogal.com.br', 'drogal'],
  ['www.paguemenos.com.br', 'paguemenos'],
  ['www.epocacosmeticos.com.br', 'epocacosmeticos'],
  ['www.zonasul.com.br', 'zonasul'],
  ['www.gbarbosa.com.br', 'gbarbosa'],
  ['www.bretas.com.br', 'bretas'],
  ['www.atacadao.com.br', 'atacadaobr'],
  ['www.samsclub.com.br', 'samsclub'],
  ['www.saojoaofarmacias.com.br', 'sjdigital'],
  ['www.cobasi.com.br', 'cobasi'],
  ['www.rissul.com.br', 'superrissul'],
  ['www.supermuffato.com.br', 'muffatosupermercados'],
  ['www.prezunic.com.br', 'prezunic'],
  ['lojasrede.vtexcommercestable.com.br', 'lojasrede'],
  ['comper.vtexcommercestable.com.br', 'comper'],
  ['carrefourbrfood.vtexcommercestable.com.br', 'carrefourbr'],
];
const NO_STORE = 63; // produto que veio de catálogo de código de barras (sem loja nem foto)
const STORE_OF = new Map(CATALOG_STORES.map(([host], i) => [host, i]));

// Por rodada do robô: uma página pequena. Cada produto vem da loja com ~13 KB
// de JSON, e o plano grátis dá ~10 ms de CPU por execução.
export const PAGE = 20;
const MAX_FROM = 2500; // a busca da VTEX não pagina além disso
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS p (e INTEGER PRIMARY KEY, n BLOB NOT NULL, i INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS w (id INTEGER PRIMARY KEY, t TEXT NOT NULL UNIQUE)',
  'CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  // Foto reduzida (wsrv.nl) do que veio da web, que não é de loja.
  'CREATE TABLE IF NOT EXISTS f (e INTEGER PRIMARY KEY, u TEXT NOT NULL)',
];
const MAX_PARAMS = 99; // o D1 aceita até 100 parâmetros por consulta

// ---------- Codificação ----------

export function varints(numbers) {
  const out = [];
  for (let n of numbers) {
    do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n);
  }
  return new Uint8Array(out);
}

export function unvarints(bytes) {
  const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes instanceof ArrayBuffer ? bytes : Array.from(bytes || []));
  const out = [];
  let n = 0; let mul = 1;
  for (const b of list) {
    n += (b & 0x7f) * mul;
    if (b & 0x80) { mul *= 128; } else { out.push(n); n = 0; mul = 1; }
  }
  return out;
}

// Nome arrumado: espaços simples; TUDO EM MAIÚSCULAS vira Título.
export function tidyName(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (t !== t.toUpperCase()) return t;
  return t.toLocaleLowerCase('pt-BR').replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('pt-BR'));
}

export const wordsOf = (name) => tidyName(name).split(' ').filter(Boolean);

// Código de barras como número: GTIN-8/12/13/14 com dígito verificador certo.
// Zeros à esquerda não mudam o produto (o UPC 047400179240 é o EAN 0047400179240).
export function gtinNumber(code) {
  const s = String(code || '').trim();
  if (!/^\d{8,14}$/.test(s)) return null;
  const d = s.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== check) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export const imageIdOf = (url) => { const m = /\/arquivos\/ids\/(\d+)/.exec(String(url || '')); return m ? Number(m[1]) : 0; };
export const packImage = (store, imageId) => (imageId || 0) * 64 + store;
export function imageUrlOf(i) {
  const store = i % 64; const id = Math.floor(i / 64);
  const s = CATALOG_STORES[store];
  return s && id ? `https://${s[1]}.vteximg.com.br/arquivos/ids/${id}-320-320` : '';
}

// Produto da VTEX -> linhas do catálogo (uma por item com código de barras).
export function rowsFromVtex(p, host) {
  const store = STORE_OF.has(host) ? STORE_OF.get(host) : NO_STORE;
  const items = Array.isArray(p.items) ? p.items : [];
  const base = tidyName(p.productName);
  const category = Array.isArray(p.categories) && p.categories[0] ? String(p.categories[0]).trim() : '';
  const out = [];
  for (const it of items) {
    const e = gtinNumber(it.ean);
    if (!e || !base) continue;
    // Produto com variações (sabores, tamanhos): o nome da variação completa o nome.
    const extra = items.length > 1 && it.name && !base.toLowerCase().includes(String(it.name).toLowerCase()) ? ` ${it.name}` : '';
    const image = it.images && it.images[0] && it.images[0].imageUrl;
    out.push({ e, name: tidyName(base + extra), category, brand: String(p.brand || '').trim(), i: packImage(store, store === NO_STORE ? 0 : imageIdOf(image)) });
  }
  return out;
}

// ---------- Banco ----------

const chunks = (list, size) => { const out = []; for (let k = 0; k < list.length; k += size) out.push(list.slice(k, k + size)); return out; };

export async function ensureSchema(db) {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
}

async function getState(db, key, fallback) {
  const row = await db.prepare('SELECT v FROM c WHERE k = ?').bind(key).first();
  return row ? JSON.parse(row.v) : fallback;
}
const setState = (db, key, value) => db.prepare('INSERT INTO c (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify(value));

// Palavra -> número, criando as que faltam.
async function wordIds(db, words) {
  const ids = new Map();
  const unique = [...new Set(words)];
  for (const part of chunks(unique, MAX_PARAMS)) {
    const { results } = await db.prepare(`SELECT id, t FROM w WHERE t IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) ids.set(r.t, r.id);
  }
  const missing = unique.filter((t) => !ids.has(t));
  for (const part of chunks(missing, MAX_PARAMS)) {
    const { results } = await db.prepare(`INSERT INTO w (t) VALUES ${part.map(() => '(?)').join(',')} ON CONFLICT(t) DO NOTHING RETURNING id, t`).bind(...part).all();
    for (const r of results) ids.set(r.t, r.id);
    // Outra execução criou alguma ao mesmo tempo: busca de novo.
    const still = part.filter((t) => !ids.has(t));
    if (still.length) {
      const again = await db.prepare(`SELECT id, t FROM w WHERE t IN (${still.map(() => '?').join(',')})`).bind(...still).all();
      for (const r of again.results) ids.set(r.t, r.id);
    }
  }
  return ids;
}

// Grava as linhas novas (as que já existem ficam como estão). Devolve quantas entraram.
export async function saveRows(db, rows) {
  const byE = new Map();
  for (const r of rows) if (!byE.has(r.e)) byE.set(r.e, r);
  if (!byE.size) return 0;
  const existing = new Set();
  for (const part of chunks([...byE.keys()], MAX_PARAMS)) {
    const { results } = await db.prepare(`SELECT e FROM p WHERE e IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    for (const r of results) existing.add(Number(r.e));
  }
  const fresh = [...byE.values()].filter((r) => !existing.has(r.e));
  if (!fresh.length) return 0;
  const ids = await wordIds(db, fresh.flatMap((r) => [...wordsOf(r.name), r.category, r.brand].filter(Boolean)));
  const values = [];
  for (const r of fresh) {
    const n = wordsOf(r.name).map((t) => ids.get(t));
    if (!n.length || n.some((id) => !id)) continue; // palavra que não entrou no dicionário
    const cat = (r.category && ids.get(r.category)) || 0;
    const brand = (r.brand && ids.get(r.brand)) || 0;
    if (brand) n.push(0, cat, brand);
    else if (cat) n.push(0, cat);
    values.push([r.e, varints(n).buffer, r.i]);
  }
  for (const part of chunks(values, Math.floor(MAX_PARAMS / 3))) {
    await db.prepare(`INSERT INTO p (e, n, i) VALUES ${part.map(() => '(?, ?, ?)').join(',')} ON CONFLICT(e) DO NOTHING`).bind(...part.flat()).run();
  }
  return values.length;
}

// Produto pelo código de barras, no formato do /lookup; null se não está.
export async function catalogGet(db, code) {
  const e = gtinNumber(code);
  if (!e) return null;
  const row = await db.prepare('SELECT n, i FROM p WHERE e = ?').bind(e).first();
  if (!row) return null;
  const nums = unvarints(row.n);
  const cut = nums.indexOf(0);
  const nameIds = cut < 0 ? nums : nums.slice(0, cut);
  const catId = cut < 0 ? 0 : nums[cut + 1] || 0;
  const brandId = cut < 0 ? 0 : nums[cut + 2] || 0;
  const want = [...new Set([...nameIds, catId, brandId].filter(Boolean))];
  const { results } = await db.prepare(`SELECT id, t FROM w WHERE id IN (${want.map(() => '?').join(',')})`).bind(...want).all();
  const text = new Map(results.map((r) => [r.id, r.t]));
  const i = Number(row.i);
  const store = CATALOG_STORES[i % 64];
  let image = imageUrlOf(i);
  if (!image && i % 64 === NO_STORE) {
    const f = await db.prepare('SELECT u FROM f WHERE e = ?').bind(e).first().catch(() => null);
    image = f ? f.u : '';
  }
  return {
    name: nameIds.map((id) => text.get(id) || '').join(' ').trim(),
    brand: brandId ? text.get(brandId) || '' : '',
    ean: String(code).trim(),
    image,
    category: catId ? text.get(catId) || '' : '',
    store: store ? store[0] : 'catalogo',
    source: 'catalogo',
  };
}

// Produtos achados ao vivo (lojas, catálogos de código de barras) entram no catálogo.
export async function catalogLearn(db, products) {
  const rows = [];
  for (const product of [].concat(products || [])) {
    const e = gtinNumber(product && product.ean);
    if (!e || !product.name) continue;
    const store = STORE_OF.has(product.store) ? STORE_OF.get(product.store) : NO_STORE;
    rows.push({ e, name: product.name, category: product.category || '', brand: String(product.brand || '').trim(), i: packImage(store, store === NO_STORE ? 0 : imageIdOf(product.image)) });
  }
  if (!rows.length) return 0;
  await ensureSchema(db);
  const saved = await saveRows(db, rows);
  const photos = [].concat(products || []).filter((p) => p && gtinNumber(p.ean) && !STORE_OF.has(p.store) && /^https:\/\/wsrv\.nl\//.test(p.image || ''));
  if (photos.length) {
    await db.batch(photos.map((p) => db.prepare('INSERT INTO f (e, u) VALUES (?, ?) ON CONFLICT(e) DO UPDATE SET u = excluded.u').bind(gtinNumber(p.ean), p.image)));
  }
  return saved;
}

// ---------- O robô ----------

async function storeGet(host, path, fetchImpl) {
  const res = await fetchImpl(`https://${host}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepInventory404/1.0; inventario domestico pessoal)', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Folhas da árvore de categorias: "/departamento/categoria/".
export function leavesOf(tree) {
  const out = [];
  for (const d of tree || []) {
    const kids = d.children || [];
    if (!kids.length) out.push(`/${d.id}/`);
    for (const c of kids) out.push(`/${d.id}/${c.id}/`);
  }
  return out;
}

// Uma rodada: uma página de uma categoria de uma loja. Guarda onde parou.
export async function catalogStep(db, { fetchImpl = fetch, stores = CATALOG_STORES } = {}) {
  await ensureSchema(db);
  const st = await getState(db, 'cur', { s: 0, k: 0, f: 0, t: 0 });
  const stats = await getState(db, 'stats', { produtos: 0, rodadas: 0, erros: 0 });
  st.s %= stores.length;
  let leaves = await getState(db, `folhas:${st.s}`, null);
  const nextLeaf = () => {
    if (leaves && st.k + 1 < leaves.length) Object.assign(st, { k: st.k + 1, f: 0, t: 0 });
    else Object.assign(st, { s: (st.s + 1) % stores.length, k: 0, f: 0, t: 0 });
  };
  // Três tentativas sem sucesso no mesmo lugar (loja fora do ar, página que
  // estoura o tempo do Worker): pula a categoria, ou a loja se nem a árvore veio.
  if ((st.t || 0) >= 3) {
    nextLeaf();
    leaves = await getState(db, `folhas:${st.s}`, null);
  }
  const [host] = stores[st.s];
  // A tentativa é anotada antes: se a execução morrer no meio, a próxima sabe.
  st.t = (st.t || 0) + 1;
  await setState(db, 'cur', st).run();
  const writes = [];
  let added = 0;
  try {
    if (!leaves) {
      leaves = leavesOf(await storeGet(host, '/api/catalog_system/pub/category/tree/2', fetchImpl));
      writes.push(setState(db, `folhas:${st.s}`, leaves));
    }
    const leaf = leaves[st.k];
    let page = [];
    if (leaf) page = await storeGet(host, `/api/catalog_system/pub/products/search?fq=C:${leaf}&_from=${st.f}&_to=${st.f + PAGE - 1}`, fetchImpl);
    const rows = (Array.isArray(page) ? page : []).flatMap((p) => rowsFromVtex(p, host));
    added = await saveRows(db, rows);
    // Próxima página; categoria acabou (ou chegou ao limite): próxima categoria; loja acabou: próxima loja.
    if (Array.isArray(page) && page.length === PAGE && st.f + PAGE < MAX_FROM) Object.assign(st, { f: st.f + PAGE, t: 0 });
    else nextLeaf();
  } catch (err) {
    stats.erros += 1;
    stats.ultimoErro = `${host}: ${String(err && err.message || err).slice(0, 80)}`;
  }
  stats.produtos += added;
  stats.rodadas += 1;
  stats.loja = host;
  writes.push(setState(db, 'cur', st), setState(db, 'stats', stats));
  await db.batch(writes);
  return { host, added, state: st };
}

export async function catalogStats(db) {
  try { return { ligado: true, ...(await getState(db, 'stats', { produtos: 0, rodadas: 0, erros: 0 })), posicao: await getState(db, 'cur', null) }; } catch (err) { return { ligado: true, erro: String(err && err.message || err) }; }
}
