# System design do KeepInventory404

Aplicativo de inventário para o armário de comidas de casa. Roda no navegador do
celular, lê código de barras pela câmera, descobre o que é o produto e mantém a
quantidade de cada item.

Este documento é a referência técnica. As telas estão em
[INTERFACES.md](INTERFACES.md) e a linguagem visual em
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Qualquer mudança no app deve continuar
coerente com os três.

## 1. Objetivos

| Precisa ter | Como o app resolve |
| --- | --- |
| Modo de entrada | Tela de leitura em modo **Entrada**: cada leitura soma unidades ao estoque |
| Modo de saída (dar baixa) | Mesma tela em modo **Saída**: cada leitura subtrai unidades |
| Modo de inventário | **Inventário**: contagem física que, ao final, corrige o estoque |
| Ler código de barras pela câmera | `BarcodeDetector` nativo, com polyfill ZXing em WebAssembly, e bip de caixa a cada leitura |
| Descobrir o que é o produto | Consulta ao Open Food Facts; se não achar, cadastro manual |
| Informar quantidade ao cadastrar | Seletor de quantidade em toda entrada, saída e contagem |
| Usar pelo celular | PWA publicado no GitHub Pages, instalável na tela inicial |
| Saber quanto tem no armário | Tela **Armário** com a quantidade de cada item e alertas de estoque baixo |

Fora do escopo desta primeira versão: sincronizar entre vários celulares,
validade por lote, lista de compras. Ver a seção 9.

## 2. Decisões de arquitetura

```
┌──────────────────────── Celular (navegador) ────────────────────────┐
│                                                                      │
│  index.html ── app.js (roteador por hash)                            │
│                   │                                                  │
│      ┌────────────┼─────────────┬──────────────┬─────────────┐       │
│   views/       scanner.js    lookup.js      store.js       ui.js     │
│   (telas)      (câmera +     (Open Food     (regras de    (sheet,    │
│                 decoder)      Facts)         estoque)      toast,    │
│                   │              │              │          stepper)  │
│          vendor/zxing (wasm)     │           db.js                   │
│                                  │         (IndexedDB)               │
│  sw.js (service worker: cache do app para abrir offline)             │
└──────────────────────────────────┼───────────────────────────────────┘
                                   │ HTTPS
                     world.openfoodfacts.org/api/v2
```

- **Site estático, sem etapa de build.** HTML, CSS e módulos ES puros. Qualquer
  pessoa edita um arquivo e faz push; o GitHub Pages publica. Menos peças para
  quebrar em um projeto doméstico.
- **Dados ficam no próprio celular (IndexedDB).** Não há servidor, conta ou
  custo. O app pede armazenamento persistente (`navigator.storage.persist`) para
  o navegador não apagar os dados, e oferece backup em arquivo.
- **HTTPS obrigatório.** A câmera só funciona em origem segura; o GitHub Pages
  já entrega HTTPS.
- **Leitor de código de barras em duas camadas.** Android/Chrome tem
  `BarcodeDetector` nativo. iPhone/Safari não tem, então o app carrega o polyfill
  `barcode-detector` (ZXing compilado para WebAssembly). Os arquivos ficam em
  `vendor/` dentro do repositório para funcionar offline e sem depender de CDN.
- **Funciona offline**, exceto a consulta de produtos novos. Sem internet, o
  app oferece cadastro manual do nome.

## 3. Modelo de dados (IndexedDB `keepinventory`, versão 3)

### `products` (chave: `code`; índice `barcodes`, multiEntry)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `code` | string | Identificador do produto. O primeiro produto de um código de barras usa o próprio código; os seguintes usam `<código>~<sufixo>`. Itens sem código usam `SEM-<timestamp>` |
| `barcodes` | string[] | Códigos de barras deste produto. Um mesmo código pode aparecer em vários produtos |
| `name` | string | Nome exibido. Vem do Open Food Facts ou é digitado |
| `brand` | string | Marca, opcional |
| `size` | string | Conteúdo da embalagem, ex. `395 g` |
| `image` | string | URL da foto pequena da embalagem, opcional |
| `category` | string | Categoria da loja, ex. `/Limpeza/Para Casa/Desinfetante/`. Opcional; base para os ambientes |
| `area` | `cozinha` \| `limpeza` \| `beleza` \| `remedios` | Ambiente da casa. Sugerido por `areas.js` e editável na página do produto. Remédios ficam no Armário como mais um ambiente |
| `med` | objeto | Só em remédio achado na base da Anvisa: `nome`, `substancia`, `forma`, `tamanho`, `apresentacao`, `laboratorio`, `registro`, `classe`, `tipo`, `tarja`, `pmc`, `hospitalar` (seção 5.3) |
| `qty` | inteiro ≥ 0 | Unidades no armário. Nunca negativo |
| `minQty` | inteiro ≥ 0 | Abaixo ou igual a isso o item aparece como "acabando". 0 desliga o aviso |
| `source` | `off` \| `loja` \| `anvisa` \| `nota` \| `manual` | De onde veio o cadastro |
| `createdAt`, `updatedAt` | número (ms) | |

