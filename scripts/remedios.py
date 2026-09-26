#!/usr/bin/env python3
"""Monta a base de remédios do app a partir da tabela CMED da Anvisa.

A CMED (Câmara de Regulação do Mercado de Medicamentos) publica todo mês a
lista de preços de todos os remédios vendidos no Brasil, com o código de barras
(EAN) de cada apresentação, o princípio ativo, o laboratório, o registro na
Anvisa, a tarja e o tipo (genérico, similar, novo). É dado público:
https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos

Saída em data/remedios/ (o app lê direto do GitHub Pages, sem servidor):
  ean/NN.json   Remédios pelo código de barras, em 100 partes pequenas (NN são
                os dois números antes do dígito verificador). Uma leitura baixa
                só uma parte, de uns 60 KB.
  busca.json    Lista enxuta para buscar pelo nome ou pelo princípio ativo.
  info.json     Data da tabela e quantos remédios ela tem.

Uso:
  pip install openpyxl
  python3 scripts/remedios.py                 # baixa a tabela mais nova
  python3 scripts/remedios.py tabela.xlsx     # usa um arquivo já baixado
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

import openpyxl

PAGE = 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'remedios'
# Preço máximo ao consumidor com o ICMS do Rio Grande do Sul (17%), onde a casa compra.
PMC_COLUMN = 'PMC 17 %'
UA = 'KeepInventory404 (inventario domestico pessoal)'


def download_latest():
    req = urllib.request.Request(PAGE, headers={'User-Agent': UA})
    html = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    links = re.findall(r'href="([^"]*xls_conformidade_site_(\d{8})_[^"]*\.xlsx[^"]*)"', html)
    if not links:
        sys.exit('Não achei o link da planilha na página da CMED.')
    href, stamp = max(links, key=lambda x: x[1])
    url = href if href.startswith('http') else 'https://www.gov.br' + href
    print('Baixando', url)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    path = Path('/tmp') / f'cmed_{stamp}.xlsx'
    path.write_bytes(urllib.request.urlopen(req, timeout=300).read())
    return path, stamp


# ---------- Textos ----------

SMALL = {'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o'}


def title(s):
    """DORIL DC 500 -> Doril DC 500. Siglas sem vogal e palavras com número ficam em maiúsculas."""
    out = []
    for i, w in enumerate(s.split()):
        low = w.lower()
        if re.search(r'\d', w) or (len(w) <= 3 and not re.search(r'[AEIOUÁÉÍÓÚÂÊÔÃÕ]', w)):
            out.append(w)
        elif i and low in SMALL:
            out.append(low)
        else:
            out.append(low[:1].upper() + low[1:])
    return ' '.join(out)


def sentence(s):
    s = ' '.join(s.split()).lower()
    return s[:1].upper() + s[1:]


def clean(v):
    v = '' if v is None else str(v).strip()
    return '' if re.fullmatch(r'-?\s*(\(\*\))?\s*-?', v) else v


LAB_CUT = re.compile(
    r'\s+(LTDA\.?|S\.?\s?/?A\.?|EIRELI|ME|EPP|& CIA\.?|E CIA\.?|IND[ÚU]STRIA\b.*|IND\.?\b.*|COM[ÉE]RCIO\b.*|'
    r'LABORAT[ÓO]RIOS?\b.*|FARMAC[ÊE]UTICA\b.*|FARMAC[ÊE]UTICOS\b.*|DO BRASIL\b.*|BRASIL\b.*|IMPORTA[ÇC][ÃA]O\b.*)$')


def lab_short(name):
    s = name.upper().strip()
    # "FUNDAÇÃO ... - LAFEPE": fica a sigla depois do traço.
    if ' - ' in s and len(s.rsplit(' - ', 1)[1]) <= 20:
        s = s.rsplit(' - ', 1)[1]
    s = re.sub(r'^LABORAT[ÓO]RIOS?\s+', '', s)
    for _ in range(4):
        cut = re.sub(r'\s+(E|DE|DO|DA)$', '', LAB_CUT.sub('', s)).strip(' ,.-&')
        if cut == s or not cut:
            break
        s = cut
    words = s.split()
    # Primeira palavra curta é sigla (EMS, MSD, UCI).
    if words and len(words[0]) <= 3 and words[0].isalpha():
        return ' '.join([words[0], title(' '.join(words[1:]))]).strip()
    return title(s)


# Forma farmacêutica: (abreviação da CMED, singular, plural). A mais longa vale.
FORMS = [
    ('COM REV LIB PROL', 'comprimido de liberação prolongada', 'comprimidos'),
    ('COM LIB PROL', 'comprimido de liberação prolongada', 'comprimidos'),
    ('COM REV LIB RETARD', 'comprimido de liberação retardada', 'comprimidos'),
    ('COM LIB RETARD', 'comprimido de liberação retardada', 'comprimidos'),
    ('COM LIB', 'comprimido de liberação modificada', 'comprimidos'),
    ('COM REV', 'comprimido revestido', 'comprimidos'),
    ('COMP REV', 'comprimido revestido', 'comprimidos'),
    ('COM ORODISP', 'comprimido orodispersível', 'comprimidos'),
    ('COM SUBL', 'comprimido sublingual', 'comprimidos'),
    ('COM MAST', 'comprimido mastigável', 'comprimidos'),
    ('COM EFEV', 'comprimido efervescente', 'comprimidos'),
    ('COM DISP', 'comprimido dispersível', 'comprimidos'),
    ('COM VAG', 'comprimido vaginal', 'comprimidos'),
    ('COM', 'comprimido', 'comprimidos'),
    ('CAP DURA LIB PROL', 'cápsula de liberação prolongada', 'cápsulas'),
    ('CAP DURA', 'cápsula', 'cápsulas'),
    ('CAP MOLE', 'cápsula mole', 'cápsulas'),
    ('CAP GEL', 'cápsula gelatinosa', 'cápsulas'),
    ('CAP', 'cápsula', 'cápsulas'),
    ('DRG', 'drágea', 'drágeas'),
    ('SOL INJ', 'solução injetável', ''),
    ('SUS INJ', 'suspensão injetável', ''),
    ('SUSP INJ', 'suspensão injetável', ''),
    ('EMU INJ', 'emulsão injetável', ''),
    ('PO LIOF', 'pó liofilizado injetável', ''),
    ('LIOF', 'pó liofilizado injetável', ''),
    ('SOL INFUS', 'solução para infusão', ''),
    ('EMU INFUS', 'emulsão para infusão', ''),
    ('SOL DIL', 'diluente', ''),
    ('PO SOL INJ', 'pó para solução injetável', ''),
    ('PO SOL', 'pó para solução', ''),
    ('PO SUS', 'pó para suspensão', ''),
    ('PO EFEV', 'pó efervescente', ''),
    ('PO INAL', 'pó para inalação', ''),
    ('PO TOP', 'pó tópico', ''),
    ('PO', 'pó', ''),
    ('SOL OR', 'solução oral', ''),
    ('SOL ORAL', 'solução oral', ''),
    ('SUS OR', 'suspensão oral', ''),
    ('EMU OR', 'emulsão oral', ''),
    ('GEL OR', 'gel oral', ''),
    ('SOL GOT', 'gotas', ''),
    ('SUS GOT', 'gotas', ''),
    ('SOL OFT', 'colírio', ''),
    ('SUS OFT', 'colírio', ''),
    ('POM OFT', 'pomada oftálmica', ''),
    ('GEL OFT', 'gel oftálmico', ''),
    ('SOL NAS', 'solução nasal', ''),
    ('SUS NAS', 'spray nasal', ''),
    ('SUS AQUOSA NAS', 'spray nasal', ''),
    ('SUSP OFT', 'colírio', ''),
    ('ANEL VAG', 'anel vaginal', 'anéis'),
    ('SOL SPR', 'spray', ''),
    ('SUS SPR', 'spray', ''),
    ('SOL AER', 'aerossol', ''),
    ('SUS AER', 'aerossol', ''),
    ('SOL INAL', 'solução para inalação', ''),
    ('SUS INAL', 'suspensão para inalação', ''),
    ('SOL OTO', 'gotas para o ouvido', ''),
    ('SOL TOP', 'solução tópica', ''),
    ('SOL CAPI', 'solução capilar', ''),
    ('SOL', 'solução', ''),
    ('XPE', 'xarope', ''),
    ('ELX', 'elixir', ''),
    ('CREM VAG', 'creme vaginal', ''),
    ('GEL VAG', 'gel vaginal', ''),
    ('CREM DERM', 'creme', ''),
    ('CREME DERM', 'creme', ''),
    ('CR DERM', 'creme', ''),
    ('CREM', 'creme', ''),
    ('POM DERM', 'pomada', ''),
    ('POM DER', 'pomada', ''),
    ('POM', 'pomada', ''),
    ('GEL CREM', 'gel creme', ''),
    ('GEL', 'gel', ''),
    ('LOC', 'loção', ''),
    ('ADES TRANSD', 'adesivo', 'adesivos'),
    ('ADES', 'adesivo', 'adesivos'),
    ('GRAN', 'granulado', ''),
    ('SUP RET', 'supositório', 'supositórios'),
    ('SUP', 'supositório', 'supositórios'),
    ('SHAMP', 'xampu', ''),
    ('XAMP', 'xampu', ''),
    ('PAST', 'pastilha', 'pastilhas'),
    ('PAS', 'pastilha', 'pastilhas'),
    ('GOMA', 'goma de mascar', 'gomas'),
    ('COLUT', 'enxaguatório bucal', ''),
]
FORMS.sort(key=lambda f: -len(f[0].split()))
UNIT_LOW = {'MG': 'mg', 'G': 'g', 'ML': 'ml', 'MCG': 'mcg', 'L': 'l', 'KG': 'kg'}


def dose_text(tokens):
    s = ' '.join(tokens)
    s = re.sub(r'\b(MG|MCG|ML|G|L|GOTA|DOSE|MEQ|MMOL)\b', lambda m: m.group(1).lower(), s)
    return s


def presentation(text):
    """'500 MG COM CT BL AL PLAS AMB X 20' -> ('comprimido', '500 mg, 20 comprimidos')."""
    text = re.sub(r'(\d)(MG|MCG|ML|G|UI)\b', r'\1 \2', text)
    toks = text.split()
    form = None
    at = len(toks)
    for i in range(len(toks)):
        for abbr, one, many in FORMS:
            parts = abbr.split()
            if toks[i:i + len(parts)] == parts:
                form, at = (one, many), i
                break
        if form:
            break
    dose = dose_text(toks[:at]) if form else ''
    amount = ''
    m = re.findall(r'\bX\s+(\d+(?:,\d+)?)\s*(ML|G|L|MG|KG|DOSES?)?\b', text)
    if m and form:
        n, unit = m[-1]
        if unit:
            amount = f'{form[0]} {n} {UNIT_LOW.get(unit, unit.lower())}'
        elif form[1]:
            amount = f'{n} {form[1] if n != "1" else form[0].split()[0]}'
        else:
            amount = form[0]
    elif form:
        amount = form[0]
    size = ', '.join(x for x in (dose, amount) if x)
    return form[0] if form else '', size


TARJA = {
    'Tarja Vermelha': 'vermelha',
    'Tarja Vermelha sob restrição': 'vermelha-retencao',
    'Tarja Preta': 'preta',
    'Tarja Sem Tarja': 'livre',
}


def money(v):
    v = clean(v)
    if not v:
        return None
    try:
        return round(float(v.replace('.', '').replace(',', '.')), 2)
    except ValueError:
        return None


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        found = re.search(r'(\d{8})', path.name)
        stamp = found.group(1) if found else ''
    else:
        path, stamp = download_latest()

    wb = openpyxl.load_workbook(path, read_only=True)
    rows = wb.active.iter_rows(values_only=True)
    header = None
    for r in rows:
        if r and r[0] == 'SUBSTÂNCIA':
            header = [str(h).strip() if h else '' for h in r]
            break
    if not header:
        sys.exit('A planilha mudou: não achei a linha de títulos (SUBSTÂNCIA).')
    col = {h: i for i, h in enumerate(header)}
    sell = next((h for h in header if h.startswith('COMERCIALIZAÇÃO')), None)

    by_ean = {}
    for r in rows:
        if not r or not r[0]:
            continue
        get = lambda k: clean(r[col[k]]) if k in col else ''
        eans = [e for e in (get('EAN 1'), get('EAN 2'), get('EAN 3')) if re.fullmatch(r'\d{8,14}', e)]
        if not eans:
            continue
        tipo = get('TIPO DE PRODUTO (STATUS DO PRODUTO)')
        name = get('PRODUTO')
        subst = ' + '.join(sentence(x).lower() for x in get('SUBSTÂNCIA').split(';') if x.strip())
        forma, size = presentation(get('APRESENTAÇÃO'))
        klass = re.sub(r'^[A-Z0-9]+\s*-\s*', '', get('CLASSE TERAPÊUTICA'))
        item = {
            'nome': sentence(name) if tipo == 'Genérico' or name.upper() == get('SUBSTÂNCIA').upper() else title(name),
            'substancia': subst,
            'forma': forma,
            'tamanho': size,
            'apresentacao': ' '.join(get('APRESENTAÇÃO').split()),
            'laboratorio': lab_short(get('LABORATÓRIO')),
            'registro': get('REGISTRO'),
            'classe': sentence(klass) if klass else '',
            'tipo': tipo,
            'tarja': TARJA.get(get('TARJA'), ''),
        }
        pmc = money(r[col[PMC_COLUMN]]) if PMC_COLUMN in col else None
        if pmc:
            item['pmc'] = pmc
        if get('RESTRIÇÃO HOSPITALAR') == 'Sim':
            item['hospitalar'] = True
        selling = sell and get(sell) == 'Sim'
        for ean in eans:
            old = by_ean.get(ean)
            # Um código em duas linhas: fica a apresentação que ainda é vendida.
            if old and (old[1] or not selling):
                continue
            by_ean[ean] = (item, selling)

    OUT.mkdir(parents=True, exist_ok=True)
    shard_dir = OUT / 'ean'
    shard_dir.mkdir(exist_ok=True)
    for f in shard_dir.glob('*.json'):
        f.unlink()
    shards = {}
    for ean, (item, _) in by_ean.items():
        shards.setdefault(ean[-3:-1], {})[ean] = item
    for key in (f'{i:02d}' for i in range(100)):
        data = dict(sorted(shards.get(key, {}).items()))
        (shard_dir / f'{key}.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), 'utf-8')

    # Busca: uma linha por apresentação, [código, nome, princípio ativo, tamanho,
    # laboratório, vendido hoje (1/0)]. Sem hospitalares, que não vão para casa.
    seen = set()
    search = []
    for ean, (item, selling) in sorted(by_ean.items(), key=lambda x: (x[1][0]['nome'], x[1][0]['tamanho'])):
        if item.get('hospitalar') or id(item) in seen:
            continue
        seen.add(id(item))
        search.append([ean, item['nome'], item['substancia'], item['tamanho'], item['laboratorio'], 1 if selling else 0])
    (OUT / 'busca.json').write_text(json.dumps(search, ensure_ascii=False, separators=(',', ':')), 'utf-8')

    date = f'{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}' if stamp else ''
    info = {'fonte': 'Tabela CMED, Anvisa', 'url': PAGE, 'data': date, 'codigos': len(by_ean), 'busca': len(search), 'icms': PMC_COLUMN}
    (OUT / 'info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(f'{len(by_ean)} códigos de barras, {len(search)} apresentações na busca, tabela de {date or "data desconhecida"}.')


if __name__ == '__main__':
    main()
