# Armário (KeepInventory404)

Inventário do armário de comidas de casa, feito para o celular. Aponte a câmera
para o código de barras, o app descobre o que é o produto e guarda a quantidade.

## O que faz

- **Entrada:** leia o código, escolha a quantidade e toque em Adicionar.
- **Saída:** leia o código e dê baixa na quantidade que saiu.
- **Inventário:** conte o que está no armário; na revisão você vê as diferenças
  e aplica a correção de uma vez.
- **Armário:** lista com a quantidade de cada item, busca e filtros de
  "acabando" e "zerados".
- Produto desconhecido é buscado no [Open Food Facts](https://world.openfoodfacts.org);
  se não estiver lá, você digita o nome uma vez e o app lembra.
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
- Fonte: [Archivo](https://fonts.google.com/specimen/Archivo) (OFL).