Versão 3 do banco. As migrações nunca mexem em quantidades nem no histórico:
da versão 1 cria o índice `barcodes` e preenche `barcodes = [code]`; da 2 cria a
tabela `lots` e preenche `area` com a regra de ambientes. Uma só passada de
cursor faz as duas coisas, para uma não sobrescrever a outra.

**Ambientes (`areas.js`), sem IA.** Ordem: exceções pelo nome (papel higiênico,
saco de lixo e inseticida vão para limpeza, embora as lojas ponham em higiene),
depois o primeiro segmento reconhecido da categoria da loja, depois palavras do
nome, e por fim cozinha. Medido em produtos que as regras nunca viram: 99% certo
pela categoria e 99% só pelo nome.

### `movements` (chave: `id` autoincremento; índices `code`, `at`)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `code` | string | Produto afetado |
| `type` | `entrada` \| `saida` \| `ajuste` \| `contagem` | Origem do movimento |
| `delta` | inteiro | Positivo soma, negativo subtrai |
| `qtyBefore`, `qtyAfter` | inteiro | Permite auditar e desfazer |
| `at` | número (ms) | Momento do registro |
| `lotsBefore` | lote[] | Como estavam os lotes antes, para desfazer |
| `expiresAt` | `AAAA-MM-DD` | Só em entradas com validade |

### `lots` (chave: `id` autoincremento; índices `code`, `expiresAt`)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `code` | string | Produto |
| `qty` | inteiro ≥ 1 | Unidades com esta validade |
| `expiresAt` | `AAAA-MM-DD` | Validade. Só mês e ano vira o último dia do mês |
| `addedAt` | número (ms) | |

A soma dos lotes nunca passa de `qty`; o que sobra são unidades sem data. Quando
o estoque cai (saída, ajuste ou contagem), saem primeiro as unidades sem data e
depois os lotes que vencem antes.

O estoque (`products.qty`) é sempre atualizado na **mesma transação** que grava
o movimento. Assim o número exibido e o histórico nunca divergem.

### `meta` (chave: `key`)

| Chave | Conteúdo |
| --- | --- |
| `countDraft` | Contagem de inventário em andamento: `{ startedAt, counts: { [code]: n } }` |

A contagem é salva a cada leitura. Se o celular bloquear ou o app fechar, a
contagem continua de onde parou.

## 4. Regras de estoque (`store.js`)

| Operação | Regra |
| --- | --- |
| `addStock(code, n)` | `n ≥ 1`. Soma `n`. Cria o produto se ainda não existir |
| `removeStock(code, n)` | `n ≥ 1` e `n ≤ qty`. Não deixa o estoque negativo; a interface limita o seletor ao estoque atual |
| `setStock(code, n)` | Ajuste manual na tela do produto. Grava `ajuste` com a diferença |
| `applyCount(draft, zeroMissing)` | Para cada item contado com quantidade diferente, grava `contagem` com a diferença. Com `zeroMissing`, itens não contados vão a 0 |
| `undoMovement(id)` | Desfaz só se for o último movimento do produto; volta `qty` para `qtyBefore`, restaura os lotes e apaga o movimento |
| `addStock(code, n, info, expiresAt)` | Com validade, cria um lote de `n` unidades |
| `addLot(code, n, expiresAt)` | Dá validade a unidades que já estão no armário sem data |

**Consumo (`consumo.js`).** Ritmo = saídas e baixas por ajuste ou contagem nos
últimos 60 dias, divididas pelos dias de histórico (mínimo 7). Uma saída só não
conta como ritmo. A lista de compras sugere o que está no mínimo ou acaba antes
da próxima compra; a quantidade leva o estoque ao consumo até a próxima compra
mais o mínimo. O intervalo entre compras (padrão 7 dias), os itens marcados e os
itens soltos ficam no `localStorage` deste celular.

## 5. Busca do produto (`lookup.js`)

1. Procura o código no índice `barcodes`. Se algum produto tem esse código, usa
   os dados locais e **não** consulta a internet. Pode voltar mais de um
   produto (seção 5.1).
2. Se não existe, consulta ao mesmo tempo:
   - **Lojas online brasileiras**, pelo repassador (seção 5.2). Têm preferência:
     nome completo em português, marca, tamanho, foto e categoria da loja.
   - **Open Food Facts**:
     `GET https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,product_name_pt,brands,quantity,image_front_small_url`,
     usado se as lojas não acharem.
   Cada consulta tem tempo limite (12 s e 8 s).
3. Não achou: a folha de cadastro abre com o campo **Nome do produto**, que
   também busca nas lojas enquanto a pessoa digita (a partir de 3 letras,
   350 ms depois de parar). Tocar numa sugestão preenche nome, marca, tamanho,
   foto e categoria; o produto fica com o código que foi lido.
