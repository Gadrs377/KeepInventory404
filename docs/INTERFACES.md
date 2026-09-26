# Interfaces do KeepInventory404

Planejamento de cada tela antes do código. Todas compartilham os mesmos
componentes do [design system](DESIGN_SYSTEM.md) e falam com o estoque só pelas
regras de `store.js` descritas no [system design](SYSTEM_DESIGN.md).

## Mapa de navegação

```
                    ┌──────────────┐
          ┌────────►│   Armário    │◄──────────┐
          │         │     #/       │           │
          │         └──┬───┬───┬───┘           │
          │   Entrada  │   │   │ Contar        │ Aplicar
          │            ▼   │   ▼               │
          │   ┌─────────┐  │  ┌────────────┐  ┌┴───────────┐
          │   │ Leitor  │  │  │  Contagem  │─►│  Revisão   │
          │   │#/entrada│  │  │#/inventario│  │#/revisao   │
          │   └─────────┘  │  └────────────┘  └────────────┘
          │        Saída   ▼
          │   ┌─────────┐        toque em item
          │   │ Leitor  │   Armário ──────────► ┌─────────────┐
          │   │ #/saida │                       │  Produto    │
          │   └─────────┘                       │#/produto/:c │
          │                                     └─────────────┘
          ├── menu ─────────► ┌──────────┐
          │                   │  Dados   │
          │                   │ #/dados  │
          │                   └──────────┘
          └── Compras ──────► ┌──────────┐
                              │ Compras  │
                              │#/compras │
                              └──────────┘
```

As folhas (produto lido, escolha entre produtos, digitar código) abrem por cima
da tela atual e não mudam o endereço.

---

## 1. Armário `#/`

Tela inicial. Responde "quanto tem de cada coisa?".

```
┌─────────────────────────────────┐
│ Armário                     [≡] │  ≡ abre Dados
│ 23 produtos, 4 acabando         │  resumo
│ [Compras] [Contar]              │  outras telas
│ ┌─────────────────────────────┐ │
│ │ Buscar no armário           │ │
│ └─────────────────────────────┘ │
│ Tudo  Cozinha  Limpeza  Beleza  │  ambientes, o ativo sublinhado
│ ‾‾‾‾                            │
│ [■ Acabando 4] [▭ Vencendo 1]   │  filtros de estado, só os que têm algo
│ ┌ Leite vence em 2 dias. [Ver o que vence] ┐  aviso amarelo (vence nesta semana)
├─────────────────────────────────┤
│ [img] Leite condensado     ┌──┐ │
│       Moça, 395 g          │ 3│ │  etiqueta escura
├────────────────────────────└──┘─┤
│ [img] Arroz branco         ┌──┐ │
│       Tio João, 5 kg       │ 1│ │  etiqueta amarela (acabando)
├────────────────────────────└──┘─┤
│ [img] Feijão preto         ┌╌╌┐ │
│       Kicaldo, 1 kg        ╎ 0╎ │  etiqueta tracejada (zerado)
│                            └╌╌┘ │
├─────────────────────────────────┤
│ ┌──────────────┐┌─────────────┐ │
│ │  ↓ Entrada   ││   ↑ Saída   │ │  as duas ações do dia a dia
│ └──────────────┘└─────────────┘ │
└─────────────────────────────────┘
```

- O inventário é feito de vez em quando, então fica no topo como ação
  secundária (**Contar**) e não disputa espaço com Entrada e Saída.
- Ordem: acabando primeiro, depois alfabética. No filtro Vencendo, o que vence antes.
- Ambientes: Cozinha, Banheiro e limpeza, Beleza e cuidados. O app sugere pelo
  tipo de produto; a pessoa troca na página do produto.
- A linha mostra "Vence em 3 dias" (em negrito na última semana) quando algum
  lote vence nos próximos 30 dias.
