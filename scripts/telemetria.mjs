// Lê a telemetria guardada no repassador (worker/src/telemetry.js).
//
//   node scripts/telemetria.mjs                    últimos 7 dias, resumo + eventos
//   node scripts/telemetria.mjs --desde 2026-09-29 --tipo codigo --limite 200
//   node scripts/telemetria.mjs --json             tudo em JSON
//
// A chave de leitura vem da chave da Tavily (TAVILY_API_KEY ou ~/.tavily/config.json),
// a mesma guardada no repassador. Precisa de Node 22 e rede.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const API = 'https://keepinventory-api.gabriel-gadrs377.workers.dev';
const args = process.argv.slice(2);
const opt = (name, def = '') => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def);

let tavily = process.env.TAVILY_API_KEY || '';
if (!tavily) { try { tavily = JSON.parse(readFileSync(`${homedir()}/.tavily/config.json`, 'utf8')).api_key; } catch { /* sem chave */ } }
if (!tavily) { console.error('Sem a chave da Tavily (TAVILY_API_KEY).'); process.exit(1); }
const key = createHash('sha256').update(`${tavily}:telemetria`).digest('hex').slice(0, 32);

const qs = new URLSearchParams({ chave: key, limite: opt('limite', '500') });
if (opt('desde')) qs.set('desde', opt('desde'));
if (opt('tipo')) qs.set('tipo', opt('tipo'));
const res = await fetch(`${API}/telemetria?${qs}`, { headers: { 'User-Agent': 'KeepInventory404-telemetria' } });
const data = await res.json();
if (!res.ok) { console.error(res.status, data); process.exit(1); }
if (args.includes('--json')) { console.log(JSON.stringify(data, null, 1)); process.exit(0); }

console.log('Total guardado por tipo:', data.total);
const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
for (const e of data.eventos.slice().reverse()) {
  console.log(`${fmt.format(new Date(e.t))}  ${e.v || ''}  ${e.s || ''}  ${e.k.padEnd(12)} ${JSON.stringify(e.d).slice(0, 300)}`);
}