4. Produto sem código (`SEM-…`): o mesmo campo; se a sugestão tiver código de
   barras, o produto passa a usar esse código e é reconhecido nas próximas
   leituras. Se o código já existir no armário, abre esse produto.
5. Nada encontrado ou sem rede: dá para salvar só com o nome. Se o problema foi
   rede, a folha mostra **Buscar de novo**.

Medição com 100 produtos reais: Open Food Facts sozinho achou 43%; com as lojas,
84% (comida 50/63, limpeza 11/14, beleza e higiene 23/23). Busca por nome achou
o produto certo em 10 de 10 testes.

### 5.2 Repassador (`worker/`, Cloudflare Workers, plano grátis)

As lojas que usam a plataforma VTEX têm busca pública de catálogo por código de
barras (`/api/catalog_system/pub/products/search?fq=alternateIds_Ean:…`) e por
nome (`/api/io/_v/api/intelligent-search/product_search/?query=…`), mas não
liberam CORS. O Worker faz essas consultas e devolve um formato único.

| Rota | O que faz | Cache |
| --- | --- | --- |
| `GET /lookup?ean=` | Primeiro o catálogo próprio (seção 5.5). Não está lá: consulta 27 lojas em paralelo e devolve a primeira que achar; o Zaffari (onde a casa compra) tem preferência se responder em até 0,8 s a mais. Nenhuma achou: os catálogos de código de barras (seção 5.4). O que achar ao vivo entra no catálogo próprio | 7 dias (não encontrado: 1 dia) |
| `GET /search?q=` | Busca por nome no Zaffari, em 4 supermercados e em 2 farmácias (Zaffari primeiro), intercala, remove repetidos e mantém só o que tem cada palavra digitada no começo de uma palavra do produto | 1 dia |
| `POST /identify` | Recebe a foto da embalagem (JPEG até 1 MB), a IA da Cloudflare (Llama 4 Scout) lê marca, produto, variante e tamanho, e o Worker busca em cascata (busca sugerida, marca + produto + variante, marca + produto, marca) até juntar 6 sugestões | a busca usa o cache da `/search` |
| `GET /area?q=` | Ambiente da casa pelo nome, pela categoria que o Mercado Livre adivinha (seção 5.6). Só quando o app não tem certeza | 30 dias |
| `GET /diag` | Testa cada loja a partir da Cloudflare e mostra o catálogo próprio (produtos, rodadas, erros, onde o robô está) | sem cache |

- Só consulta a lista fixa de lojas (não é um proxy aberto) e só responde a
  chamadas de navegador vindas do endereço do app (`ALLOWED_ORIGINS`).
- Se identifica como `KeepInventory404 (inventario domestico pessoal)`.
- Plano grátis: 100 mil requisições por dia. A conta não tem cartão, então nunca
  há cobrança; se o limite estourar, o app cai para Open Food Facts e nome.