- Busca filtra por nome, marca ou código enquanto digita.
- Vazio: "Comece pela Entrada." e uma frase com o passo a passo.

## 2. Leitor `#/entrada` e `#/saida`

Mesma tela, duas cores. A faixa do modo ocupa o topo inteiro.

```
┌─────────────────────────────────┐
│█ Entrada                    ✕ █│  faixa verde (ou beterraba em Saída)
│█ Aponte para o código de barras█│
│█ (●  ) Modo rápido             █│  cada leitura conta 1, sem folha
├─────────────────────────────────┤
│                                 │
│        vídeo da câmera          │
│    ┌─                     ─┐    │
│    ───── linha vermelha ──────   │  mira com a linha do leitor do caixa;
│    └─                     ─┘    │  ao ler: bip, vibração e a linha pisca
│                                 │
├─────────────────────────────────┤
│   ( Lanterna | Digitar código ) │  grupo de vidro sobre a imagem
│ (Não está lendo? Buscar pelo nome) depois de 9 s sem leitura
├─────────────────────────────────┤
│ ┌╌ Para resolver ╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │  só no modo rápido: códigos novos
│ ╎ Produto novo      [Resolver] ╎ │  ou com vários produtos
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
├─────────────────────────────────┤
│ Leite condensado ........... +2 │  cupom: um item por linha
│ Arroz branco ............... +1 │
│ ═══════════════════════════════ │
│ 2 produtos                   +3 │  total
├─────────────────────────────────┤
│ [          Concluir           ] │  mostra o cupom impresso
└─────────────────────────────────┘
```

### Cupom (ao concluir)

```
┌─────────────────────────────────┐
│ Pronto                        ✕ │
│ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │  boca da impressora
│   │         ENTRADA         │   │  o papel desce dela
│   │     26/09/2026 21:14    │   │
│   │ Leite condensado ... +2 │   │
│   │ ficou 3                 │   │
│   │ ═══════════════════════ │   │
│   │ 2 produtos           +3 │   │
│   │   ||||||||||||||||||    │   │
│   └╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲┘   │  borda rasgada
│ [      Voltar ao armário      ] │
│ [      Compartilhar cupom     ] │  texto pelo compartilhar do celular
└─────────────────────────────────┘
```

### Folha do produto (após ler)

