# Roadmap

Ideias combinadas para depois. Nada aqui está feito; cada item diz o problema,
o que já foi decidido e as opções a avaliar antes de construir.

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
