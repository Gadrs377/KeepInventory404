# Design novo (proposta de 30/09/2026)

Crítica do [plano de melhorias](PLANO_MELHORIAS.md) e o desenho que sai dela:
câmera, todos os modos e as telas do app. **Nada disto está no app.** É para
discutir antes de aplicar.

Critérios usados: o nosso [design system](DESIGN_SYSTEM.md) (direção "caixa
do mercado"), a [HIG da Apple](APPLE_HIG.md), retorno, fricção, obscuridade,
posição na tela e ciência do comportamento.

---

## 1. Crítica do plano

### 1.1 O plano esquece o maior risco do app: a Saída esquecida

O armário só fica certo se o que sai for registrado. Guardar tem um gatilho
natural (chegou do mercado, tem a nota fiscal). **Tirar não tem**: a pessoa
está cozinhando, com a mão ocupada, e o registro é um custo sem recompensa na
hora. É o padrão clássico de hábito que não pega (sem gatilho, sem recompensa
imediata).

O plano mede isso (diferenças da Contagem, seção 3.3 do plano), mas quase não
age. No desenho:

- **Tirar custa um toque a menos:** o "−" da linha do Armário continua, e o
  leitor abre no último modo usado.
- **Quando algo acaba, a recompensa é imediata:** "Acabou. Era a última." com
  "Pôr nas Compras" ali mesmo. Registrar a saída passa a render a lista de
  compras, e não só a trabalho.
- **O Conferir mostra o que ficou errado** ("Era 1, contou 3") e corrige numa
  passada.
- **"Joguei fora"** é um Tirar no momento em que o produto vai para o lixo, que
  é quando a pessoa lembra (já decidido no ROADMAP para as embalagens com várias
  unidades).

### 1.2 Troca de modo sem querer (erro de modo)

Guardar e Tirar usam o mesmo gesto (ler o código). Isso é o que Don Norman
chama de **erro de modo**, e é silencioso. Defesas em camadas, todas no
desenho:

1. **O modo fica longe do polegar:** o seletor Guardar/Tirar fica na faixa do
   alto. Trocar é uma decisão, não um esbarrão. Nada de arrastar a imagem.
2. **A faixa inteira tem a cor do modo** (verde ou beterraba), no canto do olho.
3. **O sinal está onde o olho está:** o cartão da leitura mostra **+1** ou
   **−1** numa etiqueta na cor do modo.
4. **O som também muda** (Proposto): bip que sobe para Guardar e que desce para
   Tirar. É retorno por mais de um canal, como pede a HIG.
5. **O − do cartão desfaz** na hora, sem procurar.

### 1.3 O voto "pelo uso" nos nomes da comunidade é enviesado

Eu tinha proposto que salvar sem mexer no nome valesse como "é isso". Mas a
maioria das pessoas aceita o que vem pronto (**efeito padrão** e **viés de
automação**): quem não troca um nome ruim não está confirmando nada, só está
com pressa. Os votos iam confirmar nomes errados.

**No desenho:** o voto é **explícito e de um toque** ("É este" / "Não é
este"), e só aparece quando o nome é da comunidade. Não votar não conta nada.

### 1.4 "Usar o que a IA leu" por último: o primeiro da lista ganha

Numa lista, as pessoas tendem a escolher o primeiro item (**efeito de
primazia**). Se a busca pelas lojas trouxer produtos errados em cima, eles vão
ser escolhidos, e o nome "em aramaico" entra do mesmo jeito.

**No desenho** (mantendo a decisão de deixar "Usar o que está na embalagem"
por último):

- o que a IA leu aparece **no topo, como contexto** ("Na embalagem: Pó para
  Pudim Baunilha Royal 50g");
- **só entram resultados da mesma marca e do mesmo tamanho** que a IA leu. Se
  nenhum bate, a lista fica só com "Usar o que está na embalagem".

### 1.5 Textos que falam de si

O design system proíbe o texto de falar de si ("nada de 'o app faz' nem 'não
entendi'"). O plano e o primeiro desenho quebravam isso:

| Antes | Agora |
|---|---|
| Não achei este código nas lojas | Nenhuma loja tem este código |
| Achei na internet: X · É esse? | Na internet: X · É este? |
| Vi o QR Code de uma nota | Nota fiscal do Zaffari |
| Achei uma data. Segure mais um pouco | (sem texto; a moldura muda de cor) |
| Não tenho certeza. Confira onde fica. | (só depois do nome; sem "tenho") |

E os termos fixos: o leitor passa a dizer **Guardar** e **Tirar** em vez de
"Entrada" e "Saída". O resto do app já usa esses verbos, e verbo diz a ação.

### 1.6 Trocar o cupom por um aviso tira o ponto alto

O plano sugeria trocar o cupom depois do Concluir por um aviso ("3 produtos
guardados · Ver cupom"). Pela **regra do pico e do fim**, as pessoas lembram
de uma experiência pelo momento mais forte e pelo fim. O cupom saindo da
impressora é esse momento, e é a identidade do app ("caixa do mercado").

**No desenho:** o cupom fica **vivo dentro do leitor**, enchendo enquanto se lê
(com a linha nova destacada). No Concluir, a impressão continua, mas curta e
fechável com um toque em qualquer lugar.

### 1.7 O primeiro desenho da câmera quebrava o design system

| Regra do design system | Primeiro desenho | Agora |
|---|---|---|
| Fundo branco, fios, cor só com significado | Tudo escuro | Papel branco; a câmera é uma janela |
| Vidro só na camada que flutua; no máximo 2 | Cartões, dicas e bandeja em vidro | Vidro só na barra de baixo e na lanterna |
| Etiqueta de gôndola, cupom, linha vermelha | Nenhum dos três | Os três de volta |
| Faixa do topo mostra o modo | Pílula no rodapé | Faixa na cor do modo |
| Ícone só se universal | "Sem código?" em pílula | "Digitar" e "Nota fiscal" com nome |

### 1.8 Conferir o armário pode cansar

Juntar Contar e Validade numa passada é bom, mas a passada fica longa (23
produtos, uns 40 s cada). Contra o cansaço:

- **Progresso sempre à vista** ("9 de 23", anel na faixa). Perto do fim a pessoa
  acelera (**efeito do gradiente de meta**).
- **"Pular"** na data: a data nunca trava a contagem.
- **Revisar a qualquer hora**, sem precisar chegar ao fim.
- O que já tem data **não para nada**: aparece no cartão e a câmera segue.

### 1.9 O tempo de virar o produto (da telemetria)

Depois do código, a pessoa leva de 1 a 6 s virando o produto. O desenho usa
esse tempo em vez de brigar com ele:

- o produto sobe para o topo e a mira vira uma faixa de data;
- o texto diz **"Vire e mostre a data"** e, embaixo, "Sem pressa: a câmera
  espera você virar o produto";
- nada exige toque nesse intervalo.

### 1.10 Folha em cima de câmera que parece viva

A telemetria e o relato mostraram: com a folha aberta, a imagem seguia ao
vivo, e ele continuava apontando. **No desenho:** quando uma folha abre sobre
o leitor, a câmera **escurece** e mostra **"Câmera pausada"**. E o caso mais
comum ("todas já têm data") nem abre folha: vira o cartão.

### 1.11 Uma folha por vez

A HIG pede uma folha por vez. O "código novo" tem 4 passos (sem loja → foto →
lendo → é um destes → formulário). **É uma folha só que muda de conteúdo**,
não folhas empilhadas.

### 1.12 A internet chegando no meio da decisão

As opções aparecem aos ~2,5 s, com a busca na web ainda rodando. Se o
resultado da web empurrar os botões para baixo, a pessoa toca no botão
errado. **No desenho:** o resultado da web ocupa **o lugar da linha "Ainda
procurando na internet"**, embaixo dos botões. Nada se mexe em cima.

### 1.13 A espera da foto

A leitura da embalagem leva ~5 s. Espera com a **própria foto à vista** e uma
**barra de progresso que anda**, dizendo o que está sendo feito ("Nome, marca e
tamanho", depois "Procura nas lojas"). Espera explicada parece mais curta.

### 1.14 Backup está tarde demais na ordem

As datas de uma noite inteira estão só num celular. Perder isso dói mais do
que ganhar qualquer tela nova (**aversão à perda**), e a cópia automática é
barata. **Proposta:** subir o backup automático para logo depois da
telemetria.

### 1.15 Aviso de vencimento sem virar barulho

- **Horário fixo**, criando o hábito: um resumo no **sábado de manhã** (antes da
  lista de compras) e um aviso na **véspera** do que vence.
- **A permissão é pedida na hora certa** (HIG): depois da primeira data salva
  ("Avisar quando algo for vencer?"), nunca ao abrir o app.
- Liga e desliga em Mais › Avisos.

### 1.16 "Joguei fora" não é vermelho

O vermelho do design system é só para erro e ação destrutiva. Jogar fora um
produto vencido é um **Tirar** comum, então fica na cor do Tirar (beterraba).
O vermelho fica para "Remover do armário" (apagar o produto), que vai para o
fim do Editar, em texto.

---

## 2. O desenho novo

### 2.1 App: Armário, Produto, Editar e Mais

![Armário, Produto, Editar, Mais](design-novo/1-app.webp)

- **Armário:**
  - uma ação só no topo, **"Conferir"**, ao lado do título grande (HIG). Saem
    as pílulas Validade e Nota fiscal;
  - **"Pede atenção"** no lugar dos filtros Acabando, Zerados e Vencendo: "2
    vencem esta semana", "3 acabando", "5 sem validade". Cada um abre a ação
    certa;
  - o botão **Ler tem cor fixa** (preto, branco no escuro); a cor do modo
    aparece só dentro do leitor;
  - 4 abas de ambiente, que cabem em 320 px.
- **Produto:**
  - foto, nome, **−/3/+** com a etiqueta grande, Validades (com "Marcar" na
    linha sem data) e Histórico;
  - saem a quantidade repetida no Editar, o "Onde fica" repetido, o quadro
    Consumo vazio e o "Nome estranho?".
- **Editar:** Salvar em destaque. **"Remover do armário" em texto vermelho,
  longe, no fim.** O código do produto fica em nota de rodapé.
- **Mais:**
  - só o que é da pessoa: Conferir o armário, Cupons, Avisos, Seus dados (cópia
    automática com a hora da última) e Som;
  - o técnico (Diagnóstico, Testes) vai para **Avançado**, no fim.

### 2.2 Leitor: Guardar e Tirar

![Guardar esperando, lido, Tirar acabou, nota fiscal](design-novo/2-leitor.webp)

- **Faixa na cor do modo**, com o seletor **Guardar / Tirar** no alto.
- **Câmera como janela**, com a mira de código e a **linha vermelha do caixa**.
  Lanterna no canto, em vidro.
- **Leu:**
  - moldura na cor do modo;
  - **cartão sólido** encostado na câmera: foto, nome, "Agora 5 no armário" e
    **− [+1] +** (a etiqueta na cor do modo);
  - o −/+ substitui o "Rápido" e o Desfazer.
- **Cupom vivo** embaixo, com a linha nova destacada e o total sob o traço duplo.
- **Barra de baixo** (vidro): **Digitar** e **Nota fiscal**, depois **Digitar**
  e **Concluir**. Tudo com nome, ao alcance do polegar.
- **Tirar que acaba:** "Acabou. Era a última." e **Pôr nas Compras**.
- **Nota fiscal:** no Guardar, a câmera reconhece o QR Code sozinha: "Nota fiscal
  do Zaffari · 29/09 · 7 itens · R$ 160,59" com **Guardar os 7**. O botão Nota
  fiscal continua na barra, para quem não sabe que é só apontar.
- **Vazio:** "Nada lido ainda. Cada leitura guarda 1. Leu duas vezes, guarda
  2." (No lugar do vazio grande de hoje.)

### 2.3 Código novo

![Nenhuma loja, lendo, é um destes, formulário, comunidade](design-novo/3-codigo-novo.webp)

1. **Nenhuma loja tem este código** (aos ~2,5 s):
   - a câmera escurece com "Câmera pausada";
   - botão principal **Fotografar a frente**, com o texto "Fotografe a frente da
     embalagem, onde está o nome";
   - secundário **Digitar o nome**;
   - embaixo, "Ainda procurando na internet".
2. **Lendo a embalagem:** a foto à vista, barra de progresso, "Nome, marca e
   tamanho", depois "Procura nas lojas".
3. **É um destes?**
   - "Na embalagem: …" no topo;
   - só resultados da mesma marca e tamanho;
   - **Usar o que está na embalagem** por último;
   - rodapé explicando o filtro.
4. **Produto novo:**
   - a foto da frente com **"Foto só neste celular"**;
   - ao tocar no nome (aqui, um nome estranho vindo da busca), aparece **"Usar
     o que está na embalagem: Pó para Pudim Baunilha Royal 50g"**;
   - Onde fica, Quantidade e **Guardar 1**.
5. **Nome da comunidade:** o nome com o selo **"Nome sugerido por outra
   pessoa"** e o voto de um toque **É este / Não é este**.

### 2.4 Conferir o armário (Contar + Validade)

![Conferir, data, já tem data, vencido, revisão](design-novo/4-conferir.webp)

- **Faixa azul** (a cor da Contagem) com "Conferir o armário · 8 de 23" e o
  anel de progresso.
- **Cupom "Conferidos"** com ✓ ou a data marcada, e "8 conferidos · 15 faltam".
- **Produto sem data:**
  - o cartão sobe para o topo, com a quantidade ajustável;
  - a mira vira **faixa de data** (amarela), com **"Vire e mostre a data"**;
  - embaixo, **Digitar a data** e **Pular**.
- **Já tem data:** sem folha. O cartão mostra as datas (12/03/2027 · 2 un.,
  08/10/2026 · 1 un.) e "Confere? Leia o próximo. Se o número está errado,
  ajuste no − e +."
- **Vencido:** "**Venceu há 2 meses** · 28/07/2026", com **Joguei fora** (cor do
  Tirar) e **Ainda está bom**. Rodapé: "Joguei fora tira do armário. Você
  escolhe se vai para as Compras."
- **Revisão:**
  - resumo em números (conferidos, diferenças, datas marcadas);
  - **Não apareceram**, com "Acabou" na linha;
  - **Diferenças** ("Era 1, contou 3 · +2");
  - **Aplicar e concluir**.

### 2.5 Escuro

![Armário, Guardar, Conferir e Produto novo no escuro](design-novo/5-escuro.webp)

As mesmas regras, com as cores escuras do design system: faixas em tom claro
com texto escuro, papel escuro, o cupom continua claro (é papel).

---

## 3. O que isto muda no plano

| Item do plano | Muda para |
|---|---|
| 6.2 voto pelo uso (salvar sem mexer = "é isso") | Voto explícito de um toque, só em nome da comunidade |
| 5.4 "É um destes?" | O que a IA leu no topo como contexto; só resultados da mesma marca e tamanho |
| 8.3 item 12, trocar o cupom por aviso | Cupom vivo no leitor; a impressão no fim fica curta e fechável |
| 7.3 câmera cheia com bandeja | Câmera como janela, cartão sólido e cupom vivo (volta ao design system) |
| 7.4 "Sem código? Buscar pelo nome" | "Digitar" na barra de baixo (código ou nome) |
| Entrada / Saída no leitor | Guardar / Tirar |
| Ordem de execução | Backup automático logo depois da telemetria |
| Contar em Mais, Validade e Nota fiscal no Armário | "Conferir" no topo do Armário (e em Mais); Nota fiscal dentro do leitor |

## 4. Em aberto

1. Som diferente para Guardar (sobe) e Tirar (desce)?
2. O leitor abre no último modo usado, ou sempre em Guardar?
3. "Pede atenção": os três blocos (vencem, acabando, sem validade), ou outros?
4. Conferir substitui de vez o Contar e o modo Validade, ou os dois continuam
   existindo separados?
5. Resumo de vencimento no sábado de manhã: esse horário serve para vocês?
