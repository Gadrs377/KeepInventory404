# Modo Mercado

Proposta de design, **ainda não implementada**. A pessoa fotografa a etiqueta
de preço na gôndola e, quando sai a nota, o app confere se algo foi cobrado
mais caro. O módulo fica dentro de **Compras**.

Pranchas (feitas dentro do app real, 393 × 852):
[A, ler etiquetas](modo-mercado/prancha-A.webp) ·
[B, casos da etiqueta](modo-mercado/prancha-B.webp) ·
[C, conferência](modo-mercado/prancha-C.webp) ·
[D, caixa e depois](modo-mercado/prancha-D.webp)

## 1. Por que funciona (base de comportamento)

| Princípio | Como entra no fluxo |
|---|---|
| **Fogg, B = MAP** (motivação, capacidade, gatilho) | A motivação já existe (não pagar a mais). O trabalho é aumentar a capacidade: um toque por etiqueta, sem formulário. O gatilho vem na hora certa: "Ler a nota" aparece quando a compra está aberta. |
| **Aversão à perda** | O resultado fala em "R$ 4,30 cobrados a mais", não em "diferença de preço". Perder dói mais do que ganhar alegra. |
| **Pico e fim** | A lembrança da compra é o pior momento e o último. O último é sempre bom: "Tudo certo" ou "R$ 2,00 de volta", e o total já recuperado. |
| **Zeigarnik** | A compra sem nota fica como cartão "esperando a nota" em Compras. Tarefa aberta puxa a pessoa de volta, sem notificação. |
| **Padrões e pré-preenchimento** | Nome, preço e tipo vêm da foto. A pessoa só corrige. |
| **Perguntar uma vez, no momento certo** | O cartão do mercado é perguntado na primeira etiqueta que mostra preço de cartão, e só uma vez por loja. |
| **Esforço justo** | Ninguém precisa fotografar tudo. Só o que a pessoa quer conferir: promoção, item caro, preço que parece estranho. |

Da Apple (HIG): uma ação principal por tela; retorno por vários canais (realce
no preço, som curto, vibração, linha nova no cupom); nada de alerta modal para
o que pode ser desfeito; divulgação progressiva (os itens que batem ficam
recolhidos em "Ver os 11"); cor só como reforço, nunca como única pista
("+2,00" tem sinal e rótulo).

Fricção e redundância:

- não pede o nome do produto se a etiqueta já tem;
- não pede o código de barras: usa só quando a etiqueta mostra;
- não pergunta o peso duas vezes: o queijo vira "preço por quilo" e quem resolve é a nota;
- não pede para escolher a loja: vem da nota;
- não mostra histórico de preço (o app da Sefaz já faz isso).

## 2. Fluxo

```
Compras ──"No mercado"──► Leitor de etiquetas ──► (cupom vivo de etiquetas)
                               │
                               ├─ etiqueta lida ao vivo ─► cartão + linha no cupom
                               ├─ não leu ao vivo ──────► foto parada + "Preço da etiqueta"
                               └─ "Ler a nota" ─────────► QR da NFC-e ─► Conferência
                                                                           │
             (sem nota agora) ◄── fechar ── compra pendente em Compras ◄───┘ depois
                                                                           │
                                       Cobrado a mais ─► "Mostrar no caixa" ─► Recuperado
```

O leitor segue o fluxo da leitura de validade
([LEITURA_VALIDADE.md](LEITURA_VALIDADE.md)): câmera ao vivo, realce em cima
do que foi lido, desistência honesta com a melhor foto ao lado do campo de
digitar, e a linha nova entrando no cupom.

### Telas

| # | Tela | O que resolve |
|---|---|---|
| A1 | Compras com a pílula **No mercado** e a dica "Pagou mais que a etiqueta?" | Entrada. A dica só aparece até a primeira compra. |
| A2 | Lendo o preço | Realce estilo Texto ao Vivo no preço, contador de etiquetas na faixa. |
| A3 | "Você usa o cartão?" | Aparece só na primeira etiqueta com preço de cartão. "Pergunto só uma vez." |
| A4 | Etiqueta lida | Cartão com o preço que vale para a pessoa e o cupom com o total. |
| B1 | Peso | "R$ 49,90 o quilo", selo **Preço por quilo**. A nota diz quanto pesou. |
| B2 | Leve 3, pague 2 | Selo da promoção e quantidade; a linha do cupom já mostra o total da regra. |
| B3 | Digitar | Quando não leu ao vivo: foto parada, preço grande pré-preenchido, Unidade / Quilo / Leve mais. |
| B4 | Limite | Barra opcional no rodapé do cupom: "Faltam R$ 35,70". Fica amarela perto do fim; sem alerta. |
| C1 | Ler a nota | QR da NFC-e ou colar o link. |
| C2 | Cobrado a mais | Veredito no topo, depois os itens a mais, as dúvidas e os que batem, recolhidos. |
| C3 | Tudo certo | Fim bom e curto. |
| C4 | Provavelmente certo | Desconto no fim da nota cobre a diferença: não acusa à toa. |
| D1 | Mostrar no caixa | Tela de alto contraste para virar para o atendente: foto da etiqueta, os dois preços e a lei. |
| D2 | Recuperado | "R$ 2,00 de volta" e o total já recuperado. |
| D3 | Compra pendente | Cartão em Compras: "Compra de hoje esperando a nota". |
| D4 | Escuro | A conferência no tema escuro, com a pergunta "É o mesmo produto?". |

