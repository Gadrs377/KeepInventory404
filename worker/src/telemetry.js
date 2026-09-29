// Telemetria: o que o app e o repassador registram sozinhos, para medir o uso
// de verdade (docs/SYSTEM_DESIGN.md, seção 5.7). Fica no D1, 90 dias.
// Cada evento: { id, k (tipo), t (quando, ms), s (sessão), v (versão), d (dados) }.
// Mesmo id substitui o anterior (a visita da validade é atualizada ao salvar).

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS tel (id TEXT PRIMARY KEY, t INTEGER NOT NULL, k TEXT NOT NULL, s TEXT, v TEXT, d TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS tel_t ON tel (t)',
];
const MAX_BATCH = 50;
const MAX_EVENT = 16000;
const KIND = /^[a-z][a-z0-9-]{1,30}$/;
let ready = null;

function ensure(db) {
  if (!ready) ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => { ready = null; throw err; });
  return ready;
}

const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Resolve com quantos eventos foram guardados (os inválidos ficam de fora).
export async function telSave(db, events) {
  const now = Date.now();
  const rows = [];
  for (const e of [].concat(events || []).slice(0, MAX_BATCH)) {
    if (!e || !KIND.test(String(e.k || ''))) continue;
    const d = JSON.stringify(e.d ?? {});
    if (d.length > MAX_EVENT) continue;
    const t = Number.isFinite(e.t) && Math.abs(e.t - now) < 30 * 86400000 ? Math.round(e.t) : now;
    rows.push([String(e.id || rid()).slice(0, 40), t, e.k, String(e.s || '').slice(0, 20), String(e.v || '').slice(0, 20), d]);
  }
  if (!rows.length) return 0;
  await ensure(db);
  await db.batch(rows.map((r) => db.prepare('INSERT OR REPLACE INTO tel (id, t, k, s, v, d) VALUES (?, ?, ?, ?, ?, ?)').bind(...r)));
  return rows.length;
}

// Os mais recentes primeiro. `since`: ms; `kind`: um tipo só.
export async function telRead(db, { since = 0, kind = '', limit = 500 } = {}) {
  await ensure(db);
  const where = ['t >= ?'];
  const args = [since];
  if (kind) { where.push('k = ?'); args.push(kind); }
  const { results } = await db.prepare(`SELECT id, t, k, s, v, d FROM tel WHERE ${where.join(' AND ')} ORDER BY t DESC LIMIT ?`)
    .bind(...args, Math.min(Math.max(1, limit), 2000)).all();
  return results.map((r) => ({ ...r, d: JSON.parse(r.d) }));
}

export async function telCount(db) {
  await ensure(db);
  const { results } = await db.prepare('SELECT k, count(*) AS n FROM tel GROUP BY k ORDER BY n DESC').all();
  return Object.fromEntries(results.map((r) => [r.k, r.n]));
}

export async function telPrune(db, days = 90) {
  await ensure(db);
  await db.prepare('DELETE FROM tel WHERE t < ?').bind(Date.now() - days * 86400000).run();
}

// Chave de leitura: o repositório é público, então nada de senha no código.
// Deriva da chave da Tavily, que só existe no repassador e com quem a tem.
export async function telKey(env) {
  if (!env || !env.TAVILY_API_KEY) return '';
  const bytes = new TextEncoder().encode(`${env.TAVILY_API_KEY}:telemetria`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