```
┌─────────────────────────────────┐
│ ▔▔▔                          ✕  │
│ [foto]  Leite condensado        │
│         Moça, 395 g             │
│         No armário: 3           │
│                                 │
│    ┌───┐              ┌───┐     │
│    │ − │      2       │ + │     │  seletor, número grande condensado
│    └───┘              └───┘     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │        Adicionar 2          │ │  cor do modo
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Variações:

| Situação | O que muda |
| --- | --- |
| Produto novo, achado na internet | Mostra "Novo no armário". Nome vem preenchido e pode ser editado |
| Produto novo, não achado | "Não encontramos esse código. Digite o nome para cadastrar." Campo nome em foco; botão só habilita com nome |
| Buscando na internet | Ícone de pacote e "Buscando produto" |
| Sem internet | Mensagem e botão "Buscar de novo" |
| Saída, estoque 0 | Bip de erro. "Não tem nenhum no armário." Botão principal vira Fechar |
| Saída, produto não cadastrado | Bip de erro. "Esse produto não está no armário." Botão "Cadastrar como entrada" leva ao modo Entrada com a folha aberta |
| Código com um produto (entrada ou contagem) | Link no fim: "Não é este? Cadastrar outro produto com este código" |
| Código com vários produtos | Abre antes a folha **Qual destes?** (abaixo) |
| Saída | Seletor vai de 1 até o estoque atual; botão "Dar baixa em N" |

Depois de confirmar: a folha fecha, aparece o aviso "Adicionado 2. Leite
condensado agora tem 5" com **Desfazer** e um X, e o leitor volta a ler. O
aviso fica acima da barra de baixo até ser fechado, trocado por outro ou até
sair da tela; se outra folha abrir, ele fica atrás dela e volta depois.

Com teclado: a folha recebe o foco ao abrir, o resto da tela fica inativo, Esc
fecha e o foco volta para onde estava.

### Folha "Qual destes?" (um código, vários produtos)

```
┌─────────────────────────────────┐
│ Qual destes?                 ✕  │
│ O código 7891000100103 está em  │
│ 2 produtos do armário.          │
├─────────────────────────────────┤
│ [img] Leite condensado     ┌──┐ │
│       Moça, 395 g          │ 3│ │  quem tem mais estoque vem primeiro
├────────────────────────────└──┘─┤
│ [img] Leite cond. desnatado┌──┐ │
│                            │ 1│ │
├────────────────────────────└──┘─┤
│ [ Outro produto com este código]│  cadastra mais um com o mesmo código
└─────────────────────────────────┘
```

- Tocar numa linha abre a folha normal daquele produto.
- Em Saída, linhas com estoque 0 ficam apagadas; tocar nelas dá bip de erro e
  avisa "Nenhum no armário. Escolha outro." O botão "Outro produto" não
  aparece, porque não dá para tirar o que não foi cadastrado.
- "Outro produto com este código" abre o cadastro com o texto "Outro produto
  com o mesmo código de barras. Dê um nome que diferencie os dois, por exemplo
  o sabor."
- Na contagem funciona igual: a folha "Quantos tem?" abre para o produto
  escolhido.

### Validade na folha de entrada

Escondida atrás de **Adicionar validade** (a maioria das leituras não precisa).
O campo aceita como vem impresso: `15/10/26`, `15/10/2026`, `10/26` ou `10/2026`;
as barras entram sozinhas e a linha de baixo confirma "Vence em 31/10/2026,
daqui a 35 dias". Só mês e ano vale até o último dia do mês.

### Folha de produto novo e Buscar pelo nome

Nome com sugestões (primeiro o que já está no armário, depois as lojas),
**Tirar foto da embalagem** quando o código não foi achado, e **Onde fica**
(Cozinha, Limpeza, Beleza) já escolhido pela regra de ambientes. Na Saída, Buscar
pelo nome lista só o que está no armário.

### Folha Digitar código

```
│ Código de barras                │
│ ┌─────────────────────────────┐ │  teclado numérico
│ │ 7891000100103               │ │
│ └─────────────────────────────┘ │
│ [       Buscar produto        ] │
│   Cadastrar produto sem código  │  link: gera código interno
```

## 3. Contagem `#/inventario`

O botão **Contar** da tela inicial abre esta tela. O nome é o mesmo em tudo:
tela Contagem, botões "Salvar contagem" e "Aplicar contagem".

Contagem física do armário. Serve para corrigir diferenças acumuladas.

```
┌─────────────────────────────────┐
│█ Contagem                   ✕ █│  faixa azul
│█ 12 de 23 produtos contados   █│
├─────────────────────────────────┤
│    [ vídeo da câmera menor ]    │
│ [Lanterna]      [Digitar código]│
├─────────────────────────────────┤
│ Faltam contar                   │
│ [img] Feijão preto   era 2  [ ]│  toque abre a folha "Quantos tem?"
│ [img] Café           era 1  [ ]│
│ Contados                        │
│ [img] Arroz branco   era 1  ┌─┐│
│                             │2││  etiqueta azul com o contado
├─────────────────────────────────┤
│ [          Revisar          ]   │
└─────────────────────────────────┘
```

- A folha é a mesma do leitor, com o título "Quantos tem?", seletor começando
  na quantidade do sistema (ou na já contada) e botão **Salvar contagem**.
- Ler um código novo durante o inventário cadastra o produto com a quantidade
  contada. Se o código estiver em vários produtos, abre antes "Qual destes?".