- Publicação: `.github/workflows/worker.yml`, com os segredos
  `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
- Busca não oficial: se uma loja mudar ou bloquear, as outras continuam.
  `/diag` mostra quais respondem.
- **Foto com IA, validada:** em 22 fotos reais de embalagens, o produto certo
  apareceu nas sugestões em 17 (15 entre as 5 primeiras). A cota grátis da
  Workers AI (10 mil neurônios por dia) dá para centenas de fotos por dia. A foto
  é o último recurso: vem depois do código, da busca nas lojas e do nome.

### 5.3 Remédios (`remedios.js`, base em `data/remedios/`)

A Anvisa (CMED) publica todo mês a lista de preços de todos os remédios
vendidos no Brasil, com até três códigos de barras por apresentação, princípio
ativo, laboratório, registro, tarja, tipo (genérico, similar, novo) e o preço
máximo ao consumidor. `scripts/remedios.py` baixa a planilha e gera arquivos
estáticos, publicados junto com o app:

| Arquivo | Conteúdo | Tamanho |
| --- | --- | --- |
| `ean/NN.json` | Remédios pelo código de barras, em 100 partes (NN são os dois números antes do dígito verificador) | ~120 KB cada, ~20 KB comprimido |
| `busca.json` | `[código, nome, princípio ativo, tamanho, laboratório, vendido]` por apresentação, sem as de uso hospitalar | 2,2 MB, ~320 KB comprimido |
| `info.json` | Data da tabela e número de códigos | |

- **Pelo código:** `lookupRemote` consulta a base antes das lojas. Achou, o
  produto nasce com `area: 'remedios'`, `source: 'anvisa'`, os dados em `med` e
  sem foto. Uma leitura baixa só uma parte da base.
- **Pelo nome:** a busca do Armário (em Remédios, ou em Tudo quando nada em
  casa bate) baixa `busca.json` uma vez por sessão; cada
  palavra digitada tem de aparecer no nome, princípio ativo, dose ou
  laboratório.
- **Sem internet:** o service worker guarda cada parte já consultada
  (`remedios-v1`, responde do cache e atualiza por trás).
- **Produto antigo:** se o código de um produto do Armário está na base, a
  página dele oferece "Usar os dados da Anvisa", que troca os dados e passa o
  produto para o ambiente Remédios.
- **Textos:** o script traduz a apresentação da CMED ("500 MG COM CT BL AL
  PLAS AMB X 20") para "500 mg, 20 comprimidos" e encurta o laboratório
  ("EUROFARMA LABORATORIOS S.A." vira "Eurofarma"). O original fica em
  `apresentacao`.
- **Preço máximo:** coluna PMC com ICMS de 17% (RS). Muda na constante
  `PMC_COLUMN` do script.
- **Bula:** link para o Bulário Eletrônico da Anvisa pelo nome do remédio.
- **Atualização:** `.github/workflows/remedios.yml`, todo dia 12, faz o commit
  se a tabela mudou e dispara a publicação do site.

### 5.4 Catálogos de código de barras (quando nenhuma loja conhece)

Objetivo: resolver quase tudo só pelo código, e deixar a foto com IA para o
que não tem código nem nome conhecido. Pesquisa de 09/2026, medida com 195
códigos reais de uma rede que o app não consulta (Hortifruti), de 80 tipos de
produto; 39 deles são marca própria da rede, que só a própria loja conhece.

| Etapa | Achou (todos) | Achou (sem marca própria) |
| --- | --- | --- |
| Antes: 14 lojas + Open Food Facts | 154/195 (79%) | 133/156 (85%) |
| + Zona Sul, GBarbosa e Bretas | 166/195 (85%) | 143/156 (92%) |
| + CadastroProduto | 172/195 (88%) | 147/156 (94%) |

O que ficou de fora: polpas de fruta, kombucha e massas frescas de marcas
regionais. O que o app já conhece não é consultado de novo.

Cascata no Worker (`lookup`): lojas → se nenhuma achou, em paralelo,
**CadastroProduto** (página pública com JSON-LD, 945 mil produtos, sem chave),
**Systax** (página pública de classificação fiscal, nome e NCM, sem chave)
e, se o Worker tiver a chave, **Cosmos** (`COSMOS_TOKEN`) e **Kodebar**
(`KODEBAR_KEY`). O Open Food Facts continua sendo consultado pelo celular.
Catálogo devolve nome em maiúsculas de cupom; o Worker passa para letra de
frase e devolve sem foto nem categoria.

**Web (Tavily), o último recurso.** Com a chave `TAVILY_API_KEY` (1.000
créditos grátis por mês; sem ela, modo sem chave com limite):

- **Pelo código:** só depois que lojas e catálogos não acharam, e só se o
  dígito verificador estiver certo (leitura errada não gasta). Busca o número;
  vale a página com o código exato no título ou no endereço (só no texto pegou
  um PDF de prefeitura). Básica (1 crédito) e, se não achar e ainda couber no
  tempo, avançada (2). O repassador termina em até 17 s; o app espera 20 s.
  Medido: pistache Bom Princípio (5 s no total) e sabonete Maran, que ninguém
  mais tinha. Código que não existe: ~9 s até dizer que não achou.
- **Pela foto:** se as lojas trouxerem menos de 3 sugestões, busca marca,
  produto, variante e tamanho só no Cosmos e no Systax (põem o código no
  endereço). Marca obrigatória e 3 de 4 palavras no título ("SAB" vale por
  sabonete; "500gr" por 500g). Medido com 11 embalagens: em 6 o produto
  certo veio entre as sugestões (Maran, Orquídea integral, Ypê, Veja, Nescau,
  Tirolez), às vezes ao lado da versão light; 5 vazias (Bom Princípio,
  Fescopan, Camil, Neosaldina e o espaguete Santa Amália, cujo torteloni não
  passa). Entra no fim da lista, marcado `web: true`: é sugestão, nunca
  decide sozinho.
- **Foto do que não é de loja:** primeiro o Cosmos pelo código exato
  (`cdn-cosmos.bluesoft.com.br/products/{EAN}`): em 34 códigos de marcas
  grandes, 28 tinham; dos difíceis (Stikadinho 160g, pistache Bom Princípio,
  Maran), nenhum. Depois as imagens que a busca pelo código devolve, só se a
  descrição citar 2 palavras do nome ("pistachios" vale por pistache).
  Medido: pistache, Maran e Orquídea com a foto certa.
  - **Redução pela própria Cloudflare** (`cf.image` no `fetch`, funciona no
    `workers.dev` do plano grátis): 320x320, fundo branco, WebP qualidade 85,
    ~15 KB (a do Cosmos tem em média 328 KB, até 1,6 MB). Grátis até 5.000
    fotos novas por mês; passando, as novas param até o mês seguinte, sem
    cobrança. Fundo branco porque WebP com perda borra a borda transparente
    (franja em volta da embalagem). 320 porque a maior miniatura do app tem
    104 pt (~312 pixels no celular).
  - **Guardada no catálogo** (tabela `foto`: código, bytes, endereço de onde
    veio) e servida em `/foto/{código}` (30 dias de cache). Não depende do
    site de origem continuar no ar. O celular guarda essas fotos para usar
    sem internet (`sw.js`).
  - Antes era o wsrv.nl (grátis, mas guarda só de 7 a 31 dias, recusa alguns
    sites e limita pedidos por IP). Opções avaliadas para guardar: KV (só mil
    gravações por dia), R2 (pede cartão), Cloudflare Images (só pago).
  - Foto de loja não passa por aqui: a própria loja manda 320x320 (a VTEX
    já entrega WebP ao navegador, ~9 KB).
  - **A foto que a casa tira fica só no celular** (LGPD): vira a miniatura
    do produto no aparelho e não vai para o catálogo. Na identificação por
    foto, a imagem vai à IA só para ler a embalagem e não é guardada.
- Tudo que a web acha entra no catálogo próprio (5.5): a segunda vez não gasta.

Fontes avaliadas:

| Fonte | Como acessa | Resultado |
| --- | --- | --- |
| Lojas VTEX (27) | Busca pública por EAN | A melhor: nome completo, foto, categoria. 3 novas em 09/2026, 10 em 10/2026 |
| Open Food Facts | API aberta | 94/195 sozinho; só comida (36 mil produtos do Brasil) |
| Open Beauty / Products Facts | API aberta | 0 e 3 de 195: quase sem produto brasileiro |
| CadastroProduto | Página pública por código | 25/59 sozinho; +6 que ninguém tinha. Limita consultas seguidas (uso doméstico passa longe). Base completa em CSV: R$ 299, não compensa (cobre menos que as lojas) |
| Systax | Página pública `systax.com.br/ean/{GTIN com 14 dígitos}` | 6 de 10 códigos difíceis, com nome e NCM (10/2026). Código que não tem: responde 200 com a página de um código **parecido** (pedido 7897500607265, pistache Bom Princípio; veio 7897500607388, creme de avelã da mesma marca). O Worker só aceita se o GTIN do bloco principal (`main_ean`) e o endereço canônico forem o pedido, com 14 dígitos; os "semelhantes" não contam. Página em ISO-8859-1, ~240 KB. Sem API pública confirmada: só consulta pontual, quando nenhuma loja conhece |
| Cosmos (Bluesoft) | API com chave grátis, 25 consultas/dia | Maior catálogo brasileiro de GTIN. Não medido (precisa de conta) |
| Kodebar | API com chave grátis, 50 consultas/dia | Base de PDVs reais. Não medido (precisa de conta) |
| DotCompany | API com chave, créditos | 1,9 mi de itens, R$ 0,04 por consulta |
| Verified by GS1 Brasil | Site com login e captcha | Oficial, mas não serve para consulta automática |
| Menor Preço (Nota Paraná) | API do app oficial | Para quem não é o app, devolve dados falsos (proteção). Descartado |
| Mercado Livre | API | Exige conta de desenvolvedor e token do usuário. Descartado |
| UPCitemdb, Open EAN/GTIN DB | API aberta | Quase sem produto brasileiro, limite baixo |

### 5.5 Catálogo próprio (`worker/src/catalog.js`, Cloudflare D1)

Um banco SQLite grátis da Cloudflare (D1: 5 GB, 5 milhões de linhas lidas e
100 mil escritas por dia) com os produtos das lojas, para responder sem
depender de a loja estar no ar, e guardar o que um dia sumir do site.

- **Robô:** o Worker roda a cada minuto (`[triggers]` no `wrangler.toml`) e
  copia uma página de 20 produtos de uma categoria de uma loja
  (`fq=C:/departamento/categoria/`, até `_from=2500`). Acabou a categoria,
  vai para a próxima; acabou a loja, a próxima. ~29 mil produtos por dia no
  máximo, bem abaixo das 100 mil escritas. A tentativa é anotada antes de
  baixar: três tentativas sem sucesso no mesmo lugar pulam a categoria.
- **Aprende sozinho:** o que o `/lookup` e o `/search` acham ao vivo também
  entra (CadastroProduto, Cosmos e Kodebar entram sem foto nem categoria).
- **Formato, feito para caber muito:**

  | Tabela | Colunas | Conteúdo |
  | --- | --- | --- |
  | `p` | `e INTEGER PRIMARY KEY, n BLOB, i INTEGER` | Código de barras como número e chave (é o rowid, sem índice extra). `n`: números das palavras do nome em varint, um 0, a categoria e a marca (cada uma uma "palavra" só). `i`: número da foto × 64 + loja |
  | `w` | `id INTEGER PRIMARY KEY, t TEXT UNIQUE` | Dicionário de palavras |
  | `c` | `k TEXT PRIMARY KEY, v TEXT` | Onde o robô está, categorias de cada loja, contadores |

  A foto é remontada: `https://{conta}.vteximg.com.br/arquivos/ids/{n}-200-200`
  (a conta de imagens de cada loja está em `CATALOG_STORES`, que só pode
  crescer no fim). Tamanho sai do nome.
