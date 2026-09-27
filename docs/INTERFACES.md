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

A barra de abas tem quatro abas: Armário `#/`, Compras, Cupons e Mais.
Remédios são um ambiente do Armário, não uma aba.

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

## Versão 3.12: pílulas de estado, blocos de resumo e seções

Referências: selos de estoque dos kits de interface de inventário e o guia de
selos do Setproduct (um estado por pílula, separado do título; texto sempre
junto da cor), as listas inteligentes do app Lembretes (blocos com contagem que
filtram) e os apps de despensa (Panzy, iPantry, Pantry Check), que separam os
itens pelo lugar da casa e destacam o que está acabando ou vencendo.

- **Pílulas de estado** na linha de baixo, antes da marca e do tamanho:
  "Acabando" (amarelo, ampulheta), "Zerado" (tracejado, como a etiqueta),
  "Vence em 4 dias" (calendário; amarelo claro até 7 dias, cinza até 30, escura
  quando já venceu) e "Novo" (verde, na nota fiscal). Valem no Armário, em
  Compras, no topo do produto e na escolha entre produtos do mesmo código.
- **Blocos de resumo** no Armário (Acabando, Zerados, Vencendo) com ícone e
  contagem, no lugar dos filtros em forma de chip. Tocar filtra; tocar de novo
  volta para todos; sem nada, o bloco fica apagado com o 0. "Vencendo" fica
  amarelo quando algo vence nesta semana.
- **Seções por ambiente** em "Tudo": Cozinha, Banheiro e limpeza, Beleza e
  cuidados, com ícone e quantos itens cada uma tem.

## Versão 3.13: produto sem código de barras

A caixa já foi para o lixo, ou o produto nunca teve código (pão, fruta, feira).
Antes o caminho mandava digitar ("Buscar pelo nome") e a foto ficava escondida
dentro do formulário. Agora há um ponto de escolha, "Produto sem código", com
três caminhos, do mais comum para o menos:

1. **Já está no armário:** lista do armário (inclusive zerados); escolher só
   soma a quantidade. É o caso da compra repetida sem a caixa.
2. **Fotografar a embalagem:** a câmera abre direto; a IA lê marca e produto e
   o formulário já vem com o nome e as sugestões das lojas.
3. **Escrever o nome:** para o que não tem embalagem; a foto continua como
   alternativa no formulário.

Como chegar: botão novo na câmera (ícone de pacote), "Produto sem código de
barras" na folha de digitar o código e o aviso "Não lê ou não tem código? Ver
outras formas", que aparece quando a câmera não lê. Na Saída, sem código
continua indo direto para a lista do armário. O botão da nota fiscal na câmera
passou a usar o ícone de QR Code, para não se confundir com o do teclado.

## Versão 3.14: opções pela frequência de uso e retorno ligado ao uso

Critério: o que se usa toda hora fica perto e grande; o raro fica pequeno ou
num canto; o que não serve naquele momento não aparece.

- **Corrigir nome (raro, discreto).** Em produto cadastrado à mão, um link
  pequeno "Nome estranho? Buscar o nome certo" abre uma folha que procura o
  código salvo nas lojas, lê o código com a câmera ou usa a foto da embalagem
  (IA). Tocar numa sugestão troca nome, marca, tamanho e foto, e o app passa a
  reconhecer o código lido. Depois de corrigido, o link some.
- **Produto:** "Tirar 1" e "Guardar 1" logo abaixo do topo, com Desfazer. A
  correção de quantidade desceu para "Corrigir a quantidade", perto do fim.
- **Saída sem ler o código:** no leitor em Saída, a lista "Usados com
  frequência" (pelo ritmo de consumo) com "Tirar 1" em cada um, e "Procurar
  outro no armário". Resolve o rolo de papel toalha e o que não tem código.
- **Retorno ligado ao uso:** ao tirar, o aviso diz o que mudou: "Está
  acabando; já está na lista de compras" ou "Acabou".
- **Só o que serve:** os blocos de resumo do Armário somem quando nada está
  acabando, zerado ou vencendo; o botão da nota fiscal não aparece na Saída;
  "Instalar no celular" não aparece com o app já instalado.