## 3. As variáveis, uma por uma

**Cartão Zaffari e clubes.** A etiqueta pode ter dois preços. A primeira vez
que aparece um preço de cartão naquela loja, o app pergunta se a pessoa usa o
cartão (A3) e guarda a resposta por loja. Depois disso escolhe sozinho e mostra
o outro preço em letra pequena ("com cartão. Sem: R$ 18,90"). Na linha do
cupom, toque corrige.

**Desconto só no fim da nota.** O Zaffari às vezes cobra o preço cheio no item
e dá o desconto do cartão no total. A NFC-e só traz o desconto agregado. Por
isso: se a soma das diferenças for menor ou igual ao desconto do fim, o
resultado é **Provavelmente certo** (C4), com a explicação. Se passar, conta só
o que sobra.

**Peso.** Etiqueta em quilo vira linha "49,90/kg" sem quantidade. Na
conferência compara o preço unitário da nota (R$/kg) com o da etiqueta. Não
pergunta peso nunca.

**Leve mais, pague menos.** O selo guarda a regra (3 por 2, 2ª unidade 50%).
Na conferência compara o total das unidades, não cada linha, porque o
supermercado pode lançar o desconto em linha separada.

**Código de barras.** Quando a etiqueta mostra o código (algumas mostram), o
app usa para casar com a nota. Não pede para escanear o produto. A nota real
do Zaffari veio **sem** código nos itens, então o casamento principal é outro
(abaixo).

**Casar etiqueta com a nota.** Nome da nota é abreviado
("CAFE MELITTA TRAD 500G"). O app casa por palavras do nome, tamanho
(500G, 5KG, 1L) e preço próximo. Três saídas:

1. certeza: entra direto em Batem ou Cobrado a mais;
2. dúvida: vai para **Confira**, com "É o mesmo produto?" e os dois nomes lado a lado (uma pergunta por item, uma vez só);
3. sem par: a etiqueta não achou item na nota. Aparece recolhida ("não veio na nota") e não conta.

Itens da nota sem foto não são problema: "3 itens da nota não tinham foto.
Tudo bem."

**Limite (orçamento).** Opcional, ligado pelo menu do leitor. A barra só
aparece se a pessoa ligar. Sem toast, sem vibração forte: muda de cor e o
texto diz quanto falta. Passou do limite, o texto diz quanto passou. O valor
é a soma das etiquetas; itens sem foto ficam fora, e o rodapé diz isso.

**Quando conferir.** Quando a pessoa quiser: ainda no caixa, no carro, em
casa. Fechar o leitor sem nota deixa a compra pendente (D3). Ao ler uma nota
pelo leitor normal de cupons, se há compra pendente da mesma loja e do mesmo
dia, o app oferece conferir.

**Mostrar no caixa.** Lei 10.962/2004, art. 5º: havendo preços diferentes
para o mesmo produto, vale o menor. A tela D1 cita a lei em uma linha e mostra
a foto da etiqueta. Botões: **Devolveram a diferença** (soma no recuperado) e
**Fechar**.

**Depois da conferência.** "Guardar no armário" leva os itens da nota para o
estoque, como já faz a leitura de cupom. A conferência fica guardada no cupom
daquela compra.

## 4. Fotos: por quanto tempo

As fotos ficam só no aparelho e nunca vão para o catálogo compartilhado.

| Situação | Prazo |
|---|---|
| Etiqueta que bateu com a nota | Apaga ao conferir. Fica só o texto lido. |
| Etiqueta com diferença | Guarda até marcar "Devolveram a diferença" ou por **30 dias** (prazo do CDC, art. 26, I, para reclamar de produto não durável). |
| Compra que nunca recebeu nota | Apaga em **3 dias**, com aviso no cartão pendente no último dia. |

As fotos guardadas são reduzidas (lado maior de 1280 px, WebP), o que deixa
cada uma perto de 100 KB.

## 5. Roadmap do módulo

**Agora (v1):** tudo acima, só para o Zaffari (RS, NFC-e com chave 43).

**Depois:**

1. **Ideia B: carrinho completo.** Registrar todo item que entra no carrinho
   (foto da etiqueta ou do produto), com o total andando em tempo real. Dá o
   valor da compra antes do caixa e deixa o limite exato. Fica para depois
   porque pede um gesto por item; a v1 mede se as pessoas topam o gesto em
   poucas etiquetas.
2. **Aprender os nomes da loja.** Cada "É o mesmo" confirmado ensina o par
   nome da etiqueta → nome da nota daquela rede. Na segunda compra, a dúvida
   some. Fica no aparelho; compartilhar só se for anônimo e com consentimento.
3. **Outras redes.** Ler os formatos de etiqueta e de clube de cada uma
   (Nacional, Carrefour, Asun, Unidasul…) e a regra de onde cai o desconto.
4. **Outros estados.** Leitura de NFC-e fora do RS.
5. **Leve-mais mais espertos.** "2ª unidade 50%", "a partir de 3", preço por
   atacado.
6. **Resumo do mês.** Quanto foi recuperado e em que loja mais apareceu
   diferença, sem virar histórico de preço.

## 6. Antes de implementar

- Fotos reais de etiquetas do Zaffari (com e sem Cartão Zaffari, de quilo, de
  leve-mais) **junto com a nota da mesma compra**, para afinar a leitura e o
  casamento de nomes.
- Aprovação das telas e das decisões das seções 3 e 4.