- **Medido** (1.307 produtos reais de 60 páginas, `REDE=1 node test/catalog.mjs`):
  24,7 bytes de dados por produto (o nome codificado: 16,7 bytes, contra ~40
  em texto), ~41 bytes com as páginas do SQLite. Um milhão de produtos ≈ 45 MB;
  os 5 GB dariam para mais de 100 milhões.
- **Banco:** criado e ligado pelo `.github/workflows/worker.yml` na
  publicação (binding `CATALOG`). A chave `CLOUDFLARE_API_TOKEN` precisa de
  **Account › D1 › Edit**; sem isso, o Worker sai sem o catálogo e funciona
  como antes.
- **Testes:** `node test/catalog.mjs` (sem rede; o D1 é imitado com o SQLite
  do Node).

### 5.6 Ambiente do produto (`areas.js`, `areaModel.js`)

Cozinha, Limpeza, Beleza ou Remédios. Vale a primeira fonte que tiver certeza
(`guessAreaInfo` devolve `{ area, sure, by }`):

1. **Anvisa** (`med`): remédio.
2. **A casa:** produto em que alguém escolheu o ambiente à mão ganha
   `areaByUser`; as duas primeiras palavras do nome ensinam os próximos
   ("Vela aromática" em Beleza leva as outras "Vela aromática" para lá). Só a
   primeira palavra vale quando nada mais tem certeza. Vai junto no backup.
