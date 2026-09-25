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
| Ler código de barras pela câmera | `BarcodeDetector` nativo, com polyfill ZXing em WebAssembly |
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

## 3. Modelo de dados (IndexedDB `keepinventory`, versão 1)

### `products` (chave: `code`)

| Campo | Tipo | Observação |
| --- | --- | --- |
| `code` | string | Código de barras (EAN-13, EAN-8, UPC). Itens sem código usam `SEM-<timestamp>` |
| `name` | string | Nome exibido. Vem do Open Food Facts ou é digitado |
| `brand` | string | Marca, opcional |
| `size` | string | Conteúdo da embalagem, ex. `395 g` |
| `image` | string | URL da foto pequena da embalagem, opcional |
| `qty` | inteiro ≥ 0 | Unidades no armário. Nunca negativo |
| `minQty` | inteiro ≥ 0 | Abaixo ou igual a isso o item aparece como "acabando". 0 desliga o aviso |
| `source` | `off` \| `manual` | De onde veio o cadastro |
| `createdAt`, `updatedAt` | número (ms) | |

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

1. Procura o código em `products`. Se existe, usa os dados locais e **não**
   consulta a internet.
2. Se não existe, chama
   `GET https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,product_name_pt,brands,quantity,image_front_small_url`
   com tempo limite de 8 segundos.
3. `status: 1` preenche nome (prefere `product_name_pt`), marca, tamanho e foto.
4. Não achou, deu erro ou está offline: a folha de cadastro abre com o campo de
   nome vazio e em foco. O código fica guardado para as próximas leituras.
   Se o problema foi rede, a folha mostra **Buscar de novo**.

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
- **Pausa ao ler:** ao aceitar um código, o leitor pausa, vibra (quando o
  aparelho permite) e abre a folha do produto. Volta a ler quando a folha fecha.
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
Armário ─[Saída]→ Leitor (beterraba) ─código→ produto existe e qty > 0?
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
js/views/*.js           Uma tela por arquivo
vendor/barcode-detector Polyfill ZXing (MIT) e o .wasm
icons/                  Ícones do PWA
docs/                   Este documento, interfaces e design system
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
