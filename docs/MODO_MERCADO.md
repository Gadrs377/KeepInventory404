# Modo Mercado (proposta v2)

Proposta de fluxo, **ainda não implementada**. A pessoa fotografa a etiqueta
de preço e, quando sai a nota, o app confere se algo foi cobrado mais caro. O
módulo fica dentro de **Compras**.

Esta versão refaz a v1 depois de pesquisa e crítica. A aparência ainda vai
ser trabalhada; aqui o foco é o fluxo e as decisões.

Pranchas da v2:
[E, em casa e no corredor](modo-mercado/prancha-E.webp) ·
[F, caixa, conferência e depois](modo-mercado/prancha-F.webp).
Da v1 continuam valendo as telas de conferência
([C](modo-mercado/prancha-C.webp)) e o valor recuperado
([D](modo-mercado/prancha-D.webp)).

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

### E2. No corredor: câmera em cima, lista embaixo

- A câmera fica aberta na metade de cima. Lê a etiqueta **sozinha**, com
  votação de quadros como na validade, sem botão de foto.
- O que foi lido aparece numa pílula sobre a câmera, com **Desfazer** em vez
  de “Confirmar”. Confirmar a cada etiqueta seria um toque a mais em todas;
  desfazer só custa quando erra (padrão da Apple: deixar desfazer em vez de
  perguntar).
- A etiqueta casa com um item da lista (“Arroz” vira “Arroz, Camil 5 kg,
  27,90”) e o item é riscado. A barra de avanço anda.
- Retorno de cada leitura: realce no preço da foto, a pílula, a linha que
  acende na lista e um som curto opcional. Não depende de vibração.
- **Fui pro caixa** e **Digitar** ficam na barra de baixo, ao alcance do
  polegar.
- A câmera dorme sozinha depois de uns 20 segundos sem etiqueta, para
  poupar bateria, e acorda com um toque.

### E3. Cartão do supermercado, por compra

Na **primeira** etiqueta de hoje com preço de cartão, a pergunta aparece no
lugar da pílula, sem trocar de tela:

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

Tocar **Fui pro caixa** fecha a câmera e mostra uma coisa só:

> **Peça a notinha.** O Zaffari só imprime a nota se você pedir. O QR dela
> confere os 9 preços que você fotografou.

Isso é o plano “quando X, faço Y” na hora certa. Abaixo vêm o resumo (9
etiquetas, 3 ofertas, 5 de 6 da lista) e o que ficou na lista, que continua
lá para a próxima vez. Para quem esqueceu, há uma linha discreta: com CPF na
nota, dá para achar depois na Nota Fiscal Gaúcha e colar o link.

### F2. Conferência e “Ainda está no Zaffari?”

- O veredito vem primeiro. Pode ser **Tudo certo**, **Provavelmente certo**
  (o desconto do fim cobre a diferença) ou **R$ X cobrados a mais**.
- Havendo diferença, uma pergunta: **Ainda está no Zaffari?**
  - **Ainda estou**: o atendimento resolve na hora, sem fila do caixa.
  - **Já saí**: fica guardado para a próxima ida.
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

## 5. Retorno ao usuário (canais)

| Momento | Visual | Som | Vibração |
|---|---|---|---|
| Etiqueta lida | Realce no preço, pílula, linha acende | Clique curto, opcional | Não (o iPhone não deixa) |
| Item riscado da lista | Círculo enche, barra anda | Nenhum | Não |
| Pergunta do cartão | No lugar da pílula, sem tapar a câmera | Nenhum | No toque no botão, se o sistema der |
| Tudo certo | Marca de conferido, fim curto | Um som suave | Não |
| Cobrado a mais | Número grande em vermelho, sempre com sinal e rótulo | Nenhum (sem alarme) | Não |
| Devolveram | Valor recuperado e total | Um som suave | Não |

A cor nunca vem sozinha: “+2,00”, “A mais” e o número têm rótulo. Nada de
alerta modal.

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
- **Uma mão.** Nada de importante no topo da tela; a câmera lê sem botão.

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

**v1:** tudo acima, para o Zaffari (RS, NFC-e com chave 43).

**Depois:**

1. **Carrinho completo (ideia B) e limite.** Cada item do carrinho conta; o
   total é real; o limite volta aqui.
2. **Aprender os nomes por loja.** Cada “É o mesmo” confirmado ensina o par
   etiqueta → nota daquela rede, no aparelho.
3. **Outras redes.** Formato da etiqueta, do clube e de onde cai o desconto
   em cada uma (Nacional, Carrefour, Asun, Unidasul…).
4. **Outros estados.** NFC-e fora do RS.
5. **Promoções mais complexas.** “2ª unidade 50%”, “a partir de 3”,
   atacarejo.
6. **Resumo do mês.** Quanto voltou e onde mais apareceu diferença, sem virar
   histórico de preço.

## 11. Para decidir

1. O limite sai da v1 e volta com o carrinho completo. Concorda?
2. **Fui pro caixa** como botão. A outra opção seria o app perceber sozinho,
   quando a lista termina, mas nem sempre a lista termina.
3. Som curto ao ler a etiqueta: ligado ou desligado de início?
4. **Não resolveram** com caminho até o consumidor.gov.br já na v1, ou depois?

Antes de implementar, preciso de fotos reais de etiquetas do Zaffari junto
com a **nota da mesma compra**: com e sem Cartão Zaffari, de quilo, de
leve-mais e de oferta com prazo. Elas testam a hipótese do código interno, que
pode tornar o casamento exato.

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
