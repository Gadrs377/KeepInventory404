// Cópia automática do armário (docs/SYSTEM_DESIGN.md, seção 5.8). O app manda
// o backup comprimido (gzip) com a chave da casa, um texto aleatório que só os
// celulares conhecem. Ficam as 3 cópias mais recentes de cada chave.
// Ainda sem cifrar: obrigatório antes de abrir o app a outras pessoas
// (docs/PLANO_MELHORIAS.md, seção 15).

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS bk (k TEXT NOT NULL, t INTEGER NOT NULL, b BLOB NOT NULL, PRIMARY KEY (k, t))',
];
export const BACKUP_MAX = 1_500_000;
const KEEP = 3;
const KEY = /^[a-z0-9]{24,48}$/;
let ready = null;

function ensure(db) {
  if (!ready) ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => { ready = null; throw err; });
  return ready;
}

export const backupKeyOk = (key) => KEY.test(String(key || ''));

// Guarda e apaga as cópias mais antigas que as 3 últimas. Resolve com a hora (ms).
export async function backupSave(db, key, bytes) {
  if (!backupKeyOk(key)) throw new Error('Chave inválida');
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!b.byteLength || b.byteLength > BACKUP_MAX) throw new Error('Cópia vazia ou grande demais');
  await ensure(db);
  const t = Date.now();
  await db.batch([
    db.prepare('INSERT OR REPLACE INTO bk (k, t, b) VALUES (?, ?, ?)').bind(key, t, b),
    db.prepare(`DELETE FROM bk WHERE k = ? AND t NOT IN (SELECT t FROM bk WHERE k = ? ORDER BY t DESC LIMIT ${KEEP})`).bind(key, key),
  ]);
  return t;
}

// A cópia mais recente: { t, bytes } ou null.
export async function backupLatest(db, key) {
  if (!backupKeyOk(key)) return null;
  await ensure(db);
  const row = await db.prepare('SELECT t, b FROM bk WHERE k = ? ORDER BY t DESC LIMIT 1').bind(key).first();
  if (!row) return null;
  return { t: row.t, bytes: row.b instanceof Uint8Array ? row.b : new Uint8Array(row.b) };
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// POST ?chave=… (corpo: os bytes da cópia) guarda; GET ?chave=… devolve a última.
export async function backupRoute(request, url, env) {
  const db = env && env.CATALOG;
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!db) return json({ error: 'Sem banco' }, 503);
  const key = url.searchParams.get('chave') || '';
  if (!backupKeyOk(key)) return json({ error: 'Chave inválida' }, 400);
  if (request.method === 'POST') {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > BACKUP_MAX) return json({ error: 'Cópia vazia ou grande demais' }, 413);
    return json({ ok: true, t: await backupSave(db, key, bytes) });
  }
  const last = await backupLatest(db, key);
  if (!last) return json({ error: 'Nenhuma cópia com esse código' }, 404);
  return json({ t: last.t, dados: toBase64(last.bytes) });
}