## Versão 3.15: Remédios no Armário

Remédio é mais um ambiente da casa (`area: 'remedios'`), ao lado de Cozinha,
Limpeza e Beleza. Não tem aba própria: aparece no Armário, na seção Remédios
de "Tudo" e no filtro Remédios.

- **Linha:** ícone de comprimido no lugar da foto, nome, princípio ativo e
  dose. Em remédio a validade aparece sempre, não só quando está perto.
- **Busca na lista da Anvisa:** com o filtro Remédios, a busca do Armário
  mostra também "Na lista da Anvisa", agrupado por remédio (nome e princípio
  ativo no título) e uma linha por caixa (dose e quantidade, laboratório). Em
  Tudo, a lista da Anvisa aparece quando nada em casa bate com o que foi
  digitado. A partir de 3 letras; dá para buscar pela dose ("losartana 50").
- **Folha do remédio:** dados da Anvisa (princípio ativo, apresentação, venda
  com a cor da tarja, tipo, laboratório, classe terapêutica, preço máximo,
  registro), "Ver a bula na Anvisa" e **Guardar em casa**, que abre a folha de
  Entrada normal.
- **Leitura de remédio:** a folha de produto novo diz "Remédio da lista da
  Anvisa. Marque a validade que está na caixa." e já traz o campo de validade
  aberto (continua opcional). "Onde fica" ganhou a opção Remédios.
- **Página do produto:** seção "Sobre o remédio" com os mesmos dados e a bula.
  Produto antigo cujo código está na base mostra "Usar os dados da Anvisa".
- **Sem fotos:** remédio nunca mostra foto, nem a das lojas; só o ícone de
  comprimido e os dados oficiais.

## Versão 3.16: nota fiscal pelo QR Code

- O botão de QR Code do leitor liga o **modo nota**: visor quadrado, mira
  quadrada, "Aponte para o QR Code no fim do cupom" e resolução maior.
  Código de barras de produto é ignorado nesse modo.
- "Colar o link da nota" só aparece se não ler em 6 s.
- Mais → Importar nota fiscal abre o leitor já no modo nota.

## Versão 3.17: leitor sem texto fixo

Critério da Apple: o controle se explica sozinho; texto de instrução não fica
parado na tela.

- A faixa do leitor tem uma linha só: fechar, Entrada/Saída e Rápido. Saiu a
  frase fixa que explicava o modo rápido.
