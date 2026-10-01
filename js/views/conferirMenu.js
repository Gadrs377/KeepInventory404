// Os três jeitos de conferir (decisão B), num menu só: no botão Conferir do
// Armário, no lembrete "dias sem conferir" e em Mais › Armário.

import { listProducts, listLots } from '../store.js';
import { openMenu, plural } from '../ui.js';

export async function conferirMenu(anchor) {
  const [products, lots] = await Promise.all([listProducts(), listLots()]);
  const dated = new Map();
  for (const l of lots) dated.set(l.code, (dated.get(l.code) || 0) + l.qty);
  const noDate = products.filter((p) => p.qty > (dated.get(p.code) || 0)).length;
  return openMenu(anchor, [
    { label: 'Conferir tudo', sub: 'Quantidade e datas, numa passada', icon: 'listChecks', onSelect: () => { location.hash = '#/conferir'; } },
    { label: 'Só contar', sub: 'Só a quantidade', icon: 'count', onSelect: () => { location.hash = '#/inventario'; } },
    { label: 'Só marcar validades', sub: noDate ? `${plural(noDate, 'produto sem data', 'produtos sem data')}` : 'Todos já têm data', icon: 'calendar', onSelect: () => { location.hash = '#/validade'; } },
  ], { label: 'Conferir o armário' });
}