- O ✕ pergunta: "Guardar a contagem para continuar depois?" (Guardar /
  Descartar).

## 4. Revisão `#/revisao`

```
┌─────────────────────────────────┐
│█ Revisar contagem           ← █│
├─────────────────────────────────┤
│ 3 produtos vão mudar            │
│ Arroz branco        1 → 2   +1  │  verde
│ Café                4 → 3   −1  │  beterraba
│ Óleo                2 → 0   −2  │
│                                 │
│ 11 não foram contados           │
│ ( ) Manter como estão           │
│ ( ) Zerar os não contados       │
├─────────────────────────────────┤
│ [       Aplicar contagem      ] │
└─────────────────────────────────┘
```

Aplicar grava os ajustes, apaga o rascunho e volta ao Armário com o aviso
"Contagem aplicada. 3 produtos ajustados."

## 5. Produto `#/produto/:codigo`

```
┌─────────────────────────────────┐
│ ←                               │
│ [foto grande]                   │
│ Leite condensado          ┌───┐ │
│ Moça, 395 g               │ 5 │ │  etiqueta grande
│ Código 7891000100103      └───┘ │
├─────────────────────────────────┤
│ Nome          [Leite condensado]│
│ Marca         [Moça            ]│
│ Tamanho       [395 g           ]│
│ Onde fica  [Cozinha|Limpeza|Beleza] seletor segmentado
│ Avisar com    [ 1 ] ou menos    │
│ Quantidade    [ − ] 5 [ + ]     │  ajuste manual
│ [          Salvar             ] │
├─────────────────────────────────┤
│ Validade                        │
│ 29/09/2026  1 unidade, daqui a 3 dias  🗑 │  data amarela na última semana
│ 31/10/2026  2 unidades, daqui a 35 dias 🗑│
│ [Marcar validade] [Lembrete no calendário] .ics com alarme 3 dias antes
├─────────────────────────────────┤
│ Consumo                         │
│ Vocês usam cerca de 3 por semana. O que tem dá para uns 5 dias.
├─────────────────────────────────┤
│ Histórico                       │
│ Entrada de 2       hoje 19:40   │
│ Saída de 1         ontem 12:10  │
│ Contagem +1        20/09        │
├─────────────────────────────────┤
│ Remover do armário              │  pede confirmação
└─────────────────────────────────┘
```

## 6. Compras `#/compras`

```
┌─────────────────────────────────┐
│ ← Compras                       │
│ 3 itens para comprar.           │
│ Cozinha                         │  agrupado por ambiente
│ ☐ [img] Arroz Tio João       2  │  quantidade sugerida
│         Acabando, tem 1, cerca de 3 por semana
│ Outros                          │
│ ☐ Pão                        ✕  │  itens soltos
│ Acrescentar à lista [____][Acrescentar]
│ Vocês fazem compras a cada [− 7 +] dias
│ Perguntar ao Claude             │
│ [Revisar a lista comigo]        │  abre claude.ai com a pergunta escrita
│ [Receitas com o que vence]      │  só quando algo vence em 30 dias
│ [      Compartilhar lista     ] │  barra flutuante
└─────────────────────────────────┘
```

- Marcar risca o item. Quando o produto é reposto e sai da sugestão, a marca some.
- Nada vai para o Claude sem a pessoa tocar em Enviar lá.

## 7. Cupons `#/cupons`

Aberto por Dados. Lista os últimos 60 cupons (Entrada, Saída, Contagem), com o
ícone do modo, a data e o total. Tocar abre o cupom de novo, sem vibrar e com
o botão Fechar. Os cupons entram no backup.

## 8. Atalhos no ícone do app

Segurar o ícone do app instalado mostra Entrada, Saída, Compras e Contar
(`shortcuts` no `manifest.webmanifest`, ícones em `icons/atalho-*.png`).

## 9. Dados `#/dados`

