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

## 3. Modelo de dados (IndexedDB `keepinventory`, versão 2)

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
| `qty` | inteiro ≥ 0 | Unidades no armário. Nunca negativo |
| `minQty` | inteiro ≥ 0 | Abaixo ou igual a isso o item aparece como "acabando". 0 desliga o aviso |
| `source` | `off` \| `loja` \| `manual` | De onde veio o cadastro |
| `createdAt`, `updatedAt` | número (ms) | |

Versão 2 do banco. A migração da versão 1 cria o índice `barcodes` e preenche
`barcodes = [code]` em cada produto existente, sem mexer em quantidades nem no
histórico.

### `movements` (chave: `id` autoincremento; índices `code`, `at`)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `code` | string | Produto afetado |
| `type` | `entrada` \| `saida` \| `ajuste` \| `contagem` | Origem do movimento |
| `delta` | inteiro | Positivo soma, negativo subtrai |
| `qtyBefore`, `qtyAfter` | inteiro | Permite auditar e desfazer |
| `at` | número (ms) | Momento do registro |

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
| `undoMovement(id)` | Desfaz só se for o último movimento do produto; volta `qty` para `qtyBefore` e apaga o movimento |

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
   Cada consulta tem tempo limite (9 s e 8 s).
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
| `GET /lookup?ean=` | Consulta 13 lojas em paralelo e devolve a primeira que achar | 7 dias (não encontrado: 1 dia) |
| `GET /search?q=` | Busca por nome em 3 supermercados e 1 farmácia, intercala, remove repetidos e mantém só o que contém as palavras digitadas | 1 dia |
| `GET /diag` | Testa cada loja a partir da Cloudflare | sem cache |

- Só consulta a lista fixa de lojas (não é um proxy aberto) e só responde a
  chamadas de navegador vindas do endereço do app (`ALLOWED_ORIGINS`).
- Se identifica como `KeepInventory404 (inventario domestico pessoal)`.
- Plano grátis: 100 mil requisições por dia. A conta não tem cartão, então nunca
  há cobrança; se o limite estourar, o app cai para Open Food Facts e nome.
- Publicação: `.github/workflows/worker.yml`, com os segredos
  `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
- Busca não oficial: se uma loja mudar ou bloquear, as outras continuam.
  `/diag` mostra quais respondem.

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

## 7. Fluxos

### Entrada

```
Armário ─[Entrada]→ Leitor (verde) ─código→ busca ─→ Folha do produto
                                                      │ quantidade (1..999)
                                                      └[Adicionar N]→ addStock
                                                            → aviso "Agora: X" + Desfazer
                                                            → leitor volta a ler
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
js/lookup.js            Open Food Facts
js/scanner.js           Câmera e decodificação
js/ui.js                Folha, aviso, seletor de quantidade, escape de HTML
js/icons.js             Ícones Phosphor (MIT)
js/sound.js             Bip de leitura e de erro
js/views/*.js           Uma tela por arquivo
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
- **Validade:** guardar lotes com data de validade em `movements` de entrada.
- **Lista de compras:** gerar a partir dos itens com `qty ≤ minQty`.

## 10. Publicação

O workflow `.github/workflows/pages.yml` publica a raiz do repositório no GitHub
Pages a cada push. Passo único no GitHub: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. O endereço fica
`https://<usuario>.github.io/KeepInventory404/`.
