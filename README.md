# Armário (KeepInventory404)

Inventário do armário de comidas de casa, feito para o celular. Aponte a câmera
para o código de barras, o app descobre o que é o produto e guarda a quantidade.

## O que faz

- **Entrada:** leia o código, escolha a quantidade e toque em Adicionar.
- **Saída:** leia o código e dê baixa na quantidade que saiu.
- **Contagem (inventário):** conte o que está no armário; na revisão você vê as diferenças
  e aplica a correção de uma vez.
- **Armário:** lista com a quantidade de cada item, separada por ambiente
  (Cozinha, Banheiro e limpeza, Beleza e cuidados), com busca e filtros
  Acabando, Zerados e Vencendo.
- **Modo rápido:** como no caixa do mercado, cada leitura soma ou tira 1 só com
  o bip. O que o app não conhece fica em "Para resolver" até o fim.
- **Cupom:** ao concluir, a sessão sai impressa num cupom com a borda rasgada,
  que dá para compartilhar.
- **Validade (opcional):** digite como vem na embalagem (`15/10/26` ou `10/26`).
  O app avisa o que vence na semana, gasta primeiro o que vence antes e gera um
  lembrete para o calendário.
- **Compras:** lista sugerida pelo mínimo de cada produto e pelo ritmo de
  consumo, com itens soltos, compartilhar e **Perguntar ao Claude** (revisar a
  lista ou pedir receitas com o que vence).
- **Sem código de barras:** busque pelo nome ou tire uma foto da embalagem; a IA
  gratuita da Cloudflare lê a marca e o app sugere o produto das lojas.
- Bip de caixa de mercado a cada leitura (dá para desligar em Dados).
- Se um código de barras estiver em mais de um produto, o app pergunta qual
  deles você está segurando.
- Produto desconhecido é buscado ao mesmo tempo em lojas online brasileiras
  (13 supermercados e farmácias) e no [Open Food Facts](https://world.openfoodfacts.org).
  Se ninguém achar, o campo de nome sugere produtos das lojas enquanto você digita.
  Uma vez cadastrado, o app lembra.
- Funciona sem internet depois da primeira abertura (só a busca de produto novo
  precisa de rede). Backup em arquivo e exportação para planilha.

## Como abrir no celular

1. No GitHub, vá em **Settings → Pages → Build and deployment** e escolha
   **Source: GitHub Actions** (só uma vez).
2. Em **Actions**, rode o workflow **Publicar no GitHub Pages** (ou faça um push).
3. Abra `https://gadrs377.github.io/KeepInventory404/` no celular e permita a câmera.
4. Para virar app: Android (Chrome) menu → **Instalar app**; iPhone (Safari)
   **Compartilhar → Adicionar à Tela de Início**.

Os dados ficam no próprio celular. Use **Dados → Baixar backup** de vez em
quando, e **Restaurar backup** para passar para outro aparelho.

## Documentação

- [System design](docs/SYSTEM_DESIGN.md): arquitetura, dados, regras de estoque e fluxos.
- [Interfaces](docs/INTERFACES.md): plano de cada tela e como elas se ligam.
- [Design system](docs/DESIGN_SYSTEM.md): cores, tipografia, componentes e escrita.

## Repassador (pasta `worker/`)

Um Cloudflare Worker grátis consulta as lojas, que não deixam o navegador
consultar direto. Ele é publicado sozinho pelo GitHub Actions
(`.github/workflows/worker.yml`) com os segredos `CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID`. Teste local: `cd worker && node test/local.mjs`.
Diagnóstico das lojas: `https://keepinventory-api.gabriel-gadrs377.workers.dev/diag`.

## Rodar no computador

Qualquer servidor estático serve, por exemplo:

```sh
npx http-server -p 8080 .
```

Abra `http://localhost:8080`. A câmera funciona em `localhost`; em outro
endereço precisa de HTTPS.

## Créditos

- Leitura de código de barras: [barcode-detector](https://github.com/Sec-ant/barcode-detector)
  e [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT), em `vendor/`.
- Dados de produtos: [Open Food Facts](https://world.openfoodfacts.org) (ODbL).
- Fontes: [Urbanist](https://fonts.google.com/specimen/Urbanist) e
  [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk) (OFL).
- Ícones: [Phosphor](https://phosphoricons.com) (MIT).
- Skills de design em `.claude/skills/` (todas MIT):
  [jakubkrehel/skills](https://github.com/jakubkrehel/skills) (better-ui,
  better-layout, better-writing, better-interface e outras),
  [make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better),
  [liquid-glass](https://github.com/Armitanemati/liquid-glass-claude-skill),
  [unslop-ui-skill](https://github.com/claudiusararu/unslop-ui-skill) e
  [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
  (biblioteca de regras de UX e de componentes, ver `.claude/skills/ui-ux-pro-max/ORIGEM.md`).
  Relatório da revisão em [docs/REVISAO_INTERFACE.md](docs/REVISAO_INTERFACE.md).