```
│ ← Dados                         │
│ Seus dados ficam só neste       │
│ celular. Faça backup de vez em  │
│ quando.                         │
│ [ Baixar backup ]               │  .json
│ [ Restaurar backup ]            │  substitui tudo, pede confirmação
│ [ Baixar planilha ]             │  .csv para abrir no Excel/Sheets
│ Bip ao ler um código      (●)   │  liga e desliga o som
│ Histórico completo (últimos 100)│
│ Instalar: menu do navegador →   │
│ Adicionar à tela inicial        │
```

## Consistência entre telas

| Regra | Aplicação |
| --- | --- |
| A cor diz o modo | Verde só aparece em entrada, beterraba em saída, azul em contagem, amarelo em estoque baixo |
| Uma folha para tudo | Entrada, saída e contagem usam a mesma folha de produto, mudando título, limites do seletor e botão. A escolha entre produtos do mesmo código também é a mesma nos três modos |
| O som confirma | Bip agudo em toda leitura pela câmera; bip grave duplo quando o código não pode ser usado |
| O número é a etiqueta | Onde houver quantidade de estoque, ela aparece no componente etiqueta |
| Sempre dá para voltar atrás | Todo registro mostra Desfazer; exclusão e restauração pedem confirmação |
| Rodapé para o polegar | Ações principais ficam na metade de baixo da tela |

## Versão 3.2: menos passos, tela inicial mais limpa

Mudanças guiadas por "como a Apple faria" e pelas skills better-layout e liquid-glass:

- **Baixa sem câmera:** cada linha do Armário tem um botão "−" (48 px) que tira 1
  na hora, com Desfazer no aviso. A lista não reordena depois do "−" (um produto
  que vira "acabando" não pula para o topo debaixo do dedo); volta a ordenar ao
  buscar, filtrar ou trocar de ambiente.
- **Tela inicial:** saíram o resumo, a fileira Compras/Contar e o aviso amarelo de
  validade. O cabeçalho tem dois ícones (carrinho e ≡). As abas de ambiente só
  aparecem quando há produtos em mais de um ambiente. O filtro Vencendo fica
  amarelo quando algo vence nesta semana.
- **Leitor único:** Entrada e Saída são a mesma tela. O seletor na faixa troca o
  modo e a cor sem desligar a câmera (`#/entrada` e `#/saida` só dizem como ela
  abre). Modo rápido é lembrado por modo e vem ligado na Saída. Uma sessão pode
  ter entradas e saídas; o cupom sai como "Entrada e saída".
- **Produto:** "Quantidade no armário" virou um bloco próprio no topo, com o botão
  "Corrigir para N" (só aparece quando o número muda) e Desfazer. "Salvar
  detalhes" grava só nome, marca, tamanho, ambiente e mínimo.
- **Mais (≡):** lista agrupada como os Ajustes do celular: Contar o armário,
  Cupons, Lista de compras; Backup; Som.
- **Folhas sobre a câmera** são sólidas: o vidro borrava o vídeo em manchas que se
  mexiam atrás do texto.

## Versão 3.3

- **Editar antes de concluir:** no leitor, tocar numa linha da sessão abre uma
  folha com a quantidade registrada (0 tira a linha e devolve o estoque), o nome
  e o ambiente. A diferença vira um ajuste no estoque.
- **Cupom ao arrastar:** o papel era desenhado com máscara, recorte e filtro de
  sombra juntos, e ficava em branco ao arrastar ou rolar a folha no celular.
  Agora os dentes são um fundo simples e a sombra é comum; a folha segue o dedo
  sem atraso.
- **Zaffari:** entrou no repassador, primeiro na busca por nome e com
  preferência na busca por código (tinha 12 de 22 produtos da amostra de fotos).

## Versão 3.4

