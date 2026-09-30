// Nomes da comunidade (docs/PLANO_MELHORIAS.md, seção 6). Quando nenhuma fonte
// confiável conhece um código, o nome resolvido pela foto da embalagem (a IA
// leu, ou a pessoa escolheu uma sugestão da busca pela foto) fica guardado com
// a marca "comunidade". Quem ler o mesmo código depois vê esse nome e vota
// ("É este" / "Não é este"). Nunca vai foto, nunca vai nome digitado à mão.
// Fonte confiável que aparecer depois passa na frente (só é consultado quando
// ninguém achou).

const SCHEMA = [
  // Nomes sugeridos: código, nome, marca, tamanho, quando e quem (hash do aparelho).
  'CREATE TABLE IF NOT EXISTS nm (e TEXT NOT NULL, n TEXT NOT NULL, b TEXT, s TEXT, t INTEGER NOT NULL, a TEXT NOT NULL, PRIMARY KEY (e, n))',
  // Votos: um por aparelho por código (votar de novo troca o voto).
  'CREATE TABLE IF NOT EXISTS nv (e TEXT NOT NULL, a TEXT NOT NULL, n TEXT NOT NULL, v INTEGER NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (e, a))',
  'CREATE INDEX IF NOT EXISTS nm_a ON nm (a, t)',
];
const MAX_PER_DAY = 20;
let ready = null;

function ensure(db) {
  if (!ready) ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => { ready = null; throw err; });
  return ready;
}

const EAN = /^\d{8,14}$/;
const DEVICE = /^[a-z0-9]{6,40}$/;

// O aparelho não é guardado como veio: vira um resumo (sha-256) de 16 letras.
async function deviceHash(device) {
  const bytes = new TextEncoder().encode(`comunidade:${device}`);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Nome aceitável: letras, até 80, sem link nem número de telefone.
export function nameOk(name) {
  const n = String(name || '').trim();
  if (n.length < 3 || n.length > 80) return false;
  if (!/[a-zà-ú]/i.test(n)) return false;
  if (/https?:|www\.|\.com\b|@/i.test(n)) return false;
  if (/\d[\d\s().-]{7,}\d/.test(n)) return false;
  return true;
}

// Guarda a sugestão e conta como voto "é este" de quem sugeriu.
export async function suggestName(db, { ean, name, brand = '', size = '', device }) {
  if (!EAN.test(String(ean || '')) || !DEVICE.test(String(device || ''))) throw new Error('Pedido inválido');
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!nameOk(n)) throw new Error('Nome inválido');
  await ensure(db);
  const a = await deviceHash(device);
  const today = await db.prepare('SELECT COUNT(*) AS c FROM nm WHERE a = ? AND t > ?').bind(a, Date.now() - 86400000).first();
  if (today && today.c >= MAX_PER_DAY) throw new Error('Limite de sugestões de hoje');
  const t = Date.now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO nm (e, n, b, s, t, a) VALUES (?, ?, ?, ?, ?, ?)').bind(ean, n, String(brand).slice(0, 40), String(size).slice(0, 20), t, a),
    db.prepare('INSERT OR REPLACE INTO nv (e, a, n, v, t) VALUES (?, ?, ?, 1, ?)').bind(ean, a, n, t),
  ]);
  return true;
}

// Voto: 1 (é este) ou -1 (não é este) no nome mostrado.
export async function voteName(db, { ean, name, vote, device }) {
  if (!EAN.test(String(ean || '')) || !DEVICE.test(String(device || '')) || ![1, -1].includes(vote)) throw new Error('Pedido inválido');
  await ensure(db);
  const known = await db.prepare('SELECT 1 AS x FROM nm WHERE e = ? AND n = ?').bind(ean, String(name || '')).first();
  if (!known) throw new Error('Nome desconhecido');
  const a = await deviceHash(device);
  await db.prepare('INSERT OR REPLACE INTO nv (e, a, n, v, t) VALUES (?, ?, ?, ?, ?)').bind(ean, a, name, vote, Date.now()).run();
  return true;
}

// O nome da comunidade para um código: o de mais "é este" que "não é este",
// com as contagens. Confirmado com 2 aparelhos dizendo que é. Null se nenhum.
export async function bestName(db, ean) {
  if (!EAN.test(String(ean || ''))) return null;
  await ensure(db);
  const { results = [] } = await db.prepare(`
    SELECT nm.n AS n, nm.b AS b, nm.s AS s, nm.t AS t,
      COALESCE(SUM(CASE WHEN nv.v > 0 THEN 1 ELSE 0 END), 0) AS sim,
      COALESCE(SUM(CASE WHEN nv.v < 0 THEN 1 ELSE 0 END), 0) AS nao
    FROM nm LEFT JOIN nv ON nv.e = nm.e AND nv.n = nm.n
    WHERE nm.e = ? GROUP BY nm.n`).bind(ean).all();
  const ok = results.filter((r) => r.sim > r.nao).sort((x, y) => (y.sim - y.nao) - (x.sim - x.nao) || x.t - y.t);
  const r = ok[0];
  if (!r) return null;
  return { name: r.n, brand: r.b || '', size: r.s || '', ean, image: '', category: '', store: 'comunidade', comunidade: { sim: r.sim, nao: r.nao, confirmado: r.sim >= 2 } };
}

// POST /comunidade { ean, name, brand, size, aparelho } e
// POST /comunidade/voto { ean, name, voto, aparelho }.
export async function communityRoute(request, url, env) {
  const db = env && env.CATALOG;
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!db) return json({ error: 'Sem banco' }, 503);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'JSON inválido' }, 400); }
  try {
    if (url.pathname === '/comunidade/voto') {
      await voteName(db, { ean: body.ean, name: body.name, vote: body.voto, device: body.aparelho });
    } else {
      await suggestName(db, { ean: body.ean, name: body.name, brand: body.brand, size: body.size, device: body.aparelho });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, /Limite/.test(err.message) ? 429 : 400);
  }
}
