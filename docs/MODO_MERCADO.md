# Modo Mercado (proposta v3)

Proposta de fluxo, **ainda não implementada**. A pessoa fotografa a etiqueta
de preço e, quando sai a nota, o app confere se algo foi cobrado mais caro. O
módulo fica dentro de **Compras**.

A v2 refez a v1 com pesquisa de comportamento. A v3 refaz a v2 com pesquisa
de interação: escaneamento profissional, tempos de resposta, desfazer contra
confirmar, avisos que somem, interrupções, som e uso andando. A aparência
ainda vai ser trabalhada; o foco é o fluxo e as decisões.

Pranchas da v3:
[G, no corredor](modo-mercado/prancha-G.webp) ·
[H, corrigir, caixa e conferência](modo-mercado/prancha-H.webp).
Da v2 continuam valendo a entrada (E1), o atendimento (F3) e a próxima ida
(F4), em [E](modo-mercado/prancha-E.webp) e [F](modo-mercado/prancha-F.webp).
Da v1, o valor recuperado ([D](modo-mercado/prancha-D.webp)).

## 0. Rodada 5 (qualquer mercado):

- Neogrid e Opinion Box (2025), [fidelidade em supermercados](https://mercadoeconsumo.com.br/09/05/2025/supermercados/sete-em-cada-dez-brasileiros-participam-de-programas-de-fidelidade-de-supermercados/).
- Idec, [preço da gôndola diferente do caixa](https://idec.org.br/consultas/dicas-e-direitos/supermercados-o-que-fazer-quando-o-preco-da-gondola-e-diferente-do-que-aparece-no-caixa).
- [Reclame Aqui: oferta só do app não aplicada](https://www.reclameaqui.com.br/supermercados-mundial/falta-de-aplicacao-do-desconto-anunciado-na-etiqueta-e-falta-de-cumprimento-da-lei-do-consumidor_VNDfay2d9jeV5R1H/).
- [Procon Jundiaí, 2026](https://tribunadejundiai.com.br/economia/procon-jundiai-fiscalizacao-supermercados-direitos-consumidor-2/).
- [Estado de Minas, 04/08/2026](https://www.em.com.br/emfoco/2026/08/04/sem-foto-da-etiqueta-que-provasse-o-preco-da-gondola-e-com-a-fila-crescendo-no-caixa-paulo-tecnico-de-manutencao-de-45-anos-pagou-a-diferenca-por-3-itens-e-so-no-estacionamento-entendeu-entre-o/).
- NFC-e pela Sefaz Virtual do RS: [lançamento nacional](https://www.legisweb.com.br/noticia/?id=9719), [Sefaz-CE](https://www.coad.com.br/home/noticias-detalhe/131800/sefaz-ce-esclarece-sobre-a-autorizacao-da-nota-fiscal-de-consumidor-eletronica), [SEF-SC](https://sef.sc.gov.br/api-portal/Documento/Ver/6351).
- Lei 13.455/2017 (preço diferente por forma de pagamento, com condição visível).

Rodada 4 (comportamento):

- Michie, van Stralen e West (2011), modelo COM-B.
- Karlsson, Loewenstein e Seppi (2009), [efeito avestruz](https://www.cmu.edu/tepper/faculty-and-research/assets/docs/ppaper-61264983153898-ostrich-effect-1.pdf); réplica com resultado diferente: [efeito suricato](https://openaccess.city.ac.uk/id/eprint/3875/1/The%20meerkat%20effect.pdf).
- Sunstein, *Sludge* ([resumo](https://www.behavioraleconomics.com/resources/mini-encyclopedia-of-be/sludge/)).
- Orgulho de pegar oferta: [Schindler, Rutgers](https://camden.rutgers.edu/news/blame-it-genetics); [Rhee, smart shopper feeling](https://iastatedigitalpress.com/itaa/article/2711/galley/2584/view).
- Kahneman, Knetsch e Thaler (1986), justiça como restrição ao lucro.
- Lally et al. (2010), formação de hábitos no mundo real.
- Bandura (1977), autoeficácia.

Rodada 3: interação, fricção e retorno

### O que a pesquisa mostrou

| Achado | Fonte | O que muda |
|---|---|---|
| Leitores profissionais de código deixam a **lista** como tela principal. A câmera é uma **prévia pequena** que só abre ao apertar um **botão grande** de gatilho, ao alcance do polegar, e some depois de ler. | Scandit SparkScan (documentação e estudo de ergonomia) | Na v2 a câmera ocupava metade da tela o tempo todo. Agora a lista manda; a câmera só aparece quando a pessoa pede. |
| Apertar e **segurar** o gatilho lê várias seguidas; um toque lê uma. A câmera entra em espera sozinha para poupar bateria. | Scandit SparkScan | Um toque por etiqueta; segurar para um corredor de ofertas. |
| Quando há vários códigos no quadro, um **mirador** escolhe só o do centro. | Scandit (modo alvo); Apple VisionKit, que realça o que reconhece e deixa tocar para escolher | Gôndola tem etiquetas lado a lado. Só a do meio é lida; as vizinhas aparecem apagadas e podem ser tocadas. |
| Mesmo código lido de novo em poucos segundos não conta como novo. | Scandit | Etiqueta repetida não duplica a linha. |
| Até **0,1 s** parece instantâneo; até **1 s** não quebra o raciocínio; até **10 s** a pessoa ainda espera, desde que veja o andamento. | Nielsen, tempos de resposta | Realce na etiqueta antes de 0,1 s; preço na lista antes de 1 s; depois disso, a causa (“reflexo”) e a saída. |
| Abaixo de **400 ms** nem a pessoa nem o sistema esperam um pelo outro. | Limiar de Doherty (Laws of UX) | A câmera fica aquecida uns 20 s depois de cada leitura, para o próximo toque ser imediato. |
| Pedir confirmação para tudo ensina a confirmar sem ler. **Desfazer** funciona melhor: a ação acontece e o erro é corrigido depois. | Artigos de UX sobre confirmação e desfazer | Nada de “Confirmar” por etiqueta. A correção fica na própria linha. |
| Aviso que some sozinho com botão dentro (“Desfazer” num toast) falha em acessibilidade: some antes de alguém alcançar, e o leitor de tela não anuncia o botão. | WCAG 2.2.1 e 4.1.3; Scott O'Hara; Adrian Roselli | A pílula do que foi lido só informa. **Corrigir** fica na linha, sem prazo. |
| Janela por cima interrompe; quase sempre aparece na hora errada. | Nielsen Norman, sobre sobreposições | A pergunta do cartão vira uma linha no topo da lista e não para a leitura. |
| Um bom padrão poupa uma pergunta. Cada pergunta a mais é carga mental. | Shopify, carga cognitiva; artigos sobre padrões inteligentes | A conferência deduz se a pessoa ainda está na loja pela hora da nota, em vez de perguntar. |
| Tecnologia calma pede o **mínimo de atenção** e informa pela **periferia**. | Amber Case, Calm Technology | Avisos como “Peça a notinha” aparecem no fim da lista, sem alerta nem toast. |
| Toda microinteração tem gatilho, regras, retorno e ciclos/modos. | Dan Saffer, *Microinteractions* | Cada passo da seção 5 foi desenhado com os quatro. |
| Quanto mais perto da meta, mais a pessoa quer completar. | Efeito do gradiente de meta | A barra “5 de 6” da lista continua. |
| Andando, a pessoa erra mais o toque; alvos maiores compensam. Ler texto andando continua difícil. | Wobbrock e colegas, impedimentos situacionais | Gatilho grande, linhas de 56 px, preços maiores, textos curtos. |
| O primeiro Scan & Go do Walmart foi abandonado porque as pessoas não entenderam o app. O que elas gostaram foi de acompanhar o gasto. | Boston Globe, Retailwire | Uma ação principal só: o gatilho. O gasto fica para o carrinho completo (seção 6). |
| Som curto confirma que algo aconteceu e fecha o ciclo; som de sucesso deve ser estável e discreto, guardando o mais rico para o fim. | Material Design, som | Clique curto na leitura; som mais cheio só no “Tudo certo” e no “Devolveram”. |
| Atrito bom só onde a ação é irreversível ou de alto risco. | Artigos sobre atrito bom (UXPin, Hackernoon) | Só uma confirmação no módulo: apagar uma compra com diferença ainda não resolvida. |

### A crítica da v2

1. **A câmera ocupava a tela à toa.** No mercado, a pessoa passa muito mais
   tempo andando do que lendo etiqueta. Câmera aberta o tempo todo gasta
   bateria, esquenta o celular e disputa atenção com a lista.
2. **Lia sozinha, sem intenção.** Com leitura automática, qualquer etiqueta
   que passasse na frente entraria, inclusive a vizinha.
3. **O “Desfazer” sumia.** Era um botão dentro de uma pílula temporária.
   Quem não alcançou a tempo perdia o jeito fácil de corrigir.
4. **A pergunta do cartão tapava a câmera.** Era um cartão no lugar da
   leitura: interrompia justamente quando a pessoa queria ler a próxima.
5. **Perguntava o que dava para deduzir.** “Ainda está no Zaffari?” tem
   resposta na hora da nota.
6. **“Peça a notinha” dependia de um botão.** Se a pessoa fosse direto ao
   caixa sem tocar **Fui pro caixa**, nunca via o lembrete.
7. **Retorno sem tempo definido.** A v2 dizia o que mostrar, mas não quando.
   Sem prazo, “lendo…” pode durar o que quiser.

### O que muda na v3

| Antes (v2) | Agora (v3) |
|---|---|
| Câmera em cima, lista embaixo, sempre | Lista na tela toda; botão **Etiqueta** grande no canto do polegar, no mesmo lugar do “Ler” do app |
| Leitura automática de qualquer etiqueta | Toque = uma leitura; segurar = várias; só a etiqueta do mirador |
| Pílula com Desfazer | Pílula só informa; a linha da lista acende e tem **Corrigir** sem prazo |
| Cartão de pergunta no lugar da câmera | Linha no topo da lista; a linha mostra os dois preços até a resposta |
| “Ainda está no Zaffari?” | A hora da nota decide o botão principal; a outra opção vira um link |
| Lembrete da notinha só no botão | Também aparece sozinho no fim da lista, quando faltam 1 ou 2 itens |
| “Lendo…” sem prazo | Tempos de 0,1 s, 1 s, 4 s e 10 s (seção 5) |

## 1. O que a pesquisa mostrou

| Achado | Fonte | O que muda no fluxo |
|---|---|---|
| Menos da metade das pessoas lembra o preço de um item **segundos** depois de pô-lo no carrinho. | Dickson e Sawyer, 1990 | Sem foto não há prova. A foto é o centro, não um extra. |
| Itens em **oferta** erram mais, e quase **2/3** desses erros são cobranças a mais. Fora de oferta, só 1/3. | FTC, Price Check, 1996–98 | Dizer à pessoa o que vale fotografar: ofertas e o que for caro. |
| Em São Paulo, de **4% a 24%** dos produtos conferidos passaram mais caros no caixa, e todos os erros foram para cima. | Idec, 2014 | O problema é real no Brasil e, aqui, sempre contra o consumidor. |
| **67%** viram erro na nota no último ano; **67%** conferem a nota ao sair da loja, o resto em casa. | Dalhousie, 2023 | A conferência mais comum é na saída, mas o caixa já ficou para trás. |
| Mais da metade não reclama por **vergonha**; 60% acha que não adianta e 58% acha trabalhoso. | LegalShield, 2026; The Scotsman | Resolver tem custo social. O app precisa tirar a vergonha e o trabalho. |
| Fazer um plano “quando X, faço Y” aumenta muito a chance de agir (efeito d = 0,65 em 94 testes). | Gollwitzer e Sheeran, 2006 | Ligar a ação a um lugar: “na próxima ida, passe no atendimento”. |
| Alarme falso derruba a confiança mais do que alarme que falta. | Pesquisas de automação (efeito “lobo”) | Só acusar com certeza. Na dúvida, perguntar. |
| Total em tempo real faz quem tem orçamento gastar **mais** (até o limite, e mais feliz) e quem não tem gastar **menos**. | van Ittersum et al., Journal of Marketing, 2013 | O limite só faz sentido com o total de verdade (ver seção 6). |
| O Zaffari só imprime a nota se o cliente pedir. | Baguete; Ajuste SINIEF 19/16 | Sem papel não há QR. Lembrar no momento certo: no caixa. |
| No Rio, 300 lojas dão o produto **de graça** se o preço divergir e o cliente avisar na hora. | Campanha “De Olho no Preço” | Não vale para o RS, mas mostra que resolver na hora rende mais. |
| 49% usam o celular com uma mão só; a outra empurra o carrinho. | Hoober, 2013 | Leitura sozinha, sem botão de foto; tudo ao alcance do polegar. |
| No iPhone, um app instalado na tela inicial pode pedir de novo a câmera a cada troca de rota. | WebKit 215884; fóruns da Apple, 2025 | No mercado, uma tela só, sem trocar de rota. |
| A vibração por JavaScript no iPhone foi fechada no iOS 26.5; só vibra no toque direto num interruptor. | Notas do `ios-haptics` | O retorno de cada etiqueta não pode depender de vibração. |
| A NFC-e traz o **código interno** da loja em “Código”; o GTIN fica em outro campo. Na nota real do Zaffari, nenhum código tinha cara de código de barras. | NT 2017.001; telemetria nossa | Hipótese: o código impresso na etiqueta é o mesmo da nota. Se for, o casamento fica exato. Testar com fotos reais. |

## 2. A crítica da v1

1. **Começava num lugar novo.** “No mercado” era um modo à parte, e a pessoa
   precisava lembrar de abrir. Lembrar de fazer algo depois é justamente o que
   mais falha (memória prospectiva). Só que a pessoa **já abre a lista de
   Compras** no mercado. → Na v2, a lista é o modo mercado.
2. **A foto não dava nada na hora.** O prêmio só vinha na nota, minutos ou
   horas depois. Hábito sem retorno imediato não pega. → Agora cada etiqueta
   risca o item da lista, completa o nome e mostra o avanço (“3 de 6”). Quanto
   mais perto do fim, mais a pessoa quer completar (gradiente de meta).
3. **Não dizia o que fotografar.** “Fotografe as etiquetas” cansa e faz
   desistir. → A dica vira “das ofertas e do que for caro”, onde os erros
   se concentram.
4. **A pergunta do cartão estava errada** (a sua observação). Ter o cartão
   não quer dizer usar o cartão hoje. → A pergunta passa a ser **por compra**,
   na primeira etiqueta com dois preços: “Vai usar o Cartão Zaffari nesta
   compra?”. O app guarda **os dois preços sempre**, então uma resposta
   errada nunca gera acusação errada.
5. **Pedia quantidade.** O passo de “1, 2, 3” na etiqueta era trabalho
   repetido, porque a nota já diz quanto foi. → Etiqueta é **prova de preço**,
   não contagem. Sem passo de quantidade.
6. **O limite enganava.** Somava só as etiquetas fotografadas, e não o
   carrinho. → Sai da v1 e volta junto com o carrinho completo (seção 6).
7. **Supunha nota impressa.** O Zaffari só imprime se pedir. → Lembrete no
   momento certo: “Peça a notinha”, quando a pessoa toca **Fui pro caixa**.
8. **Mandava resolver no caixa.** Fila atrás e vergonha. E a maioria confere
   já saindo. → O app pergunta “Ainda está no Zaffari?”. Se sim, manda ao
   **atendimento**, longe da fila. Se não, guarda para a **próxima ida** e
   lembra quando a pessoa voltar àquela loja.
9. **Não ajudava a falar.** Só mostrava a lei. → A tela do atendimento traz
   uma frase pronta e educada, a foto com hora e a lei em letra pequena. Uma
   frase pronta tira a parte mais difícil, que é começar a conversa.
10. **Casava nomes no chute.** Um “cobrado a mais” errado queima a confiança
    no módulo inteiro. → Três níveis: certo, dúvida (pergunta) e sem par
    (some). O número grande só soma o que é certo.
11. **Duplicava o “Ler a nota”.** Compras já tem “Voltou do mercado? Ler a
    nota fiscal”. → Ler a nota é sempre o mesmo gesto. Se há etiquetas
    daquela loja e daquele dia, a conferência vem junto.
12. **Telas demais.** A pergunta do cartão era uma tela, e o leitor e o cupom
    eram outro lugar. → Tudo no mercado acontece numa tela só: câmera em cima,
    lista embaixo. Também resolve o pedido repetido da câmera no iPhone.

## 3. O fluxo v2, momento a momento

```
EM CASA           NO CORREDOR                     NO CAIXA           DEPOIS
Lista de Compras  Câmera + lista (uma tela)       "Peça a notinha"   Conferência
     │                 │                               │                 │
 "Estou no ──► etiqueta lida sozinha ──► risca ──► Fui pro caixa ──► Ler a nota
  mercado"        │       item da lista               │                 │
                  ├ 2 preços? pergunta do cartão      │      ┌──────────┼──────────┐
                  ├ fora da lista? entra em "Fora"    │   Tudo certo  Dúvida   A mais
                  └ não leu? foto parada + digitar    │   (fim bom)  (pergunta)  │
                                                      │          ┌───────────────┤
                                       sem nota ──► compra pendente  Ainda estou  Já saí
                                       (3 dias)                     atendimento  próxima ida
```

### E1. Entrada (em casa ou já no mercado)

Em Compras, logo abaixo do resumo: **No mercado?** com uma frase e o botão
**Estou no mercado**. Depois da primeira compra conferida o cartão encolhe
num botão só. Nada de notificação nem localização: o gatilho é o gesto que a
pessoa já faz, abrir a lista.

### E2. No corredor: a lista manda, a câmera vem quando chamada (v3)

- A tela é a **lista**, com a barra “2 de 6”. Embaixo, um botão grande,
  **Etiqueta**, no mesmo lugar do “Ler” do resto do app. É a única ação
  principal da tela (G1).
- **Tocar** abre uma prévia pequena da câmera no topo, com um mirador no
  meio. A etiqueta do centro ganha realce; as vizinhas aparecem apagadas e,
  se a pessoa tocar numa delas, é ela que vale (G2).
- **Segurar** lê uma atrás da outra, enquanto o dedo estiver no botão. Serve
  para um corredor de ofertas. Ao soltar, a prévia some.
- Lida a etiqueta, a prévia mostra o que entrou por um instante e some. A
  linha da lista acende, risca o item e completa o nome (“Arroz” vira
  “Arroz, Camil 5 kg”) (G3).
- Se a leitura ficou em dúvida (reflexo, número cortado), o app não chuta:
  mostra **Qual é o preço?** com os dois candidatos e “Nenhum, digitar”
  (G4), como o “É esta data?” da validade.
- Errou? Toque na linha: abre **Corrigir**, com a foto, o preço, o item da
  lista e o tipo (unidade, quilo, leve-mais), e as opções **Ler de novo** e
  **Tirar** (H1). Não tem prazo.
- **Digitar** é o ícone pequeno à esquerda; **Fui pro caixa** fica no meio.

### E3. Cartão do supermercado, por compra

Na **primeira** etiqueta de hoje com preço de cartão, a pergunta aparece
como uma **linha no topo da lista** (G1), sem tapar a câmera e sem parar a
leitura. Até a resposta, as linhas mostram os dois preços (“16,90 · sem
cartão 18,90”):

> **Vai usar o Cartão Zaffari nesta compra?**
> Vale só para hoje. Na nota eu confiro os dois preços, então nada se perde
> se mudar de ideia.
> [Vou usar] [Não vou]

- A resposta vira um selo na faixa (“Com cartão”), que se toca para mudar.
- Na próxima compra, a resposta de hoje vem **pré-escolhida**, mas a
  pergunta aparece de novo, como você sugeriu. Com um toque só.
- Se a pessoa não responder, segue lendo e a pergunta fica esperando. Não
  trava a câmera.
- A frase “nada se perde” baixa o peso da decisão: dá para voltar atrás.

### E4. Etiquetas que não são simples

| Caso | O que o app faz | O que **não** pede |
|---|---|---|
| Preço por quilo | Guarda “49,90 o quilo”. Na nota, compara o R$/kg. | Peso. |
| Leve 3, pague 2 | Guarda a regra. Na nota, compara o total das unidades. | Quantidade. |
| Oferta com prazo (“até sábado”) | Guarda o prazo. Se a etiqueta ainda estava na gôndola, a oferta vale. | Nada. |
| Item fora da lista | Entra em “Fora da lista”. | Nome. |
| Mesma etiqueta duas vezes | Junta numa só. | Nada. |
| Não leu ao vivo | Foto parada e preço pré-preenchido para conferir (fluxo da validade). | Começar do zero. |
| Código na etiqueta | Usa para casar com a nota. | Escanear o produto. |

### F1. Fui pro caixa

Quando faltam um ou dois itens da lista, o lembrete aparece sozinho no fim
dela, sem alerta (H2). Tocar **Fui pro caixa** mostra o mesmo lembrete em
tela cheia:

> **Peça a notinha.** O Zaffari só imprime a nota se você pedir. O QR dela
> confere os 9 preços que você fotografou.

Isso é o plano “quando X, faço Y” na hora certa. Abaixo vêm o resumo (9
etiquetas, 3 ofertas, 5 de 6 da lista) e o que ficou na lista, que continua
lá para a próxima vez. Para quem esqueceu, há uma linha discreta: com CPF na
nota, dá para achar depois na Nota Fiscal Gaúcha e colar o link.

### F2. Conferência e “Ainda está no Zaffari?”

- O veredito vem primeiro. Pode ser **Tudo certo**, **Provavelmente certo**
  (o desconto do fim cobre a diferença) ou **R$ X cobrados a mais**.
- Havendo diferença, o app olha a hora da nota em vez de perguntar onde a
  pessoa está (v3):
  - nota de até uns 30 minutos: botão principal **Mostrar no atendimento**,
    e um link “Já saí: guardar para a próxima ida” (H3);
  - nota mais antiga: botão principal **Guardar para a próxima ida**, e um
    link “Ainda estou lá” (H4).
- Depois vêm as dúvidas (“É o mesmo produto?”, uma por item) e, recolhidos,
  os que batem.
- No fim, **Guardar no armário** leva a nota para o estoque, como hoje.
  Assim a compra fecha o ciclo: lista → mercado → nota → armário.

### F3. No atendimento

Tela clara e de letra grande, para virar para o atendente: a foto da etiqueta
com a hora em que foi tirada, os dois preços, a diferença e uma frase pronta.
A lei aparece em letra pequena, como apoio, não como ameaça. Quando há mais
de um item, é um por página (“1 de 2”).

- **Devolveram** soma no recuperado e fecha com o fim bom (D2 da v1).
- **Não resolveram** oferece os próximos passos: guardar para tentar de novo,
  ou reclamar no consumidor.gov.br com o texto e as fotos prontos para
  copiar.

### F4. Próxima ida

Quando a pessoa entra no mercado de novo naquela loja, e a primeira etiqueta
confirma que é o Zaffari, aparece no topo:

> **R$ 4,30 para receber aqui.** Da compra de 6/10. Passe no atendimento
> antes de ir pro caixa. [Mostrar] [Depois]

O lugar é o gatilho. O valor fica guardado por 30 dias. Ao tocar
**Depois**, o aviso sai e só volta na ida seguinte.

## 4. Regras do casamento etiqueta × nota

1. **Código igual** (se a hipótese do código interno se confirmar): certeza.
2. **Nome e tamanho batem e o preço está perto**: certeza.
3. **Nome parecido, tamanho ou preço estranho**: dúvida → “É o mesmo
   produto?”, com os dois nomes lado a lado. A resposta ensina o app para a
   próxima vez naquela loja.
4. **Sem par**: a etiqueta não achou item na nota. Fica recolhida (“não veio
   na nota”) e não conta.

Só os casos 1 e 2 entram no número grande. Diferença de centavos por
arredondamento de peso não conta.

## 5. Retorno ao usuário

### No tempo

| Tempo desde o toque | O que a pessoa vê |
|---|---|
| até 0,1 s | O botão afunda e a prévia abre. |
| assim que acha uma etiqueta | Realce em volta da etiqueta do mirador, antes de ler o preço. |
| até 1 s | O preço lido na prévia; a linha da lista acende e é riscada. |
| de 1 a 4 s | A causa, se houver: “Reflexo no preço”, “Chegue mais perto”, “Pouca luz” (as mesmas da validade). |
| 4 s | Oferece **Tirar foto** (foto parada e preço para conferir). |
| 10 s sem etiqueta | A prévia fecha sozinha. A câmera fica pronta mais uns 20 s. |

### Por canal

| Momento | Visual | Som | Vibração |
|---|---|---|---|
| Toque no gatilho | Botão afunda, prévia abre | Nenhum | No iPhone, o próprio toque pode vibrar se o botão for um interruptor do sistema (iOS 18 ou mais novo) |
| Etiqueta lida | Realce, pílula que só informa, linha acende | Clique curto | Não (o iPhone não deixa por programa) |
| Leitura em dúvida | “Qual é o preço?” com os candidatos | Dois tons curtos, diferentes do clique | Não |
| Item riscado | Círculo enche, barra anda | Nenhum | Não |
| Lembrete da notinha | Cartão no fim da lista | Nenhum | Não |
| Tudo certo | Marca de conferido, fim curto | Som mais cheio | Não |
| Cobrado a mais | Número grande em vermelho, sempre com sinal e rótulo | Nenhum (sem alarme) | Não |
| Devolveram | Valor recuperado e total | Som mais cheio | Não |

Regras gerais:

- A cor nunca vem sozinha: “+2,00”, “A mais” e o número têm rótulo.
- Nada de alerta modal. Só uma confirmação no módulo inteiro: apagar uma
  compra com diferença não resolvida, porque apaga a prova.
- Tudo o que aparece e some também é anunciado ao leitor de tela
  (`role="status"`), e nenhuma ação vive só dentro de algo que some.
- O som pode ser desligado no menu. Começa ligado, baixo.

## 6. Limite de gastos

Fica **fora da v1** e volta junto com o carrinho completo. Somar só as
etiquetas fotografadas dá um total que parece de verdade e não é. E a
pesquisa diz que o total ao vivo muda quanto a pessoa gasta: limite com
número errado é pior que nenhum.

Na fase do carrinho, ligar o limite liga também “contar tudo”: cada item que
entra no carrinho conta, com foto da etiqueta, toque na lista com o último
preço conhecido ou “item sem etiqueta”.

## 7. Fotos: por quanto tempo

As fotos ficam só no aparelho e nunca vão para o catálogo compartilhado.

| Situação | Prazo |
|---|---|
| Etiqueta que bateu com a nota | Apaga ao conferir. Fica o texto lido. |
| Etiqueta com diferença | Até “Devolveram” ou por **30 dias** (CDC, art. 26, I). |
| Compra sem nota | **3 dias**, com aviso no cartão pendente no último dia. |

Cada foto é guardada recortada na etiqueta, lado maior de 1280 px, em WebP,
com cerca de 100 KB.

## 8. Limites técnicos que moldam o design

- **Uma tela só no mercado.** Trocar de rota pode fazer o iPhone pedir a
  câmera de novo. Perguntas e correções aparecem dentro da tela, em folhas.
- **Funciona sem sinal.** Mercado costuma ter sinal ruim. Ler etiqueta e
  riscar a lista são locais. Só a leitura da nota precisa de rede; sem rede,
  a compra fica pendente.
- **Sem vibração confiável no iPhone.** O retorno é visual e sonoro.
- **Uma mão.** O gatilho fica no canto do polegar e pode trocar de lado
  para canhotos; nada de importante no topo da tela.
- **Câmera só quando pedida.** Menos bateria, menos calor e nenhuma
  etiqueta lida sem querer.

## 9. Como saber se está funcionando

Na telemetria de uso, sem dados pessoais:

- etiquetas por compra (meta: 5 ou mais) e tempo por etiqueta (meta: menos de
  3 segundos);
- % de compras com etiquetas que chegam a ler a nota (meta: 70%);
- % de dúvidas sobre todas as etiquetas (meta: menos de 10%, caindo com o
  aprendizado);
- “cobrado a mais” desmentido pela pessoa (meta: menos de 2%);
- % de diferenças resolvidas, na hora ou na próxima ida.

## 10. Roadmap do módulo

**v1:** qualquer mercado do RS (NFC-e com chave 43), com o catálogo como
extra onde existir. O Zaffari é o primeiro caso testado, não o alvo.

**Depois:**

1. **Carrinho completo (ideia B) e limite.** Cada item do carrinho conta; o
   total é real; o limite volta aqui.
2. **Aprender os nomes por loja.** Cada “É o mesmo” confirmado ensina o par
   etiqueta → nota daquela rede, no aparelho.
3. **Outras redes.** Formato da etiqueta, do clube e de onde cai o desconto
   em cada uma (Nacional, Carrefour, Asun, Unidasul…).
4. **Outros estados.** NFC-e fora do RS. É o que mais abre o módulo para
   outras pessoas; deveria vir cedo.
5. **Promoções mais complexas.** “2ª unidade 50%”, “a partir de 3”,
   atacarejo.
6. **Resumo do mês.** Quanto voltou e onde mais apareceu diferença, sem virar
   histórico de preço.

## 11. Para decidir

1. O limite sai da v1 e volta com o carrinho completo. Concorda?
2. **Fui pro caixa** continua como botão, e o lembrete também aparece
   sozinho perto do fim da lista. Bom assim?
3. Som curto ao ler a etiqueta: ligado ou desligado de início?
4. **Não resolveram** com caminho até o consumidor.gov.br já na v1, ou depois?

Antes de implementar, preciso de fotos reais de etiquetas do Zaffari junto
com a **nota da mesma compra**: com e sem Cartão Zaffari, de quilo, de
leve-mais e de oferta com prazo. Elas testam a hipótese do código interno, que
pode tornar o casamento exato.

## 12. Etiquetas reais do Zaffari (11/10/2026)

Foram 21 fotos tiradas no Zaffari, com 20 etiquetas diferentes (a 09 e a 12
são a mesma). As 16 primeiras vieram juntas; da 17 à 21, numa segunda leva. Estão em `tests/real/etiquetas/`, com o gabarito lido a olho
(`gabarito.json`) e o que o leitor do app leu (`leitura.json`, gerado por
`tests/etiquetas-ocr.mjs`). O rosto de uma pessoa ao fundo da foto 16 foi
borrado.

### Seis tipos de etiqueta

| Tipo | Fotos | Como é | Código de barras impresso | Preço do cartão | Validade |
|---|---|---|---|---|---|
| **Gôndola** | 01, 03, 06, 11, 15, 17 | Branca, mancha amarela no preço. Nome abreviado em maiúsculas (“SH JOHNSONS CHEIRINHO 400ML”), preço com “UN”, preço por KG ou L, e dois códigos da loja (“G16F0P0”, “0810-M0602”) | Sim, com os números | Não | Não |
| **Cartaz digitado** | 02, 09, 12 | “Economizar é comprar bem” no topo. Nome digitado, preço grande, preço por KG ou L pequeno | Sim, com os números | Não | Não |
| **Oferta com foto** | 05, 08, 14, 18 | Foto do produto, nome por extenso (“Batata Palha Extrafina Yoki 190g”), preço normal e preço da oferta num selo | Não | 08, 14 | Texto pequeno **na vertical**: “Oferta válida de 9 a 20 de Outubro de 2026…” |
| **Só nos cartões** | 10, 13 | Faixa verde. Tudo num texto só: nome, preço normal, “CARTÃO ZAFFARI/BOURBON”, preço do cartão | Não | Sim | “V 11/10” |
| **Pendurado no corredor** | 04, 07, 16, 20, 21 | Categoria em letras grandes (“FAROFA DE MANDIOCA”, ou só “CONJUNTO”), detalhe embaixo, preço enorme | Não | 07 | Não |
| **Parcelado (eletro)** | 19 | Ficha com características, “10 x 42,90 sem juros” enorme, “Preço à vista” e “Total a prazo” pequenos, logo do Zaffari | Sim, com os números | Parcelas só nos cartões | Não |

### O que isso muda no design

1. **O código de barras aparece em 9 das 20 etiquetas, e nunca nas
   ofertas.** Justamente onde mais se erra, só há nome e preço. O app
   precisa dos dois caminhos: com código, a identidade é exata; sem código,
   ela vem pelo nome.
2. **O código impresso é o EAN do produto**, e os 9 têm o dígito verificador
   certo. Os itens da lista de Compras já são guardados pelo EAN, então
   **etiqueta de gôndola risca o item da lista com certeza**, sem casar
   nomes.
3. **O preço por quilo ou litro confere o preço.** Em todas as 9 etiquetas
   que o trazem, preço ÷ tamanho = preço por unidade. Exemplo: 43,90 ÷
   0,340 kg = 129,12. Na foto 11, o arame tapa um dígito do “43,80 por KG”
   (o leitor leu “43-30”), e a conta mostra que algo não bate. Com a conta
   batendo, o app aceita na primeira leitura; sem ela, espera dois quadros
   iguais, como na validade.
4. **O cartão é “Zaffari Card e Bourbon Card”**, e não só “Cartão Zaffari”.
   A pergunta fica: **“Vai pagar com o Zaffari Card ou o Bourbon Card?”**.
   E é preço de **pagar com o cartão** (os dois são cartões de crédito), o que
   confirma a pergunta por compra: mesmo quem tem pode pagar com outro.
5. **A oferta de quantidade é “na compra de N un., pague X cada”** (2 un. na
   foto 05, 3 un. nas 18 e 21), e não “leve 3, pague 2”. O modelo passa a ser **“a partir de N
   unidades, cada uma sai X”**, que também cobre o leve-mais.
6. **A validade vem em dois formatos**: “V 11/10” (o leitor leu) e a frase
   vertical (o leitor não leu em nenhuma das 3 fotos). Não pode ser
   obrigatória. A lei vale enquanto a etiqueta estiver exposta, então a
   validade só serve para avisar “oferta até hoje”.
7. **Etiquetas empilhadas.** Nas fotos 02, 05, 08 e 10 há outra etiqueta
   atrás ou embaixo; às vezes do mesmo produto, às vezes de outro (na 08 é
   a pilha AAA C/4). O mirador escolhe a da frente. Se duas etiquetas do
   mesmo produto tiverem preços diferentes, o app guarda as duas, e vale a
   menor.
8. **Exceções no nome.** “Protetor Diário Intimus (Exceto Indicador de
   Troca/Longo)”, “Mach 3 Gillette (Exceto Carbono)” e “AA/AAA” mostram que uma oferta pode valer para alguns
   produtos e não para outros. Na conferência, um item que é exceção não pode
   virar “cobrado a mais”.
9. **Dois estilos de nome.** Gôndola, cartaz digitado e “só nos cartões” usam
   o nome abreviado do sistema da loja (“SALG”, “BISC”, “FGO”, “CG E.FIN”,
   “S/A”). Ele deve ser o mesmo nome da nota fiscal, e aí o casamento fica
   quase exato. **Hipótese: confirmar com uma nota.** Oferta com foto e
   cartaz pendurado usam o nome de vitrine, e esses pedem casamento
   aproximado.
10. **O cartaz pendurado fica longe do produto.** A foto não mostra o
    produto, e o nome é uma categoria (“PILHA ALCALINA”). O detalhe (“AA/AAA
    DURACELL COM 8un.”) é que identifica.
11. **Códigos da loja (hipóteses).** “G16F0P0” parece o lugar na loja
    (gôndola, frente, prateleira); um dia pode ordenar a lista pelo caminho
    no mercado. “0810-M0602” parece a data em que a etiqueta foi impressa
    (mês e dia), seguida de outro código.
12. **O maior número nem sempre é o preço.** Na cafeteira (19), o número
    grande é a parcela (“10 x 42,90”); o preço é o “à vista”, R$ 429,00, em
    letra pequena. A conta 10 × 42,90 = 429,00 confere, como o preço por
    quilo. No cartaz pendurado, o número grande é o preço normal, e o do
    cartão vem num selo (07).
13. **A mesma oferta em dois formatos.** O Cup Noodles tem cartaz com foto
    (18) e cartaz pendurado (21), com os mesmos 4,98 e “3 un. por 3,98
    cada”. Se a pessoa fotografar os dois, é uma etiqueta só. E, se um dia
    não baterem, vale a menor.
14. **O nome pode ser só uma categoria.** “CONJUNTO” (20) não diz nada; o
    produto está na linha de baixo (“com 4 cargas Mach 3 Gillette”).
15. **Cartaz de dois lados.** No 20, o verso aparece por transparência e
    deixa sombras de outros números atrás do 34,90. O leitor não se
    confundiu, mas é um caso a guardar.
16. **Os mockups estavam errados.** A etiqueta inventada tinha uma caixa
    vermelha “CARTÃO ZAFFARI”, e a de verdade é a faixa verde “Só nos
    cartões”. Isso entra na rodada de aparência.

### O que o leitor do app já consegue

Foi o Paddle que o app já usa, na foto inteira (1600 px), sem recortar a
etiqueta, num computador sem placa de vídeo:

| | Pequeno | Médio |
|---|---|---|
| Preço normal presente no texto lido | 19 de 21 (a farofa saiu “599”; no Cup Noodles com foto sumiu o 4 grande de “4,98”) | 20 de 21 (o mesmo Cup Noodles) |
| Preço da oferta (cartão ou quantidade) | 8 de 8 | 8 de 8 |
| Preço por KG/L (onde legível) | 9 de 9 | 9 de 9 |
| Números do código de barras | 7 de 9 (06 perdeu o 7 do começo; 03 não leu) | 8 de 9 (06 de novo) |
| Tempo por foto | 4 a 12 s | 13 a 43 s |

O leitor de código de barras (ZXing) decodificou só 4 de 21, os cartazes
de código grande. As barras da etiqueta de gôndola são pequenas demais para
a foto inteira. **Ler os números impressos e conferir o dígito verificador
funciona melhor que ler as barras.**

O que falta não é enxergar, é **entender**. O texto vem misturado com a
embalagem (fotos 10, 13 e 15 trazem dezenas de linhas do pacote), com o
slogan “Economizar é comprar bem” e com a ordem trocada (“Extrafina 12,90”).
Para isso:

- **recortar a etiqueta** antes de ler (o mirador da v3), o que também
  derruba o tempo;
- **reconhecer o tipo de etiqueta** pela forma (faixa amarela, faixa verde,
  slogan) e então ler os campos com as regras de cada tipo;
- **dar nome a cada número** pela palavra ao lado: “por KG/L” é preço por
  unidade, “UN”/“cada” é preço normal, “CARTÃO”/“só nos cartões” é preço
  do cartão, “Na compra de N” é quantidade;
- **juntar centavos pequenos** (“5” + “99” = 5,99) quando a conta do preço
  por unidade ou o tamanho do produto confirmam. No cartaz com foto, os
  centavos vêm pequenos e em cima (“4,⁹⁸”), e o leitor às vezes perde o real
  inteiro (18): aí o app pede a outra leitura em vez de chutar.

### O que ainda preciso

1. **A nota fiscal** de uma compra com alguns desses produtos (de
   preferência um da gôndola e uma oferta “só nos cartões”), para testar se
   o nome da gôndola é igual ao da nota.
2. Um **vídeo curto** passando o celular por uma prateleira com várias
   etiquetas lado a lado, para testar o mirador.
3. Uma etiqueta de **produto por quilo** (frios, padaria, hortifrúti).

## 13. A nota fiscal do Zaffari (10/10/2026)

Nota de Caxias do Sul, 17 itens, R$ 229,21, paga com cartão de crédito
Mastercard (não o Zaffari Card), sem CPF. O QR foi lido da foto pelo leitor
do app, e a nota foi buscada pelo mesmo caminho que o app usa. Os itens
estão em `tests/real/notas/zaffari-2026-10-10.json`. A foto e a chave de
acesso ficaram de fora do repositório, por serem de uma compra real.

### O que a nota confirma

1. **O código da nota é o código interno da loja, e não o EAN.** No papel ele
   vem como “0000001125732” e, na consulta, como “000000000001125732”. O
   número útil tem 7 dígitos (1125732) e não aparece em nenhuma das 20
   etiquetas. **Etiqueta e nota não têm código em comum.** O EAN da gôndola
   serve para a lista de Compras, mas não para a nota.
2. **O nome da nota tem o mesmo jeito do nome da gôndola**: tipo abreviado,
   marca, variante, tamanho (“SALG FANDANGOS PRESUNTO 160G”, “BISC NESTLE
   CHOCO WAFFLE 80G”, como “SALG DORITOS QUEIJO NACHO 183G” e “BISC
   JACOBSENS BEAUTIFUL 340G” nas etiquetas). Reforça a hipótese de que é o
   mesmo nome do sistema da loja, mas **nenhum produto desta nota foi
   fotografado**, então ainda não está provado.
3. **A nota tem sufixos que a etiqueta talvez não tenha**: “L+P-” (pacote
   leve mais, pague menos), “PROM” (embalagem promocional), “C/6UN”. O
   casamento precisa ignorar esses sufixos, mas sem esquecer que mudam o
   produto.
4. **Granel vem com o peso**: “CEBOLA BRANCA GRANEL 0,228 KG × 8,99 =
   2,05”. Confirma o desenho: o peso vem da nota e a etiqueta só dá o
   preço do quilo.
5. **Desconto zero e pagamento “cartão de crédito”.** Sem o Zaffari Card,
   não houve preço de cartão, como esperado. A consulta não diz **qual**
   cartão foi usado (o nome Mastercard só aparece no comprovante do
   cartão, no fim do papel). **O app não tem como saber se foi o Zaffari
   Card**, então a pergunta por compra continua necessária.
6. **A nota fica disponível em 1 segundo** (emitida às 21:53:13, autorizada
   às 21:53:14). Dá para conferir ainda no caixa.
7. **Sem CPF, a nota não aparece depois na Nota Fiscal Gaúcha.** Sem o papel
   e sem CPF, a conferência se perde. O lembrete “Peça a notinha” fica ainda
   mais importante.

### O alarme falso que a nota mostrou

Comparar as 20 etiquetas com esta nota só pelas palavras do nome junta duas
coisas diferentes:

| Etiqueta | Nota | Palavras em comum |
|---|---|---|
| Batata Palha **Extrafina** Yoki **190g**: 14,90 | BATATA PALHA YOKI **TRAD 195G** PROM: 18,90 | 38% |

Um casador ingênuo diria **“R$ 4,00 cobrados a mais”**, e estaria errado: são
produtos diferentes. É exatamente o alarme falso que destrói a confiança no
módulo. Daí três regras novas:

1. **Tamanho diferente nunca é o mesmo produto** (190 g ≠ 195 g).
2. **Variante em conflito também não** (EXTRAFINA ≠ TRAD).
3. Na dúvida, **“É o mesmo produto?”** com os dois nomes lado a lado, nunca
   “cobrado a mais”.

### Como fica o casamento etiqueta × nota

1. **Nome da gôndola igual ao da nota**, ignorando os sufixos: certeza (se a
   hipótese se confirmar).
2. **Marca e tamanho iguais e nenhuma variante em conflito**: provável. Entra
   em “cobrado a mais” só se o preço da nota for maior que o da etiqueta e
   nenhum outro item da nota servir melhor.
3. **O resto**: “É o mesmo produto?”, ou some, se não houver candidato.
4. **Aprendizado**: cada par confirmado guarda **EAN ↔ código interno** daquela
   rede. Na compra seguinte, o casamento é por código, exato. É um dado do
   produto, não da pessoa; um dia pode ser compartilhado entre usuários, com
   a sua aprovação.

### O que ainda falta

- **Uma nota com produto fotografado**, para provar que o nome da gôndola é
  igual ao da nota.
- **Uma nota paga com o Zaffari Card** e com uma oferta “só nos cartões”,
  para ver se o preço do cartão vem no item ou como desconto no fim.
- **Uma nota com oferta de quantidade** (“na compra de 3 un.”), para ver como
  o desconto aparece.

## 14. Qualquer mercado primeiro; o catálogo da loja é um extra

**Princípio:** o módulo tem que funcionar em qualquer mercado com NFC-e, sem
depender de uma rede. O Zaffari é só o primeiro caso de teste, porque é onde
as fotos e a nota foram tiradas. Tudo o que é específico de uma rede (formato
de etiqueta, catálogo, nome do clube) entra como **extra opcional**, e o
básico funciona sem ele.

### O que funciona em qualquer mercado

| | Precisa de quê | Funciona em |
|---|---|---|
| Itens repetidos, quantidade diferente da lista, item fora da lista | Só a nota e a lista | Qualquer mercado com NFC-e |
| Conta errada na linha (quantidade × preço ≠ total), peso estranho no granel | Só a nota | Qualquer um |
| Mesmo produto, mesma loja, preço bem diferente da última compra sua | A nota e as notas anteriores da própria pessoa (como alerta, não como histórico) | Qualquer um |
| Etiqueta fotografada × nota | A foto e a nota | Qualquer um. A leitura da etiqueta vai pelo **sentido** (“por KG”, “UN”, “cada”, “cartão”, “clube”, “na compra de”, “leve X pague Y”), não pelo desenho de uma rede |
| Pergunta do clube | “Usou o cartão ou o clube da loja nesta compra?”, com o nome da loja tirado da nota | Qualquer rede que tenha preço de clube (Zaffari Card, Meu Carrefour, Clube Mais, Meu Assaí…) |

### O extra: catálogo público da loja

O servidor do app já consulta o catálogo público de 28 lojas VTEX
(`LOOKUP_STORES`) para achar produtos pelo EAN. Onde a rede da nota tem
catálogo, ele acrescenta preço do site e ofertas. Onde não tem, nada quebra.
**A ligação “código da nota = produto do site” foi confirmada só no
Zaffari**; em cada outra rede precisa ser testada com uma nota.

**Pré-requisito para sair do RS:** hoje o app só lê NFC-e do RS (chave 43).
Cada estado tem a sua página de consulta; ler os outros estados é o primeiro
passo de verdade para o módulo valer fora daqui.

### O caso do Zaffari (primeiro extra testado)

O site do Zaffari roda em VTEX, e a busca pública do catálogo
(`/api/catalog_system/pub/products/search`) responde sem login. Testado em
12/10/2026:

1. **O código da nota é o número do produto no site.** 1125732 (MAC NISSIN
   G.CP 510G) é o produto 1125732 do site, por R$ 15,47, o mesmo preço da
   nota. Pepsi (8,89) e cebola a granel (8,99/kg) também batem. Dois dos 5
   códigos testados não existem no site (embalagem PROM e o talco).
2. **O site liga o código da loja ao EAN.** Buscando pelo EAN das etiquetas
   de gôndola, vêm o produto e o preço. Os 6 preços testados batem com as
   etiquetas: Tutti 8,99, Hellmann's 13,98, Johnson's 27,95, Brasileirinha
   4,69, Doritos 15,99 e cafeteira 429,00.
3. **As ofertas vêm descritas:**
   - Intimus: 17,90, com 10,67% de desconto só para dois meios de pagamento
     (os cartões da loja), o que dá os 15,99 da etiqueta;
   - Duracell: 49,80, com uma oferta do mesmo tipo;
   - Cup Noodles: 4,98, com uma oferta de **mínimo 3 unidades**.

### Por que muda o módulo

Onde a loja tem catálogo, o app consegue saber o preço e as ofertas de
quase todo produto da nota **sem nenhuma foto**. Onde não tem, a camada 0
continua com as regras gerais acima. A foto deixa de ser o centro e vira **prova sob
demanda**.

| Camada | O que a pessoa faz | O que o app faz |
|---|---|---|
| 0. Automática | Nada além de ler a nota (o que já faz para guardar no armário) | Para cada item: compara o preço da nota com o catálogo; confere se a oferta de quantidade entrou quando levou o mínimo; aponta itens repetidos, quantidade fora da lista e peso estranho |
| 1. Uma pergunta, só se importar | Responde “Usou o cartão ou o clube da loja?” (no Zaffari: Zaffari Card ou Bourbon Card) | Só aparece se houver item com preço de clube (pela foto ou pelo catálogo). Se “sim” e o desconto não entrou, aponta |
| 2. Foto quando vale | Fotografa a etiqueta | Em loja sem catálogo, para as ofertas; em loja com catálogo, para o que não está no site ou como prova quando o app apontou algo |

### Cuidados

- **O site não é a gôndola.** A lei garante o menor preço **exposto na
  loja**. Preço do site acima do da nota é indício, não prova. O app diz
  “o site do Zaffari mostra 13,98; você pagou 15,49. Ainda está na loja?
  Fotografe a etiqueta”, e não “cobrado a mais”.
- **Preço por região.** Os preços bateram com uma nota de Caxias e com
  etiquetas de outra loja, mas o site pode ter preços por região. Medir
  com mais notas antes de confiar.
- **API não oficial.** É a busca pública que o próprio site usa. O app vai
  pelo nosso servidor, com cache e poucas chamadas, e precisa funcionar
  sem ela (some uma camada, o resto segue).
- **Nem tudo está no site** (2 de 5 códigos). Para esses, vale a foto.

## 15. Leitura pela psicologia e pela ciência do comportamento

### Diagnóstico (modelo COM-B: capacidade, oportunidade, motivação)

| | O que ajuda | O que atrapalha |
|---|---|---|
| **Capacidade** | O app lê a nota e o catálogo | Ninguém lembra preço (Dickson e Sawyer); ler etiqueta é difícil; a lei é pouco conhecida |
| **Oportunidade** | A nota sai em 1 segundo; o atendimento está a metros | Fila e pressa no caixa; nota sem papel e sem CPF se perde; sinal ruim |
| **Motivação refletida** | Economizar; senso de justiça | Ganho esperado por compra é pequeno (erro em ~1 de 30 itens) |
| **Motivação automática** | Orgulho de “comprar bem” (smart-shopper) | Vergonha de reclamar; preguiça; não querer saber (efeito avestruz) |

### O que isso pede

1. **Esforço quase zero, ou o módulo morre.** Com ganho pequeno e raro, cada
   foto pedida é atrito que não se paga: é *sludge* (Sunstein). A camada 0
   resolve: não pede nada.
2. **Pegar carona num hábito que já existe.** Compra no mercado é semanal;
   hábito novo semanal demora e falha (Lally et al.: em média 66 dias com
   repetição diária). O gesto que já existe é **ler a nota para guardar no
   armário**. A conferência vem junto, sem gesto novo (âncora do Fogg).
3. **Tirar a decisão de olhar.** Quem desconfia de má notícia tende a não
   olhar (efeito avestruz, Karlsson, Loewenstein e Seppi). Se a conferência
   é automática, ninguém precisa decidir conferir.
4. **Usar orgulho, não medo.** Pegar uma boa oferta dá orgulho
   (sentimento de “comprador esperto”). “Suas 3 ofertas entraram certinho”
   motiva mais e por mais tempo que “o mercado errou”.
5. **Chamar de erro, não de golpe.** Injustiça mexe com as pessoas mais do
   que o valor (Kahneman, Knetsch e Thaler), mas tom de acusação dá reação
   contrária e azeda a relação com uma loja de que a pessoa gosta. “Uma
   diferença de R$ 2,00” em vez de “cobrança indevida”.
6. **Tirar a vergonha.** Frase pronta, atendimento em vez de caixa, “guardar
   para a próxima ida”. Plano “quando entrar no Zaffari, passo no
   atendimento” (intenção de implementação).
7. **Nunca alarme falso.** Indício vira pergunta; só certeza vira
   “a mais”.
8. **O primeiro uso tem que dar certo** (autoeficácia, Bandura). Na primeira
   nota, mesmo sem erro, mostrar o que foi conferido: “17 itens conferidos
   com o site do Zaffari. 2 ofertas entraram.”

### O que o módulo **não** deve fazer (ética)

- **Não somar “quanto você economizou em ofertas”.** Esse placar premia
  comprar mais. Só conta o que foi **recuperado** de erro.
- **Não empurrar o cartão da loja.** Nada de “com o Zaffari Card sairia
  R$ 12 mais barato”: é cartão de crédito.
- **Não empurrar o mínimo da oferta.** Nada de “leve mais 1 para ganhar o
  desconto” no corredor. Na lista, só informar a oferta dos itens que a
  pessoa **já** ia comprar.

### Ângulos práticos que saem disso

1. **Conferência automática da nota** (camada 0). Usa o catálogo e as regras
   de repetição, quantidade e peso.
2. **Oferta na lista de Compras**, só nos itens que já estão nela: “só nos
   cartões até 20/10”, “a partir de 3 un.”. A lista já guarda o EAN, e o
   catálogo responde por EAN.
3. **Foto sob demanda**, como prova, quando o app aponta algo e a pessoa
   ainda está na loja.
4. **Desperdício em reais.** O app já sabe o que venceu no armário e, pela
   nota, quanto custou: “R$ 23 venceram no armário este mês”. A aversão à
   perda trabalha a favor de algo que o app já faz, que é avisar a validade.
5. **Ligação EAN ↔ código guardada** (vem do catálogo, não precisa
   aprender com a pessoa). Serve também para o “Guardar no armário” da
   nota acertar o produto pelo EAN.

## 16. Reanálise: o módulo para qualquer mercado

### O que muda quando não é uma rede só

Cada rede tem etiquetas, clube e catálogo diferentes. O que é igual em
qualquer mercado do Brasil é pouco, e é nisso que o módulo se apoia:

1. **A NFC-e** (nacional, com QR; muda só a página de consulta de cada
   estado);
2. **os dados da própria pessoa** no app: a lista, o armário e as notas
   anteriores;
3. **a foto** que ela tira;
4. **a lei**: menor preço exposto (Lei 10.962/2004, art. 5º) e condição de
   desconto visível (Lei 13.455/2017).

Tudo o que é de uma rede (formato de etiqueta, catálogo, nome do clube) é
extra.

### O que a pesquisa geral acrescentou

| Achado | Fonte | O que muda |
|---|---|---|
| Cerca de **7 em cada 10** brasileiros participam de programas de fidelidade de supermercado; **60%** deles estão em 2 a 4 programas; **68%** organizam as compras pelas promoções desses programas | Neogrid e Opinion Box, 2025 | O problema geral não é “o cartão do Zaffari”, é o **preço de clube**. E quem está em vários clubes precisa lembrar qual usar em cada loja |
| Na maioria das redes, o preço de clube depende de **informar o CPF ou usar o app** no caixa. Esconder essa condição é abusivo | Lei 13.455/2017; Idec; reportagens de 2026 | O app consegue **deduzir pela nota**: ela diz se houve CPF (“Consumidor: CPF…” ou “Consumidor não identificado”) |
| Reclamações de 2026: oferta de cartaz que não entrou no caixa por ser “só do app” | Reclame Aqui; Procon Jundiaí | O erro mais comum hoje é a **oferta condicionada** que não entra |
| Relato de 2026: sem foto da etiqueta e com fila crescendo, a pessoa pagou a diferença de 3 itens | Estado de Minas | A foto é a prova que falta na hora. Vale **na oferta**, não em tudo |
| A Sefaz Virtual do RS autoriza a NFC-e de vários outros estados | Sefaz-CE, SEF-SC, notícias do lançamento nacional | Pode ser que uma página de consulta só sirva para vários estados. **Verificar**: é o caminho mais curto para sair do RS |

### Leitura comportamental (COM-B, geral)

| | Ajuda | Atrapalha |
|---|---|---|
| **Capacidade** | O app lê a nota; a foto guarda o preço | Ninguém lembra preço; cada rede tem etiqueta e clube diferentes |
| **Oportunidade** | A nota sai em segundos; o atendimento está perto | Fila; esquecer o CPF no caixa; nota sem papel e sem CPF se perde |
| **Motivação refletida** | Economizar; justiça | Ganho por compra é pequeno |
| **Motivação automática** | Orgulho de pegar a oferta | Vergonha de reclamar; não querer saber; cansaço de fim de compra |

O que isso pede, em ordem de efeito:

1. **Conferir sem pedir nada** (a camada 0 da seção 14), pegando carona em
   ler a nota, que a pessoa já faz para guardar no armário.
2. **Um gatilho só para a foto: o cartaz de oferta.** “Viu cartaz de oferta,
   fotografa” é um plano “se X, então Y” com um sinal que salta aos olhos
   (amarelo, vermelho, “só no clube”). Fotografar tudo é atrito; fotografar
   oferta é pouco e é onde está a disputa.
3. **Um lembrete na hora certa: “No caixa: CPF na nota.”** Resolve três
   coisas de uma vez: o preço de clube entra, a nota pode ser achada depois
   no programa do estado (Nota Fiscal Gaúcha, Nota Paulista…) e o app sabe,
   pela nota, se o clube devia ter entrado. Se a pessoa prefere não dar o
   CPF, “Peça a notinha” continua.
4. **Perguntar só o que não dá para deduzir.** Se a nota tem CPF, o app
   assume que o clube valia. Só pergunta “Usou o clube ou o app da loja?”
   quando houver oferta de clube fotografada e a nota não disser.
5. **Prova pronta para reclamar.** Quando não resolve na loja, o app monta o
   pacote: foto da etiqueta com data e hora, o item da nota, a diferença e o
   artigo da lei, pronto para o consumidor.gov.br ou o Procon de qualquer
   estado.
6. **Continua valendo**: erro, não golpe; nunca alarme falso; o primeiro uso
   mostra o que foi conferido; nada de placar de “economia em ofertas”, nada
   de empurrar clube, cartão ou quantidade mínima.

### Ângulos práticos, para qualquer mercado

| Ideia | Precisa de | Esforço da pessoa | Esforço de construir |
|---|---|---|---|
| Conferência automática da nota (repetidos, quantidade, fora da lista, conta, peso, salto de preço na mesma loja) | Nota + lista + notas anteriores | Nenhum | Baixo |
| Clube pela nota (CPF presente ou não) + oferta de clube fotografada | Nota + foto | 1 foto por oferta | Médio |
| “No caixa: CPF na nota” | Lista aberta no mercado | Nenhum | Baixo |
| Leitura de etiqueta por sentido, sem molde de rede | Foto | — | Médio (o leitor já lê; falta entender) |
| Pacote de reclamação | Foto + nota | 1 toque | Baixo |
| Desperdício em reais (validade × preço pago) | Armário + notas | Nenhum | Baixo |
| Notas de outros estados (começando pelos da Sefaz Virtual do RS) | Servidor | Nenhum | Médio, e é o que mais abre o app |
| Catálogo da loja como extra (as 28 lojas VTEX que o servidor já consulta) | Servidor | Nenhum | Médio; testar por rede se o código da nota bate |

### O que sai

- Moldes de etiqueta do Zaffari (faixa amarela, faixa verde) como regra: viram
  só exemplos de teste.
- Códigos de posição na loja (“G16F0P0”): são do Zaffari.
- A pergunta fixa do Zaffari Card: vira “Usou o clube ou o app da loja?”, e
  só quando não dá para deduzir.

### Primeira versão para qualquer mercado

1. Ler a nota (como já existe) mostra a conferência automática.
2. No mercado, a lista com o botão **Etiqueta**, sugerindo fotografar os
   cartazes de oferta.
3. Ao tocar **Fui pro caixa**: “CPF na nota” (ou “Peça a notinha”).
4. Resultado: tudo certo, dúvida (pergunta) ou diferença, com “Mostrar no
   atendimento”, “Guardar para a próxima ida” ou “Montar reclamação”.
5. Primeiro no RS, já com qualquer rede; em seguida, os estados da Sefaz
   Virtual do RS.

## Fontes

- Dickson e Sawyer (1990), *The Price Knowledge and Search of Supermarket Shoppers*, Journal of Marketing. Réplica e resumo: [Springer](https://link.springer.com/doi/10.1007/BF00993956).
- FTC, *Price Check* (1996) e *Price Check II* (1998): [relatório](https://www.ftc.gov/system/files/documents/reports/price-check-ii-follow-report-accuracy-checkout-scanner-prices/981216pricecheck2rpt.pdf), [nota](https://www.ftc.gov/news-events/news/press-releases/1998/12/price-check-ii-shows-scanner-accuracy-has-improved-1996).
- Idec (2014), [supermercados com divergência](https://idec.org.br/o-idec/sala-de-imprensa/release/todos-os-supermercados-visitados-pelo-idec-apresentam-divergencia-entre-o-valor-cobrado-e-o-ofertado-alem-de-produtos-sem-etiqueta).
- Dalhousie Agri-Food Analytics Lab (2023), [conferência de notas](https://northernontario.ctvnews.ca/new-survey-suggests-people-should-check-receipts-before-leaving-grocery-stores-1.6329002).
- LegalShield (2026), [vergonha do consumidor](https://legalshield.com/newsroom/the-shame-gap-new-data-shows-3-in-4-americans-stay-silent-after-getting-burned-in-everyday-consumer-situations); [The Scotsman](https://www.scotsman.com/business/six-in-ten-shoppers-get-bad-service-1572991).
- Gollwitzer e Sheeran (2006), [meta-análise de intenções de implementação](https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes).
- Efeito “lobo” em alarmes: [Azevedo-Sá et al., 2020](https://deepblue.lib.umich.edu/bitstream/handle/2027.42/153524/Azevedo-Sa%20et%20al.%202020.pdf?sequence=1).
- van Ittersum et al. (2013), [Smart Shopping Carts](https://gatton.uky.edu/how-real-time-feedback-influences-spending).
- Zaffari e a nota só impressa a pedido: [Baguete](https://www.baguete.com.br/noticias/zaffari-e-bourbon-na-nota-fiscal-gaucha).
- “De Olho no Preço” no Rio: [Monitor Mercantil](https://monitormercantil.com.br/supermercados-no-rio-desrespeitam-lei-de-afixacao-de-precos/).
- Hoober (2013), [como as pessoas seguram o celular](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php).
- Câmera pedida de novo no app instalado do iPhone: [WebKit 215884](https://bugs.webkit.org/show_bug.cgi?id=215884), [fórum da Apple](https://developer.apple.com/forums/thread/788518).
- Vibração no Safari: [ios-haptics](https://unpkg.com/ios-haptics@3.1.1/README.md).
- Código interno × GTIN na NFC-e: [Portal SPED](https://portalspedbrasil.com.br/?p=15959).
- Apple, [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) e [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics).
- Lei 10.962/2004, art. 5º; CDC, art. 26, I.

Rodada 5 (qualquer mercado):

- Neogrid e Opinion Box (2025), [fidelidade em supermercados](https://mercadoeconsumo.com.br/09/05/2025/supermercados/sete-em-cada-dez-brasileiros-participam-de-programas-de-fidelidade-de-supermercados/).
- Idec, [preço da gôndola diferente do caixa](https://idec.org.br/consultas/dicas-e-direitos/supermercados-o-que-fazer-quando-o-preco-da-gondola-e-diferente-do-que-aparece-no-caixa).
- [Reclame Aqui: oferta só do app não aplicada](https://www.reclameaqui.com.br/supermercados-mundial/falta-de-aplicacao-do-desconto-anunciado-na-etiqueta-e-falta-de-cumprimento-da-lei-do-consumidor_VNDfay2d9jeV5R1H/).
- [Procon Jundiaí, 2026](https://tribunadejundiai.com.br/economia/procon-jundiai-fiscalizacao-supermercados-direitos-consumidor-2/).
- [Estado de Minas, 04/08/2026](https://www.em.com.br/emfoco/2026/08/04/sem-foto-da-etiqueta-que-provasse-o-preco-da-gondola-e-com-a-fila-crescendo-no-caixa-paulo-tecnico-de-manutencao-de-45-anos-pagou-a-diferenca-por-3-itens-e-so-no-estacionamento-entendeu-entre-o/).
- NFC-e pela Sefaz Virtual do RS: [lançamento nacional](https://www.legisweb.com.br/noticia/?id=9719), [Sefaz-CE](https://www.coad.com.br/home/noticias-detalhe/131800/sefaz-ce-esclarece-sobre-a-autorizacao-da-nota-fiscal-de-consumidor-eletronica), [SEF-SC](https://sef.sc.gov.br/api-portal/Documento/Ver/6351).
- Lei 13.455/2017 (preço diferente por forma de pagamento, com condição visível).

Rodada 4 (comportamento):

- Michie, van Stralen e West (2011), modelo COM-B.
- Karlsson, Loewenstein e Seppi (2009), [efeito avestruz](https://www.cmu.edu/tepper/faculty-and-research/assets/docs/ppaper-61264983153898-ostrich-effect-1.pdf); réplica com resultado diferente: [efeito suricato](https://openaccess.city.ac.uk/id/eprint/3875/1/The%20meerkat%20effect.pdf).
- Sunstein, *Sludge* ([resumo](https://www.behavioraleconomics.com/resources/mini-encyclopedia-of-be/sludge/)).
- Orgulho de pegar oferta: [Schindler, Rutgers](https://camden.rutgers.edu/news/blame-it-genetics); [Rhee, smart shopper feeling](https://iastatedigitalpress.com/itaa/article/2711/galley/2584/view).
- Kahneman, Knetsch e Thaler (1986), justiça como restrição ao lucro.
- Lally et al. (2010), formação de hábitos no mundo real.
- Bandura (1977), autoeficácia.

Rodada 3:

- Scandit, [SparkScan](https://docs.scandit.com/sdks/web/sparkscan/intro/) e [scanner ergonômico](https://www.scandit.com/blog/ergonomic-scanner-for-frontline-workers/).
- Apple, [Capture machine-readable codes and text with VisionKit](https://developer.apple.com/videos/play/wwdc2022/10025/) (WWDC 2022).
- Nielsen, [tempos de resposta](https://en.wikipedia.org/wiki/Responsiveness).
- [Laws of UX](https://lawsofux.com/): limiar de Doherty, gradiente de meta, Fitts, Tesler.
- Desfazer contra confirmação: [UX Planet](https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956), [137foundry](https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj).
- Avisos que somem e acessibilidade: [Scott O'Hara](https://scottohara.me/blog/2019/07/08/a-toast-to-a11y-toasts.html), [Adrian Roselli](https://adrianroselli.com/2020/01/defining-toast-messages.html).
- Janelas no celular: [UX Magazine](https://uxmag.com/articles/modals-on-mobile-how-to-use-them-wisely).
- Padrões e carga mental: [Shopify](https://www.shopify.com/partners/blog/cognitive-load), [UX Magazine](https://uxmag.com/articles/the-ux-of-default-settings-in-a-product).
- Amber Case, [princípios da tecnologia calma](https://calmtech.institute/calm-tech-principles).
- Dan Saffer, *Microinteractions*: [resumo](https://cieden.com/book/sub-atomic/microinteractions/structure-of-microinteractions).
- Wobbrock e colegas, [interação andando](https://faculty.washington.edu/wobbrock/pubs/mobilehci-08.pdf).
- Walmart Scan & Go: [Boston Globe](https://www.bostonglobe.com/business/2014/08/12/walmart-try-try-again/GYdH9nGK5AQ0eEpSqSJxrO/story.html), [Retailwire](https://retailwire.com/discussion/walmarts-scan-and-go-is-a-no-go/).
- Material Design, [som na interface](https://m2.material.io/design/sound/applying-sound-to-ui.html).
- Atrito bom: [UXPin](https://www.uxpin.com/studio/blog/cognitive-friction-ux-design-good-bad/), [Hackernoon](https://sia.hackernoon.com/good-friction-vs-bad-friction-when-slowing-users-down-creates-better-ux).