- **Saída de código desconhecido:** em vez de só oferecer cadastro, a folha pergunta
  o que houve: "É um produto que já está no armário" (escolhe o produto e o código
  passa a abri-lo; a saída continua), "Esqueci de cadastrar" (cadastra com o que
  sobrou) ou "Leu errado" (fecha e volta a ler). No código digitado, o dígito de
  controle é conferido antes de buscar.
- **Toque duplo:** `touch-action: manipulation` tira o zoom de toque duplo; a pinça
  continua funcionando.
- **Háptico:** Android usa `navigator.vibrate`. No iPhone (iOS 18 ou mais novo) o
  app alterna um interruptor nativo invisível, que faz o celular vibrar de leve.
  Só funciona em toques da pessoa (−1, seletor, trocar de modo), não na leitura
  automática da câmera.
- **Vidro:** barras do topo de Produto, Compras, Mais e Cupons fixas e em vidro;
  filtros do Armário dentro da faixa de vidro da busca; avisos em vidro tingido a
  94%; brilho que nasce do ponto do toque nos botões de vidro e no seletor de modo.
- **Leitor:** a linha "Aponte para o código de barras" só aparece com o modo rápido
  ligado (para explicá-lo).

## Versão 3.5: barra de abas e princípios da Apple

- **Barra de abas** (como no iPhone e no WhatsApp): Armário, Compras, Cupons e
  Mais numa cápsula de vidro embaixo; a aba ativa tem o ícone cheio. Separado, à
  direita, um botão redondo com o código de barras abre o leitor no último modo
  usado (Entrada ou Saída), na cor desse modo. Substitui a barra Entrada/Saída e
  os ícones do topo do Armário.
- **Títulos grandes** iguais nas quatro telas principais; Compras e Cupons deixaram
  de ter seta de voltar (são abas).
- **Só símbolo:** Lanterna e Digitar código na câmera, Compartilhar lista e
  Compartilhar cupom (no topo), "+" de acrescentar item. Todos com nome para leitor
  de tela.
- **Saída mais rápida:** um código que não está no armário abre a folha na hora,
  sem esperar a busca na internet (não serve para a saída).
- **Mais:** sem Cupons e Lista de compras (viraram abas); ficam Contar, Backup e Som.


## Versão 3.6: movimento, menus e fontes novas

Revisão pensando em como a Apple faria, com QA de todos os fluxos (câmera
simulada com um vídeo de código de barras e lojas falsas, 32 verificações).

**Fontes.** Urbanist nos títulos, nomes e números; Schibsted Grotesk nos textos.

**Movimento com mola.** As animações usam molas físicas (`--spring`,
`--spring-bouncy`, escritas com `linear()`), não curvas fixas:
- Troca de tela com View Transitions: as abas trocam no lugar; o produto entra
  pela direita e a lista recua; o leitor sobe de baixo como tela modal. A barra
  de abas fica parada.
- Folha: abre com mola e pode ser arrastada para baixo de qualquer ponto quando
  está no topo da rolagem. Fecha por distância (um terço) ou velocidade, e sai
  continuando o gesto.
- O número da etiqueta rola para baixo no −1 e para cima no +1.
- O aviso entra com mola, a caixa das compras desenha o visto e o número da aba
  Compras aparece com um pulinho.
- Com "reduzir movimento" ligado, nada disso roda.

**Menus em vez de telas cheias.**
- Segurar uma linha do Armário (ou botão direito) abre um menu: Tirar 1, Pôr 1,
  Pôr na lista de compras, Ver produto.
- Compras: frequência e Perguntar ao Claude saíram da página e foram para o
  menu "…" do topo. A página ficou só com a lista.
- Produto: os detalhes (nome, marca, tamanho, ambiente, aviso) ficam numa folha
  "Editar" aberta pelo lápis, com Remover no fim, como nos Contatos. A página
  fica para consultar: quantidade, validade, consumo e histórico.

