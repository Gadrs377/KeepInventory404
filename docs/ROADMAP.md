# Roadmap

Ideias combinadas para depois. Nada aqui está feito; cada item diz o problema,
o que já foi decidido e as opções a avaliar antes de construir.

## Como decidimos (30/09/2026)

- **O app está sendo feito agora.** Reaprender a usar não é custo: se uma ideia
  melhor pedir para mudar uma tela inteira, ou o app inteiro, muda. Uma
  proposta não perde pontos por ser diferente do que existe.
- **O botão "Validade" no topo do Armário não é requisito.** Foi uma ideia do
  momento; pode sair de lá ou mudar de lugar se o desenho novo pedir.

## Câmera nova (em discussão)

Um lugar só para tudo o que se lê (Entrada, Saída, Validade, Contar, nota
fiscal), com a câmera na tela inteira. Primeiro desenho e a crítica dele na
conversa de 30/09/2026. O que já pesa na decisão:

- **Entre ler o código e ler a data a pessoa vira o produto.** A data quase
  nunca está na mesma face do código. Na telemetria de 30/09 (27 produtos em
  17 minutos), a data apareceu de 0,9 s (mesma face) a 6 s depois do código;
  metade em até 3 s. A tela não pode exigir nada nesse intervalo. (As datas
  vencidas lidas naquela noite estavam certas: eram produtos vencidos mesmo.)
- **Troca de modo sem querer é o erro mais caro** (guardar vira tirar, em
  silêncio). Trocar de modo só com toque, nunca arrastando a imagem.

## Fluxo do código de barras (em discussão, 30/09/2026)

**Problema.** Com as fontes novas, um código novo leva uns 4–5 s, e quando
ninguém acha leva até 17 s. O repassador busca em fila: lojas (espera a mais
lenta desistir, até 5 s), depois catálogos, depois web; e procura a foto antes
de responder.

**Decidido até aqui:**

- **Mais rápido:** tudo o que é grátis começa junto (catálogo próprio, lojas,
  catálogos de código); a web entra quando esses falharem ou aos ~2,5 s; prazo
  menor para loja lenta (medir o tempo de cada uma na telemetria); o nome
  responde na hora e a foto chega depois.
- **Não achou:** as opções aparecem assim que lojas e catálogos falham (~2,5 s),
  sem esperar a web: **"Fotografar a frente da embalagem"** (principal) e
  "Digitar o nome". Se a web achar enquanto isso, aparece "Achei na internet:
  X · É esse?".
- **A imagem da leitura do código não serve:** a embalagem está de costas.
  A foto tem de ser da frente, tirada de propósito.
- **Foto → IA → lojas:** a IA lê nome, marca e tamanho e procura nas lojas;
  "Usar o que a IA leu" fica por último na lista. Ao editar o nome de algo que
  veio dessa busca, aparece "Usar o que a IA leu na embalagem".
- **A foto da frente vira a foto do produto só no celular de quem tirou.**
  Nunca vai para o catálogo compartilhado (LGPD).
- **Nomes da comunidade.** O nome resolvido pela foto vai para o catálogo com a
  marca "comunidade" (não veio de base confiável). Quem ler o mesmo código
  depois vê o nome com essa marca e confirma ou nega, como no Waze; os votos
  decidem se o nome fica. Fonte confiável que aparecer depois (loja, catálogo)
  passa na frente.

## Produtos com várias unidades na embalagem

Exemplos: cápsulas de café (caixas de 10, 12 ou 15), sachês, iogurte em
bandeja, fardo de água.

**Problema.** Só a caixa tem código de barras. As unidades de dentro não têm, e
a caixa muitas vezes vai para o lixo logo depois da compra, com as unidades
guardadas soltas. Se o app conta caixas, a baixa da caixa zera o estoque com o
armário cheio. Se conta unidades, alguém precisa registrar cada uso.

**Decidido.** Registrar cada uso não funciona para a casa: ninguém vai abrir o
app a cada cápsula, e o estoque fica errado. A baixa tem de acontecer num
momento fácil de lembrar, que é **quando algo vai para o lixo**.

**Opções a avaliar:**

1. **"Solto" até a última unidade.** Ao ler a caixa na Saída, o app pergunta
   "A caixa foi vazia para o lixo, ou as cápsulas ficaram soltas?". Se ficaram
   soltas, o produto continua no armário marcado como "solto" (sem código), e a
   baixa acontece quando a última unidade acaba, pelo "−" da linha ou pela busca
   por nome, que já existem. Uma baixa por embalagem, sempre no descarte.
2. **Unidades por embalagem, por código de barras** (como o Grocy, que separa a
   unidade de compra da unidade de estoque: 1 caixa de 6 ovos vira 6 ovos). Cada
   código lembra quantas vêm (10, 12, 15), o estoque é contado em unidades e a
   lista de compras sugere em caixas. Mais preciso, mas depende de registrar os
   usos; por isso ficou para depois.
3. **Estimativa pelo ritmo de consumo.** O app já calcula quanto vocês usam por
   semana. Para esses produtos, ele poderia estimar o que resta ("deve ter umas
   4 cápsulas") e pedir só uma confirmação de vez em quando, sem registrar cada
   uso.

Referências: [Grocy, unidades de compra e de estoque](https://github.com/grocy/grocy-docs/blob/master/tutorials/food.md);
[mudança para conversões por produto](https://grocy.info/changelog).

## Outras ideias em aberto

- **Os dois celulares com o mesmo armário.** Hoje cada celular guarda o seu.
  Sincronizar por um banco grátis da Cloudflare (D1) junto do Worker que já
  existe.
- **Nota fiscal do Zaffari.** Testar com um cupom real para ver se o "código" da
  nota é o código de barras (entraria direto) ou um código interno (o app
  aprende na primeira compra). Testar também a leitura do QR Code pela câmera.
- **Notas de outros estados.** Hoje só notas do RS (portal da SVRS).
- **Quantidade padrão por produto** (ex.: sempre entram 2) e **mínimo sugerido
  pelo consumo** (o app propõe o "avisar com" pelo ritmo de uso).

## Pendências de layout (revisão de 30/09/2026)

Achadas na revisão de layout do app inteiro, a decidir. Medido em 320, 375 e
393 px e com letra grande.

- **Linhas do cupom no leitor não parecem tocáveis.** Tocar numa linha (Entrada
  e Saída) abre a edição, mas ela parece só a linha impressa de um cupom.
  Opções: um lápis discreto no fim da linha, ou "Toque para corrigir" na
  primeira vez.
- **Lista de Cupons (em Mais) sem seta.** Tocar abre o cupom, mas a linha não
  tem a seta › das linhas que abrem algo.
- **Leitor › editar linha, em 320 px:** "Salvar" passa 2 px da borda de baixo.
  Resolve com o mesmo `.sheet-sticky` dos outros formulários.
- **Espaços fora da grade de 4 px.** 112 de 427 valores de espaço em
  `css/app.css` (10 px 45 vezes, 6 px 36, 14 px 18). Não quebra nada; arrumar
  aos poucos, nas telas que forem mexidas.
- **2 propriedades físicas** (esquerda/direita) no CSS, em vez das lógicas.
  Sem efeito hoje (o app é só em português).