3. **Exceções da casa:** papel higiênico, saco de lixo etc. na limpeza.
4. **Categoria da loja, por palavras:** "Limpeza e Lavanderia", "Higiene e
   Perfumaria", "Drogaria/Medicamentos". Segmento misto ("Higiene e Limpeza")
   não decide.
5. **Palavras conhecidas do nome** ("sabonete", "detergente"...).
6. **Modelo:** Naive Bayes com pedaços de 3 a 5 letras das palavras, treinado
   com 7.408 produtos de 12 lojas pelo departamento (`scripts/area-model.mjs`
   gera `data/area-model.json`, 247 KB, ~70 KB comprimido). Decide sozinho com
   confiança ≥ 0,7.
7. **Sem certeza:** a folha pergunta ao repassador (`GET /area?q=`, categoria
   do Mercado Livre pelo nome, cache de 30 dias). Se ele também não souber, o
   campo "Onde fica" fica âmbar com "Não tenho certeza. Confira onde fica."

Medido em 879 produtos de 3 lojas que o treino não viu (Carrefour, Sam's,
Drogaria São Paulo; `node scripts/area-model.mjs --avaliar`):

| | Acerto | Decide sozinho (e acerta) |
| --- | --- | --- |
| Antes, só com o nome | 88% (remédios 0%) | 45% (100%) |
| Agora, só com o nome | 98% | 95% (100%) |
| Agora, nome de cupom ("DET YPE NEUTRO") | 96% | 91% (99%) |
| Agora, nome + categoria da loja | 100% | 100% |

Comparados antes de escolher: regressão logística (97%, 88% no nome de
cupom), só palavras (76–89% no cupom), Open Food Facts pelo código (achou 16%;
tem produtos com dado errado) e Mercado Livre pelo nome (respondeu 89%,
acertou 91%; erra remédio de receita, não responde bebida alcoólica).

### 5.1 Um código, vários produtos

Acontece de verdade: fabricante que reusa o mesmo código em sabores diferentes,
marca pequena com código genérico, ou a pessoa que quer separar duas coisas que
vieram com o mesmo código. Regras:

| Situação na leitura | O que a folha mostra |
| --- | --- |
| Nenhum produto com o código | Busca no Open Food Facts e cadastro (como antes) |
| Um produto | A folha do produto, com o link **Não é este? Cadastrar outro produto com este código** (entrada e contagem) |
| Dois ou mais | **Qual destes?**: lista com foto, nome, tamanho e etiqueta de estoque de cada um, ordenada por quem tem mais no armário, e o botão **Outro produto com este código** |
| Saída com vários | A mesma lista; produtos com estoque 0 aparecem apagados e não podem ser escolhidos |

O produto novo criado assim recebe um identificador próprio e o mesmo código em
`barcodes`. Os dados do Open Food Facts não são reaproveitados, porque
descrevem o primeiro produto; a folha pede um nome que diferencie os dois (por
exemplo o sabor).