**Detalhes.**
- Número na aba Compras com o que falta comprar.
- Cupons agrupados por dia (Hoje, Ontem, data), como a Carteira.
- Nome do produto em linha própria, sem quebrar no meio da palavra.
- Texto do início vazio fala do botão do leitor (o botão Entrada não existe mais).
- Corrigido um bloco quebrado de CSS de alto contraste do Windows.

## Versão 3.7: título que encolhe, arrastar, leitor limpo e feedback

**Título grande que encolhe.** Nas quatro abas, quando o título grande sai da
tela, aparece o título pequeno numa barra de vidro no topo (no Armário a busca
desce junto). Tocar nele volta ao começo.

**Arrastar a linha.** No Armário, arrastar um produto para a esquerda tira 1
(vinho) e para a direita põe 1 (verde), como no Mail. Passando do ponto, a ação
"arma" (cresce e vibra); arrasto curto volta sem fazer nada. Produto zerado
resiste para a esquerda. O "−" e o toque longo continuam como alternativas.

**Leitor limpo.** A faixa colorida virou uma linha só: fechar, Entrada | Saída e
o botão Rápido (raio, cheio quando ligado). A explicação do modo rápido aparece
embaixo só quando ele está ligado. A câmera ganhou mais espaço.

**O que está acontecendo, sempre à vista.**
- "Abrindo a câmera" com rodinha até a imagem chegar; a linha vermelha "respira"
  enquanto procura um código.
- Ao registrar, aparece em cima da imagem "+1 Leite Moça" (ou −1), que sobe e
  some; a linha nova da sessão entra e acende de leve.
- Buscando um produto: esqueleto do produto e uma frase que muda se a loja
  demorar ("A loja está demorando", depois "Se não achar, você digita o nome").
- Esqueletos no Armário e em Compras enquanto os dados carregam, e linhas
  esqueleto nas sugestões das lojas.
- Botão de salvar mostra rodinha se demorar mais de 300 ms.
- Aviso quando a internet cai e quando volta.
- O número do seletor pula para o lado do toque; o ícone da aba escolhida dá um
  pulinho; o raio do modo rápido "acende".

## Versão 3.8: movimento como no iPhone

**Barra de abas viva.** A barra agora fica fora das telas e não é redesenhada a
cada troca. Uma pílula de vidro desliza até a aba tocada (sai já no toque),
estica no caminho como uma gota e assenta com mola. Arrastando o dedo pela
barra, a pílula vira uma lente que segue o dedo e, ao soltar, vai para a aba
mais perto. O ícone vazado vira o cheio com escala, opacidade e desfoque. Nas
telas de detalhe (produto, leitor, contagem) a barra desce e some com mola.

**Seletores de cima.** Abas de ambiente (sublinhado), Entrada | Saída e os
seletores "Onde fica" das folhas têm um só preenchimento que desliza e estica
até a opção escolhida. Os seletores das folhas ficaram como os do iPhone:
pílula clara sobre o trilho, texto sempre escuro, a escolhida em negrito.

**Abrir e fechar.**
- Linha → produto: foto, nome e etiqueta voam da lista até o topo da página do
  produto; voltando, encolhem de volta na mesma linha.
- Folha aberta: a tela de trás recua, escurece e arredonda os cantos, como um
  cartão empilhado (menos no leitor e na contagem).
- Quando o conteúdo da folha muda ou cresce, a borda sobe com mola e o
  conteúdo novo entra esmaecendo.
- Trocar ambiente ou filtro: as linhas que continuam deslizam para o novo
  lugar; as que saem somem e as novas aparecem.
- A lista entra em cascata na primeira vez; o menu abre com as opções chegando
  uma depois da outra; o aviso sai descendo de leve.
- O título grande esmaece ao subir e cresce um pouco quando a lista é puxada
  além do topo.
- Botões apertam rápido (0,96) e soltam com mola.

Tudo isso desliga com "reduzir movimento".

## Versão 3.9: posições e tamanhos do iOS 26, e a nota fiscal

