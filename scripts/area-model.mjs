// Treina o modelo de ambiente pelo nome (js/areaModel.js) com os produtos das
// lojas e grava data/area-model.json.
//
//   node scripts/area-model.mjs                    baixa das lojas, treina, grava
//   node scripts/area-model.mjs --dados x.json     usa (ou guarda) a coleta em x.json
//   node scripts/area-model.mjs --avaliar          treina só com as lojas de treino e
//                                                  mede nas lojas de teste (nada é gravado)
//
// Gabarito: o departamento da loja (Mercearia, Bebidas... = cozinha; Limpeza =
// limpeza; Higiene e Beleza = beleza; Medicamentos = remédios), com as exceções
// da casa (papel higiênico e saco de lixo na limpeza). Precisa de Node 22 e rede.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { countGrams, MODEL_AREAS } from '../js/areaModel.js';
import { guessAreaInfo, setAreaModel } from '../js/areas.js';

const args = process.argv.slice(2);
const AVALIAR = args.includes('--avaliar');
const DADOS = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : '';
const OUT = new URL('../data/area-model.json', import.meta.url);
// Pedaço que aparece em menos produtos que isso sai do arquivo (221 KB com 5).
const MIN_PRODUCTS = 5;

const C = 'cozinha'; const L = 'limpeza'; const B = 'beleza'; const R = 'remedios';
// loja -> { departamento: ambiente }. As de teste ficam de fora do treino no --avaliar.
const TRAIN = {
  'www.zaffari.com.br': { 1001: C, 1002: C, 1006: C, 1004: C, 1005: C, 1008: B, 1009: L },
  'www.atacadao.com.br': { 2: C, 4: C, 3: C, 4891: C, 7: B, 8: L },
  'www.giassi.com.br': { 11: C, 3: C, 7: C, 8: B, 10: L },
  'www.supermuffato.com.br': { 181: C, 53: C, 168: C, 99: B, 140: L },
  'www.savegnago.com.br': { 15361: C, 12146: C, 15694: C, 15568: B, 12157: L },
  'www.bistek.com.br': { 1: C, 2: C, 4: C, 11: B, 15: L },
  'www.drogariavenancio.com.br': { 2: R, 1: B },
  'www.drogal.com.br': { 208: R, 62: B },
  'www.saojoaofarmacias.com.br': { 2001: R, 2006: B },
};
const TEST = {
  'carrefourbrfood.vtexcommercestable.com.br': { 3002077: C, 4599: C, 3002063: C, 35: B, 26: L },
  'www.samsclub.com.br': { 6: C, 4: C, 10: C, 13: B, 12: L },
  'www.drogariasaopaulo.com.br': { 800: R, 1243: B, 1244: B, 1160: B },
};
const OFFSETS = { train: [0, 200, 500, 900], test: [0, 300] };

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HOUSE = [
  [/\b(papel higienico|saco (plastico )?(de |para )?lixo|lixo|toalha de papel|papel toalha|guardanapo|inseticida|repelente)\b/, L],
  [/\b(protetor (labial|solar)|balm labial)\b/, B],
];

async function page(host, dept, from) {
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(`https://${host}/api/catalog_system/pub/products/search?fq=C:/${dept}/&_from=${from}&_to=${from + 49}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeepInventory404/1.0; inventario domestico pessoal)', Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 400 || res.status === 404) return [];
      if (res.ok || res.status === 206) return await res.json();
    } catch { /* tenta de novo */ }
  }
  console.error(`sem resposta: ${host} ${dept} ${from}`);
  return [];
}

async function collect() {
  const rows = [];
  for (const [split, plan] of [['train', TRAIN], ['test', TEST]]) {
    for (const [host, depts] of Object.entries(plan)) {
      for (const [dept, area] of Object.entries(depts)) {
        for (const from of OFFSETS[split]) {
          for (const p of await page(host, dept, from)) {
            const it = (p.items || [])[0] || {};
            rows.push({ split, store: host, area, ean: it.ean || '', name: String(p.productName || '').trim(), category: (p.categories || [])[0] || '' });
          }
        }
      }
      console.log(`${split} ${host}: ${rows.length}`);
    }
  }
  return rows;
}

// Um produto por código (ou nome), com as exceções da casa aplicadas.
function clean(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.name) continue;
    const key = `${r.split}|${r.ean || norm(r.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fixed = HOUSE.find(([re]) => re.test(norm(r.name)));
    out.push({ ...r, area: fixed ? fixed[1] : r.area });
  }
  return out;
}

function modelJson(rows) {
  const { d, f } = countGrams(rows);
  const kept = [...f].filter(([, c]) => c[0] + c[1] + c[2] + c[3] >= MIN_PRODUCTS).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { v: 1, areas: MODEL_AREAS, d, f: Object.fromEntries(kept) };
}

const raw = DADOS && existsSync(DADOS) ? JSON.parse(readFileSync(DADOS, 'utf8')) : await collect();
if (DADOS && !existsSync(DADOS)) writeFileSync(DADOS, JSON.stringify(raw));
const rows = clean(raw);

if (!AVALIAR) {
  const json = modelJson(rows);
  writeFileSync(OUT, `${JSON.stringify(json)}\n`);
  console.log(`data/area-model.json: ${rows.length} produtos, ${Object.keys(json.f).length} pedaços, ${Math.round(JSON.stringify(json).length / 1024)} KB`);
  process.exit(0);
}

// ---------- Avaliação ----------
const train = rows.filter((r) => r.split === 'train');
const seenTrain = new Set(train.flatMap((r) => [r.ean, norm(r.name)]).filter(Boolean));
const test = rows.filter((r) => r.split === 'test' && !seenTrain.has(r.ean) && !seenTrain.has(norm(r.name)));
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const abbr = (s) => norm(s).split(' ').map((w) => (w.length > 5 && rnd() < 0.6 ? w.slice(0, 3 + Math.floor(rnd() * 3)) : w)).join(' ').toUpperCase().slice(0, 40);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');

function measure(label, list, fn) {
  const res = list.map((r) => ({ r, g: fn(r) }));
  const sure = res.filter((x) => x.g.sure);
  const per = MODEL_AREAS.map((a) => { const s = res.filter((x) => x.r.area === a); return `${a} ${pct(s.filter((x) => x.g.area === a).length, s.length)}`; }).join('  ');
  console.log(`${label.padEnd(34)} acerta ${pct(res.filter((x) => x.g.area === x.r.area).length, res.length).padStart(4)} | decide sozinho ${pct(sure.length, res.length).padStart(4)} e acerta ${pct(sure.filter((x) => x.g.area === x.r.area).length, sure.length).padStart(4)} | ${per}`);
}

console.log(`treino ${train.length} produtos; teste ${test.length} de lojas que o treino não viu\n`);
setAreaModel(null);
measure('Sem modelo, só nome', test, (r) => guessAreaInfo({ name: r.name }));
setAreaModel(modelJson(train));
measure('Com modelo, só nome', test, (r) => guessAreaInfo({ name: r.name }));
measure('Com modelo, nome de cupom', test, (r) => guessAreaInfo({ name: abbr(r.name) }));
measure('Com modelo, nome + categoria', test, (r) => guessAreaInfo({ name: r.name, category: r.category }));