- Com o Rápido ligado, um aviso curto aparece por cima da câmera ("Rápido:
  cada leitura tira 1") ao abrir, ao trocar de modo e ao ligar o botão, e some
  em 2 s. Ao desligar: "Rápido desligado: o app pergunta quantos".
- O que o app não conhece não precisa de aviso antes: aparece em "Para
  resolver" na hora.

## Versão 3.18: "sem código" em texto e trocas de tela fluidas

- **Produto sem código de barras** deixou de ser um ícone de caixa na barra
  da câmera (nenhum desenho diz "sem código"). Virou um botão de texto na cor
  do modo logo abaixo do visor, como o "Inserir manualmente" da Carteira do
  iPhone. A barra da câmera ficou com lanterna, digitar código e QR Code.
- **Trocas de tela:** detalhe entra e sai pela direita com a tela de trás
  visível e escurecida (antes ficava branca ou misturada); o leitor sobe com a
  tela de trás recuando; as abas esmaecem em vez de cortar seco. Ver design
  system, seção 7.

## Versão 3.19: revisão com olhar de designer da Apple

- **Ambientes do Armário:** quando não cabem, a fileira rola e a borda direita
  esmaece (antes cortava "Remé" no meio); a aba tocada rola para a vista.
- **Linha do Armário:** o "−" virou glifo leve num círculo sem borda; quem
  pesa é a etiqueta com a quantidade.
- **Menu de toque longo:** aberto pelo toque, sem anel de foco na primeira
  opção (o anel só aparece pelo teclado).
- **Produto, como os Ajustes e o Saúde:** título de cada seção fora do cartão
  e notas embaixo dele. Ordem pelo uso: Tirar/Guardar, (Sobre o remédio),
  Validade, Consumo, Histórico, Corrigir a quantidade, Detalhes. O código de
  barras saiu do topo e foi para **Detalhes** (código, marca, tamanho, onde
  fica). Sem foto, o quadrado do topo é menor.
- **Folha de guardar:** "Marcar validade" é botão de texto na cor do modo, sem
  sublinhado; "Não é este? Cadastrar outro" é texto discreto, sem competir com
  o botão principal.
- **Compras:** caixas de marcar redondas, como no Lembretes.
- **Mais → Últimos registros:** nome do produto em cima; tipo (na cor do
  movimento) e hora embaixo; "ficou N" à direita.

## Versão 3.20: Nota fiscal no Armário

- Botão "Nota fiscal" (ícone de QR Code e texto) no canto de cima do Armário,
  ao lado do título: abre o leitor já no modo nota. Continua também no leitor
  (botão de QR na Entrada) e em Mais.

## Versão 3.21: auditoria pelas diretrizes da Apple

Ver [APPLE_HIG.md](APPLE_HIG.md), seção 15.

- A barra de abas continua visível na página do produto (com Armário
  marcado): a Apple pede que ela só suma por baixo de telas modais.
- Com "Reduzir movimento", as trocas de tela esmaecem em 180 ms em vez de
  cortar seco.
- O "−" da linha voltou a ter 44 pt de área de toque.

## Versão 3.22: validade pela câmera, sem IA

- Ao lado do campo de validade (folha de guardar e "Marcar validade" no
  produto) há um botão de câmera. Tocar abre a câmera dentro do campo, com a
  mira em faixa e a cápsula "Aponte para a data de validade"; embaixo aparece
  o que está sendo lido ("Lendo 15/10/2026…") e "Cancelar".
- Quando duas leituras concordam: bip, vibração, a câmera fecha e o campo fica
  preenchido com a nota "Vence em …" para conferir antes de salvar.
- Primeira vez: "Preparando o leitor de validade (só na primeira vez) N%".
- Lanterna aparece quando a câmera tem.
- Colar "VAL 20/12/27 L0425" no campo também funciona.

## Versão 3.23: texto do jeito da Apple

- **Tamanho do texto do iPhone.** O app segue o tamanho escolhido em Ajustes
  (Tela e Brilho → Tamanho do Texto, ou Acessibilidade), de 14 a 34 px de
  base. Todos os textos são em rem; títulos grandes crescem menos que o corpo,
  como no iOS. Com letra grande, os blocos Acabando/Zerados/Vencendo viram uma
  coluna, o botão "Nota fiscal" fica só com o ícone (o nome segue para o
  VoiceOver) e o nome do produto usa até 4 linhas antes das reticências.
- **Textos mais curtos e diretos**, sem explicar o óbvio. Exemplos: "Ao tirar,
  sai primeiro o que vence antes."; "Toque num item para corrigir. Na próxima
  nota deste mercado, ele já vem certo."; "Ao concluir uma leitura ou uma
  contagem, o cupom fica aqui."; "Itens marcados tirados da lista."
- **Voltar arrastando da borda** no app instalado (produto, revisão): a tela
  acompanha o dedo, com sombra; soltando depois de um terço da largura ou num
  puxão rápido, volta; antes disso, retorna ao lugar.
- **Abre onde parou**: o app instalado abre na última aba usada (Armário,
  Compras, Cupons ou Mais).
- **Rodinha dentro do botão** quando uma ação demora ("Aplicar contagem",
  "Buscar de novo", salvar a nota, salvar o produto), também nos botões claros.

## Versão 3.24: revisão de todos os textos

Todos os textos do app passaram pelas regras de escrita da Apple e pelos
termos fixos do design system (seção 8). Principais trocas:

| Antes | Agora |
| --- | --- |
| O app não tem permissão para usar a câmera… | Sem permissão para usar a câmera… |
| Esses números não conferem: o último é um dígito de controle… | Algum número não confere. Compare com a embalagem e digite de novo. |
| Guardar a contagem para continuar depois? / Guardar e sair | Salvar a contagem para continuar depois? / Salvar e sair |
| O estoque só muda quando você aplicar a contagem na revisão. | O armário só muda quando você aplicar a contagem. |
| Vocês usam cerca de 2 por semana. | Sai cerca de 2 por semana. |
| Para quando o número do app não bate com o armário. | Use quando a quantidade não bater com o que tem no armário. |
| Não entendi a data. Use… | Use dia/mês/ano (15/10/26) ou mês/ano (10/26). |
| Guardar em casa / Em casa | Guardar no armário / No armário |
| Buscando a nota na SEFAZ | Buscando a nota |
| Ele começa com https e tem "p=" seguido de 44 números. | Esse link não é de nota fiscal. Cole o link que abre ao ler o QR Code do cupom. |
| Tudo o que foi contado bate com o app. | As quantidades do armário já estavam certas. |
| 0 tira esta linha da sessão e devolve o estoque. | Com 0, a linha sai e o armário volta a ter o que tinha. |
| Rápido desligado: o app pergunta quantos | Rápido desligado: cada leitura pergunta quantos |
| Montando a lista pelo que vocês usam / Vocês fazem compras a cada | Montando a lista pelo seu consumo / Compras a cada |
| Acrescentar à lista / Pôr na lista de compras | Adicionar à lista / Adicionar à lista de compras |
| Importar nota fiscal | Ler nota fiscal |
| Escrever o nome / O app sugere o produto das lojas… | Digitar o nome / As lojas sugerem o produto enquanto você digita |
| Quase desistindo da loja. Se não achar, você digita o nome | As lojas ainda não responderam. Se preferir, digite o nome |
| O armário diz que não tem nenhum… | Está zerado no armário… |

## Versão 3.25: alinhamento e retorno

- **Telas vazias no centro**, com um símbolo grande num círculo, título, uma
  frase e o botão do próximo passo: Armário vazio ("Nada guardado ainda"),
  busca sem resultado, Compras ("Nada para comprar"), Cupons ("Nenhum cupom
  ainda") e a lista do leitor.
- **Página do produto no centro**, como um contato: foto, nome, marca e
  estado centralizados; a quantidade grande fica no meio, entre **Tirar 1** e
  **Guardar 1** (ícone em cima, texto embaixo), com "no armário" abaixo do
  número. Com letra grande, a quantidade vem primeiro e os botões ficam um
  embaixo do outro.
- **Aviso** com o ícone do gesto (seta para dentro, para fora, contagem), o que
  aconteceu em negrito (até 2 linhas) e o resto menor embaixo. "Desfazer" em
  texto, sem moldura e sem o X; some sozinho em 8 s e espera enquanto o dedo
  estiver nele.
- **Barras do topo** do Armário quase opacas quando a lista passa por baixo:
  nada aparece atrás do título e da busca.
- **Títulos de seção** alinhados com o texto de dentro dos cartões (produto e
  Mais), como nos Ajustes do iPhone.
- **Mais**: "Instalar no celular" some quando o app já está instalado; "Ler
  nota fiscal" usa o mesmo ícone de QR Code da tela inicial.
- Contagem: "No app: 6" virou "No armário: 6".

## Versão 3.26: acabamento e simplificação

**Mais simples**
- Página do produto: a seção "Corrigir a quantidade" saiu. A quantidade se
  corrige na folha **Editar**, que agora começa por "Quantidade no armário";
  tocar no número grande abre essa folha já no número. Continua com Desfazer.
- "Detalhes" mostra só o código de barras e onde fica (marca e tamanho já
  estão embaixo do nome).
- Validade: a frase "Ao tirar, sai primeiro…" só aparece quando há mais de uma
  data (ou unidades sem data) para escolher.
- Mais: "Ler nota fiscal" saiu (fica no botão "Nota fiscal" do Armário).

**Acabamento**
- Raios concêntricos: cartões de grupo 28 px, listas de Mais 20 px, blocos do
  Armário 26 px, folhas 38 px, aviso com ícone 27 px, botões dentro de cartão 12 px.
- Visto da lista de compras aparece com escala 0,25 → 1, desfoque 4 → 0 e
  opacidade, só na caixa que acabou de ser marcada.
- "+1/−1" do arrastar a linha aparece do mesmo jeito.
- Pressionar: caixa de marcar e "Rápido" encolhem para 0,96 (antes 0,88 e 0,94).
- "Remover do armário" com fundo vermelho claro, sem borda.
- Abas de ambiente e Entrada/Saída com área de toque de 44 px.
- Alto contraste do Windows: a aba atual volta a ter o fundo de destaque.

**Código**
- CSS de 2141 para 2055 linhas: 159 declarações que outra regra já
  sobrescrevia, 29 regras vazias e 13 classes sem uso (filtros antigos em
  pílula, X do aviso, interruptor antigo). Conferido comparando o estilo
  calculado de todos os elementos em 54 estados (claro, escuro e letra
  grande): nenhuma diferença.

## Versão 3.27: usar o que a foto leu

Quando o código não está nas lojas e a pessoa fotografa a embalagem, a IA lê
tipo, marca, variante e tamanho. Antes, isso só virava texto no campo de nome.
Agora vira um produto de verdade:

- **Com sugestões das lojas**: a lista mostra as sugestões e termina em
  "Nenhuma dessas?" com a linha **Usar o que a foto leu**, que mostra a própria
  foto e o nome lido ("Achocolatado em pó Nescau 400g"). A mensagem do topo
  diz: "Toque no produto certo ou, no fim da lista, use o que a foto leu."
- **Sem sugestões**: o que a foto leu é a única opção e já entra no
  formulário: "As lojas não têm esse produto. Nome, marca e tamanho vieram da
  foto: confira antes de salvar."
- **Salvar sem escolher**: se o nome no campo é o que a foto leu, marca,
  tamanho e foto vão junto.
- Ao usar, o cabeçalho da folha mostra a foto, o nome, "marca, tamanho" e o
  código; "Fotografar de novo" continua disponível.
- O produto fica com a foto recortada no meio (quadrada, 240 px, uns 3 a 10 KB)
  como miniatura, marca e tamanho separados e origem "foto". Remédio nunca
  guarda a foto.
- O nome segue o jeito das lojas: tipo, marca, variante e tamanho; marca em
  caixa alta vira só a inicial maiúscula ("NESCAU" vira "Nescau"); "400g" no
  campo tamanho vira "400 g".
- A mesma linha aparece em **Buscar o nome certo**, na página do produto
  (sem "Nenhuma dessas?" quando é a única opção). Produto com dados da foto não
  mostra o link "Nome estranho?".

## Versão 3.28: validade em duas etapas, com datas para tocar

**Datas lidas viram botões.** Embaixo da câmera da validade há três vagas
fixas. Enquanto o leitor ainda não tem certeza, cada data diferente que ele lê
entra na próxima vaga livre ("15/10/2026", "18/10/2026"…) e fica ali: nada
some, nada muda de lugar nem de tamanho, e o espaço já está reservado desde o
início ("As datas lidas aparecem aqui"), então nada empurra a tela depois.
Tocar numa data usa essa data na hora. Um botão recém-chegado ignora toques
por meio segundo, para o dedo que já ia tocar não acertar a data nova. Quando
duas leituras concordam, a data continua entrando sozinha, como antes.

**Primeiro a data, depois quantas.** Em "Marcar validade" (na folha de
guardar e na página do produto):
1. Tocar em "Marcar validade" já liga a câmera (dá para digitar também). Na
   página do produto a folha abre lendo.
2. Com a data, aparece **"Quantas vencem em 15/10/2026?"** com um seletor
   (começa em todas as unidades; só pergunta se houver mais de uma).
3. Se ficar menos que o total, aparece **"Outra data para as outras 2"**: a
   data vai para a lista (15/10/2026, 4 unidades, com X para tirar) e a
   câmera liga de novo para a próxima.
4. Ao salvar, cada data vira um lote com a sua quantidade; o resto fica sem
   data. Desfazer volta tudo.

Na folha de guardar, se a pessoa muda quantas está guardando, a pergunta
acompanha, a não ser que ela já tenha mexido nela. Depois de ler a data, o
campo não recebe foco (no iPhone isso abria o teclado à toa).

## Versão 3.29: marcar validade como num app da Apple

Refeito o fluxo todo, no molde de "adicionar cartão" da Carteira: uma página
só para ler, uma para confirmar, dentro da mesma folha e com "‹" para voltar.

**Folha de guardar.** A validade virou uma linha, como nos Ajustes:
**[calendário] Validade · Nenhuma ›**. Depois de marcar: "18/10/2026",
"18/10/2026 (2 de 3)" ou "2 datas". Remédio usa a mesma linha.

**Leitura.** Tocar na linha empilha a página **Validade**: câmera grande (4:3,
cantos concêntricos com a folha), a cápsula "Aponte para a data de validade",
as datas lidas em cápsulas claras com calendário (três vagas fixas) e
**Digitar a data** embaixo. O X da barra vira "‹".

**Digitar.** Página própria com campo grande e teclado numérico; a nota mostra
a data por extenso enquanto digita; **Continuar** só acende com data válida.

**Confirmação.** Ícone de calendário, a data por extenso grande ("18 de
outubro de 2026") e "Daqui a 21 dias". Data vencida: ícone de alerta e
"Venceu há 12 dias. Confira na embalagem." em vermelho. Com mais de uma
unidade: **Quantas vencem nesse dia?** num cartão, "de 3 unidades" embaixo.
Botão **Pronto** (na cor do modo) e, se sobrar unidade, **Outra data para as
outras N**, que volta à leitura.

**Leitura de novo não repete.** Datas já escolhidas ou já mostradas na
confirmação não entram sozinhas de novo (a câmera costuma estar na mesma
embalagem); continuam aparecendo para tocar.

**Lista.** Com datas escolhidas, tocar na linha mostra as datas (com X para
tirar), **Outra data** e "N unidades ficam sem data".

**Página do produto.** O cartão Validade virou lista: uma linha por data
("01/10/2026 · 2 unidades · daqui a 4 dias"; a que vence logo em amarelo; a
vencida em vermelho) com lixeira, e as ações como linhas: **+ Marcar
validade · 1 sem data** e **Lembrete no calendário**. "Marcar validade" abre a
folha já lendo; a confirmação salva com **Salvar**.

**Movimento.** A página nova desliza 28 px e esmaece; a folha acompanha a
altura com mola. O esmaecer geral da folha não roda por cima (antes eram
três movimentos juntos).

## Versão 3.30: revisão better-ui e better-interface da validade

- "Digitar a data" e "Outra data para…" em texto na cor do modo, em negrito
  como o ícone ao lado, sem sublinhado.
- Lista de validades da página do produto com o raio dos outros cartões (28).
- Fio entre linhas com ícone começa no texto; fios em propriedades lógicas.
- Anel de foco das linhas (Validade, Marcar validade, Lembrete) desenhado para
  dentro: antes o bloco arredondado cortava o anel inteiro.
- Foco acompanha as páginas: ao abrir, vai para o título ("Validade"); ao
  voltar, para o controle que abriu.
- "Continuar" (digitar a data) fica sempre ativo; sem data válida, diz
  "Use dia/mês/ano (15/10/26) ou mês/ano (10/26)." em vermelho, marca o campo
  e volta o foco para ele.
- As datas lidas pela câmera são anunciadas ao leitor de tela.

## Versão 3.31: datas lidas de borda a borda

- A fileira das datas lidas virou flexbox e vai até a borda direita: uma data
  ocupa a largura toda, duas dividem ao meio, três em terços.
- Respiro dentro de cada cápsula (14 px dos lados). Sem espaço, primeiro sai o
  calendário e depois o ano fica com dois dígitos ("15/10/26"), para a data
  nunca encostar na borda (medido: pelo menos 13 px em 320 px com três datas).
- Quando chega uma data, ela cresce e as outras encolhem devagar (300 ms), e
  por meio segundo nenhuma aceita toque, para o dedo não acertar a errada.

## Versão 3.32: voltar para onde estava

- Cada tela guarda até onde estava rolada. Voltar (botão "‹", gesto da borda,
  fechar o leitor, ou a aba) devolve a mesma posição; abrir uma tela nova
  começa do topo. O roteador espera a lista sair de "carregando" antes de
  rolar, então a troca animada já mostra a lista no lugar certo.
- Voltando de um produto, a linha dele fica marcada e apaga devagar (700 ms),
  como a linha tocada numa lista do iPhone; a foto, o nome e a quantidade
  "encolhem" de volta nela.

## Versão 3.33: leitor de validade combinado (Tesseract + PaddleOCR local)

Trazido de `codex/hybrid-expiry-reader` (commits `a807cd1`, `a7f1361`,
`4379417`). Ver `docs/LEITURA_VALIDADE.md` e `docs/TESTES_VALIDADES_REAIS.md`
para o fluxo completo e as medições.

- Tesseract continua sendo o primeiro leitor; quando não confirma depois de
  algumas tentativas, um segundo motor local (PaddleOCR, rodando num Web
  Worker, sem rede) entra como reforço. Os dois alimentam a mesma votação.
- A confirmação mostra o recorte da imagem que gerou a leitura, como prova
  antes de salvar ("Confira a data impressa antes de salvar."). Ajustei o
  encaixe visual desse recorte (`.exp-evidence` em `css/app.css`) para o
  mesmo raio, contorno de imagem (claro/escuro) e escala de texto do resto
  do app — a versão trazida usava valores soltos.
- PaddleOCR fica em `vendor/paddle/` (uns 17 MB) e só baixa por trás quando
  precisa, do mesmo jeito que o Tesseract (`OCR não carrega no app inicial`).
- `experiments/ocr/` e `scripts/paddle/` trazem o ambiente Node usado para
  medir e gerar os modelos; não fazem parte do app publicado.

## Versão 3.34: inclinar/luz e foto nítida quando a câmera não confirma

Ver `docs/LEITURA_VALIDADE.md` para o funcionamento completo e por que não
adicionamos o EasyOCR como terceiro motor.

- Depois de 10 s sem confirmar, um painel aparece com uma dica que alterna
  ("Incline a embalagem bem devagar…" / "Ou mude a direção da luz…") e o
  botão **Tirar uma foto nítida da validade**.
- A foto usa `ImageCapture` (mais pixels do sensor) quando o navegador deixa,
  senão o próprio vídeo com um recorte maior; testa cinco filtros de cada
  motor de uma vez, sem o tremor do vídeo contínuo. Ajuda com validade em
  relevo ou com reflexo, o caso que faltou nos testes anteriores.
- Sem confirmar em nenhum filtro, volta ao normal com o que achou disponível
  para tocar; a leitura contínua retoma sozinha.

## Versão 3.35: pacote de português junto do inglês no leitor

- Tesseract carrega `eng+por` em vez de só `eng` — ajuda a desambiguar
  rótulos e meses em português (VALIDADE, OUT, DEZ…). Medido (16 leituras,
  mesmo whitelist/PSM): não ficou mais lento que antes. 1,33 MB a mais no
  download da primeira vez que a câmera de validade é usada.
- Anotada em `TESTES_VALIDADES_REAIS.md` uma correção sobre a ideia de
  "escolher só os quadros mais nítidos": uma tentativa anterior piorou o
  resultado, provavelmente por descartar quadros em vez de só priorizá-los.
  Não será retentada como filtro.

## Versão 3.36: foto nítida dispara sozinha durante a dica de inclinar/luz

- A cada troca de dica do painel (a cada 4,2 s, já depois dos 10 s sem
  confirmar), o app tira e lê uma foto parada sozinho, sem esperar o toque no
  botão — mais chances de pegar o instante em que a luz ou o ângulo ajudam
  enquanto a pessoa já está inclinando a embalagem. O botão continua para
  tentar na hora. Nunca duas rodadas ao mesmo tempo: o ciclo seguinte só
  segue alternando a dica enquanto uma rodada anterior ainda está lendo.
  Nenhuma foto se mistura com outra (sem fusão de pixels entre quadros) —
  cada rodada continua um voto independente na mesma votação de sempre.
- Corrigido o identificador interno de "quadro" de cada tentativa da foto
  nítida para incluir o número da rodada (`photo-<rodada>-<filtro>`, antes
  só `photo-<filtro>`); sem isso, uma segunda rodada automática testando o
  mesmo filtro que uma rodada anterior seria descartada como "quadro
  repetido" da rodada anterior, perdendo um voto de uma foto genuinamente
  nova.