Referência: padrões do iOS 26 (título grande 34, compacto 17, corpo 17,
secundário 15, legenda 13; botões fixos como círculos de vidro; folhas com X
à esquerda e título no meio).

- **Barra de abas:** o ícone troca de vazado para cheio na hora, sem pulinho;
  a aba não encolhe ao tocar. Trocar de aba é instantâneo; só a pílula anda.
- **Folhas:** alça, depois uma barra com X de vidro à esquerda, título pequeno
  no meio e compartilhar à direita. Folhas de produto ganham título pelo modo
  (Guardar, Tirar, Contar). Fechar desce a folha inteira. Só folha alta empurra
  a tela de trás.
- **Produto:** barra transparente com voltar e lápis em círculos de vidro; ao
  rolar, ganha vidro e o nome aparece pequeno no meio. Seções em cartões
  agrupados. Mostra o último preço pago quando veio de uma nota.
- **Textos menores e mais curtos:** títulos 34, nomes 17, etiquetas 24,
  seletor 72, notas de rodapé 13; frases longas cortadas.

**Nota fiscal (NFC-e do RS).** No leitor, apontar para o QR Code do cupom
importa a compra inteira (também há o botão de nota na câmera e "Importar nota
fiscal" em Mais, que aceita colar o link). A folha mostra o mercado, a data, o
total e cada item:
- Itens vendidos por peso (fruta, pão) começam de fora; os outros, marcados.
- O app liga cada item a um produto do armário: pelo que aprendeu daquele
  mercado, pelo código de barras quando o código da nota é um, ou sugere pelo
  nome ("Ou é um destes?"). Tocar num item expande para trocar nome, produto e
  quantidade.
- "Guardar N itens" dá entrada em tudo, guarda o preço e aprende as ligações.
  Na próxima nota do mesmo mercado os itens já vêm certos. Nota repetida avisa.

## Versão 3.10: revisão de textos (better-writing)

Vocabulário único: **Guardar** para entrada e **Tirar** para saída, em botões,
menus, avisos e títulos das folhas ("Guardar 2", "Tirar 1"; saiu "Adicionar",
"Pôr 1" e "Dar baixa"). "Marcar validade" em todo lugar. Nada de "sistema":
o que o app sabe é "No app".

- Erros dizem como resolver ("Só tem 2 no armário. Tire 2 ou menos.",
  "A SEFAZ não respondeu. Tente de novo em instantes.") e não usam "nós".
- Armário vazio e Cupons vazio ganharam o botão "Abrir o leitor".
- Botões começam com verbo: "Salvar" no lugar de "Pronto", "Continuar
  contagem", "Criar lembrete", "Pedir receitas com o que vence".
- Campo de novo item em Compras voltou a ter rótulo visível; o texto de
  dentro é só exemplo.

## Versão 3.11: fontes locais e hierarquia (revisão better-interface)

- **Fontes dentro do app:** Urbanist e Schibsted Grotesk em `fonts/` (woff2
  variável, só o alfabeto latino, 28 KB e 47 KB, licença OFL). Carregam com o
  app, ficam no cache para uso sem internet e não dependem do Google.
- **Escala com nomes por uso** (`--text-large-title` 34, `--text-title` 22,
  `--text-headline` 17, `--text-body` 17, `--text-callout` 15,
  `--text-footnote` 13). Títulos de seção ("Cozinha", "Backup", "Hoje") subiram
  de 15 para 22 em Urbanist; antes eram menores que os nomes dos itens. No
  produto, títulos de cartão 17 e o texto e o histórico 15.
- **Botões secundários** com preenchimento suave no lugar do contorno preto,
  para o botão principal (cheio) ser o único que chama atenção.
- **Número da aba Compras** em amarelo de "acabando"; o vermelho fica só para
  apagar.
- **Menu:** foco de teclado com contorno visível.