Caso inverso, ainda não implementado: vários códigos para o mesmo produto (as
etiquetas de balança do mercado, que começam com 2 e mudam com o peso). O campo
`barcodes` já é uma lista, então basta uma ação "Vincular a um produto
existente" na folha de produto novo.

O Open Food Facts é aberto e colaborativo, tem boa cobertura de produtos
brasileiros e aceita chamadas do navegador (CORS liberado).

## 6. Leitura pela câmera (`scanner.js`)

- `getUserMedia({ video: { facingMode: 'environment' } })`, resolução ideal
  1280×720.
- Formatos: `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`.
- Laço com `requestAnimationFrame`, decodificando no máximo a cada 150 ms para
  poupar bateria.
- **Confirmação dupla:** um código só é aceito depois de lido igual em duas
  leituras seguidas. Evita números errados de leituras parciais.
- **Pausa ao ler:** ao aceitar um código, o leitor pausa, toca o bip, vibra
  (quando o aparelho permite) e abre a folha do produto. Volta a ler quando a
  folha fecha.
- **Bip (`sound.js`):** gerado com Web Audio, sem arquivo de som: tom de
  2.700 Hz por 110 ms, como o leitor do caixa. Um bip grave duplo indica erro
  (saída de produto que não está no armário ou que está zerado). O iPhone só
  libera áudio depois do primeiro toque na tela, então o áudio é destravado no
  primeiro toque. Pode ser desligado em Dados.
- **Mesmo código de novo:** a embalagem que acabou de ser registrada é ignorada
  enquanto continuar na frente da câmera. Ela só é lida de novo depois de sair
  do visor por 0,8 s. Para registrar várias unidades iguais, use o seletor de
  quantidade ou afaste e aproxime a embalagem.
- Lanterna, quando a câmera oferece `torch`.
- Sem câmera ou sem permissão: a tela explica como liberar e oferece
  **Digitar código**.
- **Não está lendo?** Depois de 9 s com a câmera ligada e nenhuma leitura, o
  visor mostra **Buscar pelo nome**. A mesma opção fica na folha Digitar código.

## 7. Fluxos

### Entrada

```
Armário ─[Entrada]→ Leitor (verde) ─código→ busca ─→ Folha do produto
                                                      │ quantidade (1..999)
                                                      └[Adicionar N]→ addStock
                                                            → aviso "Agora: X" + Desfazer
                                                            → leitor volta a ler
```

### Modo rápido (caixa do mercado)

```
Leitor com [Modo rápido] ligado ─código→ um produto só no armário?
          ├ sim → soma (ou tira) 1 na hora, bip, linha no cupom, aviso com Desfazer
          └ não (novo ou vários produtos) → vai para "Para resolver" (conta as leituras)
[Concluir] com pendentes → pergunta: Resolver agora | Concluir sem elas
[Resolver] → folha normal, com a quantidade = número de leituras
```

### Fim da sessão

Concluir mostra o cupom da sessão (Entrada, Saída ou, depois de aplicar, a
Contagem), que sai da impressora e pode ser compartilhado como texto.

### Sem código de barras

```
[Buscar pelo nome] → Saída: lista o que está no armário pelo nome
                   → Entrada/Contagem: nome digitado → primeiro o que já está no
                     armário, depois as lojas → [Tirar foto da embalagem] → IA lê →
                     sugestões das lojas → escolher preenche nome, marca, foto e o
                     código de barras de verdade
```

### Saída

```
Armário ─[Saída]→ Leitor (beterraba) ─código→ (vários produtos? escolher um)
          → produto existe e qty > 0?
          ├ sim → Folha: quantidade (1..qty) ─[Dar baixa em N]→ removeStock
          ├ existe, qty 0 → Folha avisa "Não tem nenhum no armário"
          └ não existe → Folha avisa "Esse produto não está cadastrado" + [Cadastrar como entrada]
```

### Inventário

```
Armário ─[Inventário]→ Contagem (azul) ─ler ou tocar item→ Folha "Quantos tem?"
                         │                                   └[Salvar contagem]→ countDraft
                         └[Revisar]→ Revisão: sistema × contado, não contados
                                        └[Aplicar contagem]→ applyCount → Armário
```

## 8. Estrutura de arquivos

```
index.html              Casca do app, carrega css e js
manifest.webmanifest    PWA: nome, ícones, cor
sw.js                   Service worker (cache do app)
css/app.css             Tokens e componentes do design system
js/app.js               Inicialização e roteador
js/db.js                Acesso ao IndexedDB
js/store.js             Regras de estoque
js/lookup.js            Open Food Facts, lojas pelo repassador e foto
js/remedios.js          Base de remédios da Anvisa: código, busca e textos
js/areas.js             Regra dos ambientes da casa
js/dates.js             Validade: leitura do que foi digitado, textos, .ics
js/consumo.js           Ritmo de consumo e lista de compras
js/photo.js             Reduz a foto antes de enviar
js/scanner.js           Câmera e decodificação
js/ui.js                Folha, aviso, seletor de quantidade, escape de HTML
js/icons.js             Ícones Phosphor (MIT)
js/sound.js             Bip de leitura e de erro
js/views/*.js           Uma tela por arquivo
data/remedios/          Base de remédios gerada por scripts/remedios.py
scripts/remedios.py     Baixa a tabela CMED e gera data/remedios/
vendor/barcode-detector Polyfill ZXing (MIT) e o .wasm
icons/                  Ícones do PWA
docs/                   Este documento, interfaces e design system
.claude/skills/         Skill no-ai-slop usada na auditoria visual
.github/workflows/      Publicação no GitHub Pages
```

## 9. Evoluções possíveis

- **Sincronizar entre celulares da casa:** trocar `db.js` por um adaptador que
  grava também em um backend simples (Supabase ou Firebase). As telas não mudam,
  porque só falam com `store.js`.
- **Conector MCP:** expor o armário ao Claude como ferramenta (hoje o app monta
  a pergunta e abre `claude.ai/new?q=`).
- **Aviso de validade no celular:** hoje o aviso aparece ao abrir o app e pelo
  lembrete `.ics` no calendário; notificação push precisaria de servidor.
- **Validade pela câmera:** feita sem IA (seção 11).

## 11. Validade pela câmera, no aparelho (`ocr.js`, `views/expiryCam.js`)

A câmera ao lado do campo de validade lê a data impressa com o Tesseract.js
(leitor de texto de código aberto, Apache-2.0) rodando no próprio celular. Não
usa internet nem a IA do repassador.

- **Arquivos:** `vendor/tesseract/` (motor LSTM em WebAssembly, com e sem SIMD,
  e o modelo `eng` 4.0.0_best_int). Uns 7 MB baixados só no primeiro uso; o
  service worker guarda em `ocr-v1` (cache primeiro) e o Tesseract guarda o
  modelo no IndexedDB. Depois funciona sem internet.
- **Imagem:** recorta só a faixa da mira (levando em conta o corte do vídeo),
  passa para cinza, junta os pontinhos da impressão a jato com desfoque em
  caixa e separa tinta de fundo pelo limiar de Otsu. Data clara em fundo
  escuro é invertida.
- **Leitura:** um bloco de texto, só números, separadores e maiúsculas.
- **Achar a data (`findExpiry` em `dates.js`):** troca meses por número (OUT,
  NOV…), corrige letras lidas no lugar de números só dentro de trechos com cara
  de data (O→0, S→5, I→1…), acha dia/mês/ano, mês/ano e, depois de "VAL", datas
  juntas (151026). Pontua: rótulo de validade (VAL, VENC, V:, EXP, CONSUMIR)
  soma; fabricação (FAB, F:, P:) e lote (L:, LOTE) subtraem; fora de 2 anos
  atrás a 10 à frente é descartada. Empate: a data mais distante.
- **Decisão:** cada quadro usa um ajuste diferente (tamanho e quanto juntar os
  pontos), começando pela imagem cheia. Aceita quando duas leituras concordam
  e, se houver discordância, a vencedora está duas à frente. Aí bipa, vibra e
  preenche o campo; a pessoa confere antes de salvar.
- **Medição:** 32 embalagens simuladas (letra comum, pontinhos de impressora a
  jato, claro sobre escuro, borrada), com lote e fabricação juntos: 30 certas,
  nenhuma errada, 2 sem resposta (pontinhos). Uns 4 quadros por data; 21 casos
  de texto real no teste de `findExpiry`.
- **Câmera emprestada:** o iPhone não abre a mesma câmera duas vezes. O leitor
  de validade avisa (`ki:camera`) e o leitor de códigos para; ao fechar, volta.
- **Texto colado:** o campo também entende texto colado ou vindo do "Escanear
  texto" do iPhone ("VAL 20/12/27 L0425" vira 20/12/2027).

## 10. Publicação

O workflow `.github/workflows/pages.yml` publica a raiz do repositório no GitHub
Pages a cada push. Passo único no GitHub: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. O endereço fica
`https://<usuario>.github.io/KeepInventory404/`.


## Nota fiscal (NFC-e)

- `GET /nfce?p=<parâmetro p do QR Code>` no Worker: valida a chave (44 números,
  começando por 43, RS), busca `dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=...`
  e devolve `{ store: { name, cnpj }, issuedAt, total, discount, key, items:
  [{ name, code, qty, unit, unitPrice, total }] }`. Resposta boa fica 30 dias em
  cache (a nota não muda); erro passageiro não é guardado.
- No app: `meta.nfceMap` guarda "CNPJ:código do mercado" → produto (aprendizado
  por mercado); `meta.notas` guarda as chaves já importadas; `product.lastPrice`
  guarda o último preço. Tudo entra no backup.
- Formato da página conferido com o projeto aberto leitor-notas-fiscais, que lê
  as notas do RS pelo mesmo endereço.
