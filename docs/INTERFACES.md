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

## Versão 3.37: modelo do Paddle atualizado para PP-OCRv6 small

- Trocado `vendor/paddle/v1` (PP-OCRv5 mobile) por `vendor/paddle/v2`
  (PP-OCRv6 small, lançado 11/06/2026), mesmo SDK. 31,2 MB no fallback
  (antes 21,5 MB). Testado antes de trocar: leu 6/6 casos sintéticos
  perfeitamente (o antigo errou 2/6), e recuperou `LOTE:1291225` inteiro a
  99% de confiança num vídeo real onde o antigo só achava ruído — ver
  `docs/LEITURA_VALIDADE.md`.
- `sw.js` v52: cache do Paddle renomeado para `paddle-v2`; a ativação agora
  também limpa caches `paddle-*` órfãos (mesmo padrão já usado para `app-*`).

## Versão 3.38: Paddle em duas camadas (small na leitura contínua, medium na foto nítida)

- `vendor/paddle/v3` substitui v2: mesmo worker, agora escolhe entre
  PP-OCRv6 small (31,2 MB) e PP-OCRv6 medium (138,8 MB) por uma mensagem
  `tier` — não é mais um modelo fixo por build. A leitura contínua sempre
  usa small (rápida, ~0,6 s por leitura). A foto nítida tenta o Tesseract
  primeiro e, só se não confirmar, baixa/usa o medium (~4 s por leitura,
  quase 7x mais lento, mas enxerga mais em material difícil — ver
  `docs/LEITURA_VALIDADE.md`).
- Motivo: o app é usado majoritariamente em casa, por wi-fi — o tamanho do
  download importa menos que confirmar rápido e certo. Mas o medium é lento
  o bastante para atrapalhar a leitura contínua (que depende de tentar
  muitos quadros por segundo), então só entra onde a pessoa já está
  esperando uma resposta mais cuidadosa.
- `js/views/expiryCam.js`: duas instâncias de `createPaddleReader` (`paddleLive`,
  `paddleBurst`), cada uma com seu próprio estado/inicialização. A foto
  nítida foi reordenada para tentar todos os filtros do Tesseract antes de
  sequer cogitar baixar o Paddle medium (antes, esperava o Paddle ficar
  pronto mesmo que o Tesseract fosse resolver sozinho).
- `sw.js` v53: cache do Paddle vira `paddle-v3`.

## Versão 3.39: câmera do celular, mensagens de causa e digitar olhando a foto

Depois de uma crítica do próprio fluxo (ver `docs/LEITURA_VALIDADE.md`,
"Sem confirmar por muito tempo"):

- **Uma foto conta como uma imagem só na votação.** Os filtros de uma mesma
  foto ainda votam, mas não cumprem sozinhos a regra de "duas imagens
  diferentes" (`source` em `createExpiryConsensus`).
- **"Tirar foto com a câmera do celular"** substitui "Tirar uma foto nítida"
  (que ficava desativado quase o tempo todo, porque a foto já dispara
  sozinha): abre a câmera do aparelho, com foco, HDR e resolução cheia. A
  data achada vira um botão para conferir. A câmera da página é religada
  na volta, se o iOS a tiver encerrado.
- **Nada trava a leitura ao vivo:** o Paddle medium carrega em segundo plano
  quando o small fica pronto, e a foto automática lê junto com a leitura ao
  vivo em vez de pausá-la.
- **Mensagens de causa:** "Está escuro…", "Tem reflexo em cima da data…",
  "Segure parado…", medidas na mira (`js/frameQuality.js`) só para a
  mensagem. Mensagens sobre a máquina ("leitura mais detalhada") saíram.
- **Piscar branco + toque curto** quando a foto automática é tirada.
- **Desistir com dignidade:** depois de 3 fotos ou 35 s, o painel admite que a
  embalagem está difícil, "Digitar a data" fica em destaque, e a página de
  digitar mostra a melhor foto (toque amplia), que segue como prova para a
  confirmação.
- Corrigido: recorte da `ImageCapture` quando a foto tem outra proporção que
  o vídeo; `takePhoto()` que nunca respondia com a trilha encerrada.
- Material real no repositório: `tests/real/` (vídeo da lata recortado e sem
  metadados — o original tinha a coordenada GPS da gravação),
  `tests/real-video.mjs` e instruções para adicionar fotos com segurança.
- `sw.js` v54, com `js/frameQuality.js` no cache do app.

## Versão 3.40: diagnóstico, rótulos reais e "É esta data?"

Todas as sugestões da crítica anterior, guiadas por um diagnóstico em vez de
hipóteses (números em `docs/TESTES_VALIDADES_REAIS.md`, "Nono teste"):

- **Diagnóstico da leitura** (Mais → Ajuda para melhorar, ou `?debug`):
  embaixo da câmera, o último recorte enviado ao leitor e cada tentativa com
  o texto lido e o motivo de não ter confirmado; "Copiar diagnóstico" copia
  tudo em JSON (ou baixa, se não der para copiar).
- **Rótulos reais mal lidos** entram como validade (`RL:`, `UAL:`…, bloco com
  FAB, "CONSUMIR ANTES DE" longe da data, "VAL/LOTE:"), sem abrir mão da
  proteção de fabricação e lote.
- **"Li 11/08/2027 várias vezes. É a validade?" (a partir da 3.50: "mais de uma vez")** com "Sim" e "Não", para a
  data vista em várias imagens sem rótulo. "Não" fecha a pergunta e não
  pergunta de novo; a data continua como botão. Com a pergunta aberta, as
  instruções de rotina e os avisos de imagem esperam.
- **Contagem em cada data** ("5×", no alto da cápsula) e a mais vista com
  fundo mais forte. Nada muda de lugar.
- **Digitar já vem com a data mais vista**, selecionada: conferir e tocar em
  Continuar, ou digitar por cima.
- **Foto do celular:** "Lendo a sua foto (2 de 6)" e para quando um filtro já
  achou uma data com rótulo (os outros não contariam como imagem nova).
- `tests/ui/`: testes de interface com câmera falsa gerada no próprio teste.
- `sw.js` v55, com `js/expiryDebug.js` no cache do app.

## Versão 3.41: busca do Armário

- **X para limpar**, sempre que há texto na barra (com o campo em foco ou
  não): um toque apaga e mantém o teclado aberto. O X do próprio navegador
  some, para não aparecerem dois. Esc também apaga; "Buscar" no teclado só
  fecha o teclado.
- **Busca tolerante** (`js/search.js`, a mesma no Armário, em "O que está
  tirando?" e na nota fiscal): sem acento ("feijao"), palavras em qualquer
  ordem e pelo começo ("ninho lei"), singular e plural ("ovos", "pao"), um
  erro de digitação ("detergnte"), palavras coladas ("papelhigienico"), e
  também marca, tamanho, princípio ativo do remédio, ambiente e código.
  Palavras de ligação ("de", "com") valem pouco.
- **O mais parecido primeiro**, e o pedaço do nome que bateu em destaque: forte,
  com o resto do nome mais claro, como na busca do iPhone.
- **Nada some por causa do ambiente ou do filtro:** "Mais 1 produto com
  “papel” fora de Cozinha — Mostrar", ou, sem nada no ambiente, "Buscar no
  armário todo". Os blocos Acabando/Zerados/Vencendo contam só o que a busca
  achou.
- Leitor de tela: anuncia quantos produtos a busca achou depois de uma pausa
  na digitação, em vez de ler a lista inteira a cada letra.
- `tests/search.test.mjs`, `tests/ui/search.test.mjs` e `tests/sw.test.mjs`
  (todo módulo de `js/` precisa estar no cache offline). `sw.js` v56.

## Versão 3.42: tela de testes (leitor com GPU)

- **Mais → Testes (leitor com GPU)** abre `#/testes`, uma tela simples, só
  para medir, que não mexe no armário. Compara, nas mesmas imagens (copo e
  chocolate de `vendor/paddle/amostras/`, ou uma foto sua), o Paddle de hoje
  (`vendor/paddle/v3`, só WebAssembly) com um pacote de teste que usa a GPU
  (`vendor/paddle/gpu1`, onnxruntime 1.24.3 com WebGPU, variante asyncify).
  Mostra quanto leva para preparar, a 1ª leitura (que na GPU inclui preparar
  os programas dela), a mediana das demais, as datas lidas e se o texto é o
  mesmo do atual. "Estresse GPU" repete leituras até 600 ou até dar erro (há
  relato de travar depois de ~500 no iOS 26.3). "Copiar resultado" copia tudo
  em JSON. A tela fica acesa durante os testes.
- No Chromium com GPU simulada, os três leram exatamente o mesmo texto; a
  velocidade só vale no celular.
- `createPaddleReader(tier, { gpu, readTimeout })`: opções só para essa tela;
  o leitor de validade continua usando o pacote de sempre.
- `scripts/paddle/build-gpu.mjs` monta o pacote, com um patch que cria as
  duas sessões do Paddle em série (o WebGPU do onnxruntime não aceita duas
  ao mesmo tempo). `sw.js` v57.

## Versão 3.43: "Enviar para o Claude" (Bancada)

- A tela de testes e o painel de diagnóstico da validade ganharam **Enviar
  para o Claude**: copia o resultado (JSON) e abre a Bancada, uma página
  privada no claude.ai (`BANCADA_URL` em `js/expiryDebug.js`). Lá, tocar e
  segurar no campo e Colar guarda o resultado num banco que o Claude lê
  direto. A página não recebe dados pelo link, por isso o colar.
- Com "Foto minha", o envio leva uma miniatura (480 px) da foto usada.
- "Foto minha" reabre o seletor a cada toque, para trocar de foto.
- O texto de cada leitura no diagnóstico é cortado em 400 caracteres, para
  um envio longo caber no limite da Bancada. `sw.js` v58.

## Versão 3.44: foto própria na tela de testes

- "Escolher foto do celular" é um botão com o campo de arquivo por cima,
  transparente: o toque abre o seletor direto, sem abrir por código.
- Cada passo e cada erro aparecem na tela ("Foto pronta: …", "Não deu para
  abrir …: motivo") e vão no envio para a Bancada (`events`).
- A foto é reduzida na hora e guardada no aparelho; se o iPhone fechar o app
  com o seletor aberto, ela volta ao reabrir e a tela avisa que houve a
  recarga. `sw.js` v59.

## Versão 3.45: tela de testes guarda tudo

- A tela de testes guarda no aparelho as opções, os resultados, a tabela e
  o registro. O iPhone às vezes fecha o app em segundo plano (ao abrir a
  Bancada, o seletor de fotos ou a câmera) e a tela voltava do zero, com o
  copo marcado e o resultado sumido. Agora volta como estava, até tocar em
  "Limpar resultados".
- Se o app cai no meio de um teste, a tela avisa ao reabrir em que motor,
  modelo e leitura parou, e registra `caiu-durante-teste` no envio: é assim
  que aparece o travamento da GPU depois de muitas leituras, se acontecer.
- O envio para a Bancada tira as miniaturas e os testes mais antigos se
  passar de 230 KB. Tudo é gravado na hora (sem espera), para não perder o
  que aconteceu logo antes de o iPhone fechar o app. `sw.js` v61.

## Versão 3.46: GPU com onnxruntime 1.30 nos testes

Primeiro envio real do iPhone (iOS 27, app instalado, GPU "apple"): a foto
própria funcionou, e a GPU com onnxruntime 1.24.3 **derrubou o app** duas
vezes, na 2ª e na 3ª leitura (o iPhone recarregou a tela; a tela registrou
`caiu-durante-teste`). Não é o travamento depois de ~500 leituras relatado
por outros: aqui cai logo no começo.

- Novo pacote `vendor/paddle/gpu2` com o onnxruntime **1.30.0** (o mais novo;
  o 1.24.3 é o da produção). `build-gpu.mjs` monta os dois.
- Na tela de testes, cada versão de GPU é uma opção; a 1.24 começa
  desmarcada. O estresse usa a primeira marcada.
- Cada leitura entra no resultado na hora: se o app cair, a tabela mostra
  "parou depois de N leituras", com os tempos que deu para medir.
- O envio para a Bancada leva o registro da tela (`log`). `sw.js` v62.

## Versão 3.47: GPU 1.30 aguentou; validade antiga com VAL

Segundo envio do iPhone (iOS 27), foto de um sabonete, modelo small, 6
leituras de cada:

| | preparar | 1ª leitura | demais (mediana) | texto |
|---|---|---|---|---|
| Atual (WebAssembly) | 0,6 s | 2,4 s | 2,3 s | — |
| GPU, onnxruntime 1.30 | 4,1 s | 3,4 s | **0,66 s** | idêntico ao atual |

A GPU com o 1.30 não derrubou o app (a 1.24 derrubava na 2ª/3ª leitura) e
ficou **3,5× mais rápida** depois da primeira leitura (que prepara os
programas da GPU).

O sabonete diz "VAL 07/2021": o leitor acertou, mas `js/dates.js`
descartava toda data de mais de 2 anos atrás. Com rótulo de validade na
frente, agora vale até 10 anos atrás; sem rótulo, continua o limite de 2
anos. `sw.js` v63.

## Versão 3.48: GPU na câmera, "A validade está aqui?" e o medium no recorte

Montado a partir dos testes no iPhone (versões 3.46–3.47) e de uma conversa
sobre como a pessoa pode ajudar sem virar trabalho.

**Leitor rápido na GPU** (`createSmallReader` em `js/paddleOcr.js`): o Paddle
small usa a GPU (pacote `gpu2`, onnxruntime 1.30) quando o aparelho tem, e
volta sozinho para o leitor sem GPU se ela não preparar. O medium continua
sem GPU (na GPU derrubou o app). Proteção (`js/gpuGuard.js`): uma marca fica
no aparelho durante cada leitura na GPU; se o app cair no meio, a marca sobra
e a GPU fica desligada naquele aparelho dali em diante.

**Recorte para o medium** (`js/dateRegion.js`): o small lê a foto inteira e
diz onde está cada linha; a linha com mais cara de validade e as vizinhas
viram uma faixa da largura da foto, e o medium lê só ela. Medido: sabonete
33,4 s na foto inteira contra 3,6 s no recorte; chocolate 17,3 contra 5,3 s;
mesma data. O small não precisa ler certo, só achar o lugar (no copo ele leu
"17/09/46" e o medium, no recorte, "17/09/26"). Cada foto automática com
palpite passa por isso sozinha (`readGuessAuto`), e o resultado vota.

**"A validade está aqui?"** (`js/views/expiryFind.js`): quando a câmera não
resolve, a melhor foto aparece com o palpite marcado (o resto escurece):
"Sim" lê o pedaço; "Não? Toque onde ela está" encaixa na linha tocada, ou
pega uma faixa em volta do toque. Até 4 fotos diferentes (quase iguais ficam
só a de maior nota; tremidas vão para o fim), as outras numa fileira; "Não
está em nenhuma" fecha até chegar uma foto nova. Sem data no pedaço: "Não
consegui ler aí", o pedaço ampliado e "Digitar a data". Uma data clara vai
direto para a confirmação, com o pedaço como prova. O painel só abre quando
há palpite, quando a embalagem já se mostrou difícil, ou com a foto do
celular — antes disso as fotos são guardadas em silêncio.

**Foto do celular** passa pelo mesmo painel: o small lê a foto inteira (as
datas viram botões), marca o palpite, e a pessoa confirma ou toca.

**Pontinhos engordados** (`thickenDark` em `js/ocrImage.js`): se o medium não
acha data no pedaço, tenta de novo com o escuro "engordado" (4 e 5 passadas):
na tampa com validade em pontos, passou a ler "F:06/08/26" e "L:20:42 A".

As fotos automáticas usam menos filtros (3 do Tesseract + 2 do Paddle), para
saírem mais vezes. Vídeos reais, fluxo completo (sem GPU, neste computador):
copo confirmou 17/09/2026 sozinho em 35 s (antes 39–64 s); chocolate
perguntou a data certa aos 41 s; nenhuma confirmação errada. `sw.js` v64.

## Versão 3.49: "Câmera com vídeos reais" na tela de testes

Para medir no próprio iPhone (com a GPU dele) se a versão 3.48 melhorou ou
piorou o tempo: a tela de testes roda a câmera de validade inteira com os
vídeos do copo e do chocolate no lugar da câmera (`canvas.captureStream`),
nos dois jeitos, várias vezes, intercalados:

- **Antes**: leitor rápido sem GPU; fotos automáticas com 5 + 5 filtros e o
  medium na área da mira, sem palpite nem recorte (`experiment.legacy`).
- **Agora**: leitor rápido na GPU; 3 + 2 filtros, palpite e medium no recorte.

Mede, pelo registro da câmera, quando a data certa apareceu na tela, quando
perguntou "É esta data?", quando confirmou sozinha e se confirmou errado; a
tabela mostra quantas vezes e a mediana. Tudo fica guardado na tela e vai
para a Bancada. Os vídeos estão em `vendor/paddle/amostras/` em MP4 (sem
áudio e sem metadados; o iPhone toca) e o Chromium dos testes usa o WebM de
`tests/real/`. Cada vídeo é enquadrado com a validade perto do meio, onde
fica a mira. `sw.js` v67.

## Versão 3.50: a data certa em destaque não fica esperando

No iPhone, a data certa aparecia com "2×", "3×" e em destaque bem antes de
a câmera confirmar ou perguntar. Duas causas:

- **A votação esquecia leituras com mais de 9 s.** A contagem da tela vale
  para a leitura inteira, mas a votação só juntava leituras com até 9 s de
  distância. Num celular, duas leituras boas da validade (com "VAL") podem
  vir a 10–15 s uma da outra, e aí nunca somavam. A janela agora é de 45 s,
  o bastante para uma embalagem. As outras regras continuam: rótulo de
  validade, confiança, duas imagens diferentes e 2 votos à frente.
- **A pergunta só vinha com 4 imagens.** Agora vem no mesmo momento em que a
  data fica em destaque: 2 imagens diferentes e 2 à frente de qualquer outra.
  O texto passou a ser "Li 11/08/2027 mais de uma vez. É a validade?". Data
  passada sem rótulo continua sem virar pergunta, e data sem rótulo continua
  sem confirmar sozinha.

No Chromium, com os vídeos: o chocolate (data sem rótulo na linha) passou a
perguntar em 14 s, na 2ª imagem com a data (antes, entre 21 e 45 s); o copo
confirmou sozinho em 11 s; a lata e a tampa não fizeram nenhuma pergunta
errada. A comparação "Câmera com vídeos reais" também mostra quando cada
leitura viu a data certa e por que ela não contou. `sw.js` v68.

## Versão 3.51: validade em pontinhos (a lata)

Numa foto boa da tampa da lata ("FAB: 29/DEZ/25 / VAL: 29/DEZ/28 / LOTE:
1291225", impressa em pontinhos), o leitor detalhado (medium) não lia nada:
nem a foto inteira, nem o bloco. O leitor rápido achava as três linhas no
lugar certo, mas lia "FAB", "UFIL", "LOTE:1" e as caixas pegavam só metade
de cada linha.

- **`js/dotPrint.js` + `dotLine` (`js/ocrImage.js`).** Reduz o texto a
  ~24–30 px de altura e borra de leve: os pontos viram traço e o medium lê.
  Primeiro o bloco inteiro (o medium, assim, também diz onde cada linha começa
  e termina), depois cada linha bem recortada, com duas preparações cada. Cada
  leitura sozinha ainda erra (9 vira 6), então a data só vale se aparece em
  duas leituras e à frente das outras. Só roda quando a leitura normal do
  pedaço não achou data nenhuma: no painel "A validade está aqui?" (depois do
  "Sim" ou do toque) e no recorte das fotos automáticas.
- **Palpite pelo FAB/LOTE.** Sem nenhuma linha com cara de data, uma linha que
  começa com FAB ou LOTE vira o palpite (a validade costuma estar do lado).
- **Leituras tortas que agora viram data:** mês com número no lugar de letra
  entre dia e ano ("29/0EZ/28", "29/DE2/28" → dezembro; antes "DE2/28" virava
  fevereiro), "·" e "：" no lugar dos dois-pontos, "UAL/:", "/" lido como
  ">" ou "<", dois-pontos lido como "1" ("UAL129/DEZ/28"), e "VAL" lido como
  UAT/UAC/UA7 (entra na regra do rótulo mal lido, com as mesmas travas).

Na foto da lata, pelo app (foto do celular → painel → "Sim"): confirmou
29/12/2028, 17 s depois do "Sim" no Chromium. Antes disso, uma versão com uma
leitura só confirmou 26/12/2028; por isso a votação. Nos quatro vídeos reais,
nenhuma data errada; os vídeos da lata e da tampa continuam sem leitura
sozinha (os quadros do vídeo são bem mais borrados que a foto). `sw.js` v69.

## Versão 3.52: resolução cheia

Pergunta de quem usa: "por que roda com qualidade tão ruim, se a mira pega só
um pedaço da câmera?". Onde se perdia resolução:

- **A câmera pedia 1080p.** No iPhone, em pé, a caixa da câmera (4:3) mostra
  uns 42% do quadro, e a mira pega ~870 × 310 px dele. Agora pede 4K
  (`ideal`, as câmeras traseiras dos iPhones dão): o mesmo pedaço com o dobro
  de pixels em cada direção. O Safari não tem ImageCapture (a foto em
  resolução de foto), então o quadro do vídeo é o máximo que a página pega; a
  foto pelo botão da câmera do celular continua sendo a melhor imagem. O
  registro da câmera diz a resolução que veio, e a tela de testes tem "Ver a
  resolução da câmera" (pede 4K e 1080p e mostra o que veio).
- **O pedaço marcado era lido da cópia de 1600 px do painel.** A foto do
  celular (4032 px) e o quadro 4K ficavam com 40% da resolução antes de o
  medium ler o pedaço. Agora o painel guarda a foto em resolução cheia e o
  pedaço sai dela, com o texto posto perto de 40 px de altura (o medium põe
  cada linha em 48 px): texto pequeno ganha pixels de verdade, texto grande é
  reduzido e fica mais rápido.
- **Leitura de pontinhos só onde há votação.** O mês torto ("0EZ", "DE2") e
  ">" como barra só valem na leitura de pontinhos (`findExpiryCandidates(…,
  { dots: true })`); fora dela, o mês torto descarta a data. Nos quadros
  borrados do vídeo da lata, "28/0EZ/25" (a fabricação mal lida) virava
  botão. A leitura normal do pedaço também vota junto com a de pontinhos.

A foto da lata, pelo painel, confirma 29/12/2028. Nos vídeos, o copo e o
chocolate confirmam sozinhos. Datas erradas que ainda aparecem como botão nos
vídeos da lata ("22/DEZ/25", "DEZ/25") vêm do Tesseract em quadros borrados,
como antes. `sw.js` v70.

## Versão 3.53: o que o iPhone mostrou, e memória

Da tela de testes no iPhone (iOS 27, app instalado):

- **Câmera:** pedindo 4K veio 2160×3840 a 30 q/s; o máximo anunciado é
  4032×3024. **ImageCapture existe** (ao contrário do que diziam as fontes da
  web): as fotos automáticas já saíam por `takePhoto()`, em resolução de
  foto. O registro agora diz de onde veio cada foto automática ("foto
  4032×3024" ou "quadro …"), e o painel guarda essa foto inteira (o blob do
  `takePhoto`) para ler o pedaço marcado. A foto aberta é fechada no fim.
- **Comparação com vídeos:** o app fechou duas vezes, sempre na 2ª rodada do
  "Agora", e várias rodadas deram "Nenhum dos vídeos abriu". Duas causas:
  - Cada abertura da câmera criava e destruía os leitores (o medium com ~140
    MB, o small com uma sessão WebGPU), e o Safari demora a devolver essa
    memória. `sharedReader` (`js/paddleOcr.js`) mantém o mesmo leitor de uma
    abertura para a outra, com as leituras numa fila, e só o encerra depois
    de 2 min sem uso, ao fechar a página, ou se uma leitura falha (`kill()`).
    Vale também para o uso normal: vários produtos seguidos.
  - O service worker ficava no meio dos pedidos de vídeo em pedaços (Range).
    Vídeos (e qualquer pedido com Range) agora vão direto para a rede. O
    erro de vídeo passa a dizer o motivo.
- **Números válidos que vieram** (copo, sem toque da pessoa): "Antes" confirmou
  em 12,7 e 10,6 s; "Agora" em 12,9 s. As primeiras rodadas tiveram a data
  tocada à mão (confirmou sem "confirmed" no registro) e não contam.

`sw.js` v71.

## Versão 3.54: a foto automática é só a faixa da tela

Ideia de quem usa: a mira fica no meio, na vertical; o que fica cortado em
cima e embaixo da tela não precisa ser procurado. Até aqui, cada foto
automática ia inteira para o painel e para o leitor rápido achar as linhas
(o palpite de onde está a validade), reduzida a 1600 px: em pé, o quadro 4K
(2160×3840) virava 900×1600, e o texto chegava ao leitor com 42% do tamanho.

Agora a foto automática é cortada na faixa que aparecia na tela (largura
inteira, `visibleBox` + `cropBand`): em pé, uns 42% da altura. O quadro 4K
vira 2160×~1600, que cabe nos 1600 px com 74% do tamanho, e o leitor só
procura ali. O painel também mostra só essa faixa, que é o que a pessoa via.
A foto do celular (botão da câmera) continua inteira: ali a pessoa enquadrou.
A foto do ImageCapture deitada com o vídeo em pé (ou o contrário) não é
usada: não dá para saber para que lado girou. `sw.js` v73.

Com o vídeo do copo inteiro, em pé (1080×1600): as fotos foram para o painel
como 1080×608, o palpite achou a validade e confirmou 17/09/2026.

## Versão 3.55: menos camadas, e o uso real medido

Uma revisão crítica do fluxo, com os 4 vídeos reais contados leitura por
leitura:

- **O Tesseract saiu da câmera.** Em 133 leituras ao vivo ele não achou a
  data certa nenhuma vez; as datas erradas que viravam botão (lata, tampa)
  eram dele; e ele vinha primeiro, segurando o Paddle (que só entrava depois
  de 6 tentativas, ou 3 e 7 s) e disputando processador e memória. Agora o
  Paddle small lê desde o começo (pronto em ~3 s no Chromium; na GPU do
  iPhone, 0,66 s por leitura) e o Tesseract só carrega se o Paddle falhar
  (ele assume a câmera, as fotos e o painel). O modo "Antes" da tela de
  testes continua como era, para comparar. No painel, o Tesseract só entra
  sem nenhum Paddle.
- **Registro do uso real** (`js/expiryUsage.js`): cada abertura da câmera de
  validade guarda no celular quanto levou e como terminou (sozinho,
  pergunta, botão, painel, digitou, saiu da câmera), se salvou, e se a data
  sugerida ao digitar ficou. A tela de testes mostra o resumo ("Uso real da
  validade") e manda junto no "Enviar para o Claude".
- **Foto sugerida mais cedo:** texto na mira (6 leituras com texto) e nenhuma
  data depois de 14 s: "Vejo texto, mas a data não sai pelo vídeo. Tire uma
  foto com a câmera do celular", com o botão em destaque. Antes, a primeira
  ajuda desse tipo vinha aos 35–40 s.
- **Limpeza:** saiu a tentativa de "engordar" os pontos no painel (4 e 5
  passadas): uma leitura só, sem votação, que podia confirmar data errada. A
  leitura de pontinhos (3.51) faz o mesmo papel, votando.

Nos vídeos, no Chromium: copo confirmou em 12 s (era 21), chocolate em 36 s
(era 40–47 s ou nada), a tampa mostrou a data certa (19,6 s) pela primeira
vez, a lata sugeriu a foto aos 24 s. Os testes de interface simulam o Paddle
small (worker falso por `BroadcastChannel`, `tests/ui/harness.mjs`) e têm um
teste para a câmera sem Paddle (cai para o Tesseract). `sw.js` v74.

## Versão 3.56: a tela da câmera, arrumada

A tela de validade tinha ficado com coisa demais, e as partes brigavam:

- **Duas instruções ao mesmo tempo.** A cápsula sobre o vídeo dizia uma coisa
  ("Segure parado, com a data dentro da mira") e o texto embaixo, outra
  ("Incline a embalagem…", "Tire uma foto…"). Agora há uma instrução só, na
  cápsula, curta (cabe numa linha), escolhida por `idleText()` conforme o
  momento: "Aponte para a validade" → "Incline a embalagem devagar" / "Mude a
  luz de lado" → "Tire uma foto com o celular" → "Mostre a validade na foto
  abaixo". Avisos de imagem ("Pouca luz…", "Reflexo na data…", "Segure
  parado") entram por cima só antes da foto ser sugerida. As fotos
  automáticas não trocam mais o texto ("Lendo a foto"): o piscar branco basta.
- **O botão da foto aparecia tarde e ficava escondido.** "Tirar foto" agora
  está sempre à vista, numa barra fixa ao lado de "Digitar a data", logo
  abaixo das datas (a câmera põe o botão na barra da folha, opção `bar`). O
  painel "A validade está aqui?" abre embaixo da barra, então nada empurra os
  botões para fora da tela. O caminho recomendado (foto, ou foto e digitar
  quando está difícil) só ganha fundo; o respiro é o mesmo, nada se mexe.
- **Cartões concêntricos.** A pergunta e o painel são cartões de raio 22 com
  respiro 8, os botões de dentro têm raio 14 (14 + 8 = 22), a foto do painel
  também. Os botões do painel ("Sim", "Não está aqui") dividem a largura como
  os da pergunta. Miniaturas e o pedaço ampliado ganharam o contorno de 1 px
  das imagens; o toque nas miniaturas usa 0,96, como o resto do app.
- **Textos:** "11/08/2027 é a validade?" (a data e a contagem já estão no
  botão logo acima); "Não está aqui" quando só há uma foto; porcentagem da
  preparação com números de largura fixa.
- O estado vai em `data-state` na câmera ('' | 'dica' | 'foto' | 'dificil'),
  usado pelos testes. `sw.js` v75.

## Versão 3.57: cor e movimento na câmera de validade

"Muito monocromático e sem fluidez; queria algo mais Apple." A folha de
validade usava só a tinta (--mode = --ink). O que mudou, por camada:

| Parte | Camada | Vidro | Por quê |
|---|---|---|---|
| Vídeo | conteúdo | não | é o que a pessoa olha |
| Cápsula de instrução | flutua sobre o vídeo | sim, o escuro da lanterna (`--glass-media`, blur 16) | o vídeo se move por baixo |
| Datas, pergunta, painel, barra | dentro da folha | não (sem vidro sobre vidro) | preenchimentos e a cor da validade |

- **Cor da validade** (`--val`, `--val-ink`, `--val-soft`): o âmbar de
  "acabando", que também é a cor com que o iPhone marca texto reconhecido na
  câmera. Só no que importa: os cantos da mira quando uma leitura acha data,
  a data mais provável (marcador âmbar), o número "3×", o "Sim" (âmbar com
  texto escuro, como a etiqueta "Acabando"), a moldura do palpite no painel
  e o botão recomendado. `--val-ink` tem 6,8:1 no papel; no escuro, #F5C451.
- **Movimento** (as molas `--spring` / `--spring-bouncy` do app):
  - a cápsula muda de largura com mola e o texto novo entra de um leve
    desfoque; o texto fica centrado e é recortado igual dos dois lados
    durante a troca (sem "abai…");
  - a mira: viu uma data, os cantos ficam âmbar e ela "respira" (1,03, mola
    com rebote); aceitou, ela trava (0,96, véu âmbar, resto mais escuro) por
    420 ms e só então vem a confirmação;
  - as datas entram crescendo de um leve desfoque; o "3×" sobe rolando;
  - a pergunta e o painel sobem 10 px com mola (`card-in`).
  Com "reduzir movimento": só cor e opacidade, e a confirmação é imediata.
- Cor animada da mira por `@property --aim-color`. `sw.js` v76.

## Versão 3.58: os bancos irmãos do Open Food Facts

O código de barras agora também é procurado no **Open Beauty Facts** (beleza
e higiene) e no **Open Products Facts** (casa, limpeza, pilhas…), em paralelo
com o Open Food Facts, depois das lojas. Grátis, sem chave e sem limite,
mesmo formato de resposta. Vale o primeiro da lista que achar (comida, beleza,
casa); a origem fica no produto (`source`: 'off', 'obf' ou 'opf'). Têm pouco
produto brasileiro (≈500 e ≈190 em set/2026), então o ganho é pequeno, mas o
custo também: uma consulta a mais, ao mesmo tempo que as outras.
Conferido: creme dental Boni (7890310111489) vem do OBF, pilha Panasonic
(7896067203125) do OPF, leite condensado Moça (7891000100103) do OFF. `sw.js` v77.

## Versão 3.59: mais lojas e catálogo próprio (só o repassador)

Nada muda na tela; o código de barras é reconhecido mais vezes.

- **10 lojas novas** no `/lookup` (27 no total): Atacadão, Sam's Club, São
  João Farmácias, Cobasi, Rissul, Super Muffato, Prezunic, Lojas Rede, Comper
  e Carrefour. As três últimas bloqueiam o repassador no site principal e
  respondem pelo endereço de bastidores da VTEX
  (`conta.vtexcommercestable.com.br`). Rissul e São João também entram na
  busca por nome. Exemplo: sabonete Maran (7896394807379), que só o Atacadão
  conhecia.
- **Catálogo próprio** (SYSTEM_DESIGN 5.5): banco D1 grátis da Cloudflare,
  enchido por um robô a cada minuto e pelo que as lojas acham ao vivo. O
  `/lookup` olha nele primeiro. ~25 bytes por produto. A resposta vem com
  `source: 'catalogo'`; o app trata como loja. Sem mudança no `sw.js`.
- **Systax** como mais um catálogo de código de barras (depois das lojas, em
  paralelo com o CadastroProduto): nome e NCM (`ncm` na resposta). A página
  de um código que ela não tem mostra outro parecido com HTTP 200; só vale
  quando o produto principal da página tem o mesmo GTIN pedido (14 dígitos).
  Testes: `node test/systax.mjs` (com `REDE=1`, as páginas reais).

## Versão 3.60: o ambiente certo, sozinho

Produto novo cai no ambiente certo muito mais vezes, e o app avisa quando não
tem certeza em vez de jogar em Cozinha calado (SYSTEM_DESIGN 5.6).

- **Aprende com a casa:** escolher o ambiente à mão (inclusive tocar no que já
  estava marcado) ou trocar na página do produto ensina os próximos com o
  mesmo começo de nome.
- **Categoria da loja lida por palavras** ("Limpeza e Lavanderia", "Drogaria").
- **Modelo no aparelho** (`data/area-model.json`), sem internet: acerta 98%
  só pelo nome, 96% com nome de cupom.
- **Sem certeza:** pergunta ao Mercado Livre pelo repassador; se ninguém
  souber, o campo "Onde fica" fica âmbar (`--val-soft`) com "Não tenho
  certeza. Confira onde fica.", que some ao tocar num ambiente.
- Testes: `tests/areas.test.mjs`, `tests/ui/area.test.mjs`. `sw.js` v78.

## Versão 3.61: produto que ninguém tem, pela web

- **Código:** quando lojas e catálogos não conhecem, o repassador procura o
  número na web (SYSTEM_DESIGN 5.4). O app espera até 20 s (antes 12 s).
- **Foto:** com menos de 3 sugestões das lojas, entram até 3 da web (Cosmos e
  Systax), com o código de barras, no fim da lista "Qual destes?".
- **Foto do que vem da web:** do Cosmos ou da própria busca, reduzida pela
  Cloudflare para 320x320 em WebP (~15 KB), guardada no catálogo e servida
  pelo repassador (`/foto/{código}`); o celular guarda para usar sem
  internet. Fotos das lojas também em 320x320 (antes 200x200, borradas na
  folha do produto). A foto que a casa tira continua só no celular.
- `sw.js` v80.

## Versão 3.62: telemetria

- O app registra sozinho aberturas, telas, erros, buscas (código, nome, foto
  com IA, nota fiscal), cadastros (com o palpite de ambiente contra a escolha
  final) e cada uso da câmera da validade, e manda em lote ao repassador
  (SYSTEM_DESIGN 5.7). Nada muda na tela.
- `sw.js` v81; `APP_VERSION` em `js/config.js` (igual, conferido em teste).

## Versão 3.63: modo Validade

Para marcar depois as validades do que já está no armário (chegou das compras,
guardou tudo e deixou as datas para outra hora), sem procurar produto por
produto na lista.

- **Validade** no topo do Armário, ao lado de Nota fiscal (`#/validade`).
  Abre o leitor na cor âmbar das datas (texto escuro: branco no amarelo não
  se lê; o texto em âmbar usa `--val-ink`).
- Leu o código: acha o produto no armário e já abre a câmera da data, para
  as unidades sem data. Salvou: a linha entra na lista ("Leite ... 20/11") e o
  leitor espera o próximo. **Concluir** volta ao Armário.
- **Datas que o produto já tem** aparecem em cima da câmera ("Já marcadas:
  15/10/2026 (2 unidades). Leia uma das outras.") e não entram sozinhas pela
  câmera. Se a data lida for uma delas, a confirmação avisa ("Essa data já
  está marcada em 2 unidades. Se esta embalagem é uma das que já tinham data,
  leia outra.") com **Ler outra embalagem**.
- Todas as unidades já com data: mostra as datas e **Abrir o produto** para
  corrigir. Zerado ou fora do armário: **Guardar pela Entrada**. Vários
  produtos com o código: **Qual destes?**. **Procurar pelo nome** (no lugar de
  "Produto sem código de barras") busca no que tem no armário.
- Tela estreita: até 409 px a Nota fiscal fica só com o ícone; até 359 px,
  as duas.
- Telemetria: `validade-modo` (produto, datas que já tinha, resultado).
- Testes: `tests/ui/validade.test.mjs`. `sw.js` v82.

## Versão 3.64: modo Validade mostra as datas ao abrir

A telemetria mostrou o modo aberto por 6 s e fechado sem ler nada: ao entrar,
a tela não dizia o que já tinha data. Agora, embaixo da câmera, **No armário**
lista cada produto com as datas já marcadas (15/10/2026 ×2) e, em âmbar,
quantas unidades estão sem data; esses vêm primeiro. A nota diz quantos faltam
("1 produto tem unidade sem data") ou "Todos os produtos já têm data". Tocar
no produto marca sem ler o código. A lista se atualiza ao salvar. `sw.js` v83.

## Versão 3.65: modo Validade, retorno e menos dúvida

- **O produto reconhecido no topo** da leitura e da confirmação (foto, nome e
  "1 de 3 sem data"): quem leu o código errado vê na hora.
- **Datas já marcadas em etiquetas**: "Já têm data: 15/10/2026 ×2" e "Falta 1
  unidade. Pegue uma embalagem sem data." (a conta acompanha quando se marca
  uma data e volta para a próxima).
- **Data repetida, pergunta direta**: "Esta embalagem é uma nova com a mesma
  data, ou uma das que já tinham?" com **Era uma das que já tinham** (volta à
  câmera sem guardar) e **É nova, salvar**.
- **Desfazer** no aviso depois de salvar (5 s); `addLot` devolve o id do lote.
- **Procurar pelo nome** mostra primeiro os que têm unidade sem data, com a
  contagem; os outros dizem "Todas com data".
- `sw.js` v84.

## Versão 3.66: validades já cadastradas em lista

Com datas diferentes nas unidades (1 leite para 01/12, 2 para 03/12), as
etiquetas quebravam torto e a data repetida só dizia "já está marcada em 2
unidades". Agora é a mesma lista nos três lugares (em cima da câmera, na data
repetida e em "Todas as unidades já têm data"): **Validades já cadastradas**,
uma linha por data com quantas unidades e quanto falta ("2 unidades · daqui a
64 dias"). Na data repetida, a linha igual fica contornada com a etiqueta
**Igual**, e embaixo: "Essa data já está cadastrada. Esta embalagem é nova, ou
uma das que já tinham data?" (`datesListHtml` em `expiryLots.js`). `sw.js` v85.

## Versão 3.67: layout do modo Validade (revisão better-layout)

Medido em 320, 393 (com e sem letra grande) e 430 px, com 3 datas cadastradas:
"É nova, salvar" ficava abaixo da tela em 320 e 393 px, e "Digitar a data"
também. Agora:

- **Ações presas no fim da folha**, como o rodapé da nota fiscal: os botões da
  confirmação e "Tirar foto / Digitar a data". Fundo sólido e um degradê curto
  acima (nada de texto por cima de texto); o botão cinza é sólido.
- **A pergunta da data repetida vai junto das respostas**, no rodapé; a lista
  de datas, com a **Igual**, fica logo abaixo da data lida.
- **No máximo 3 datas na lista** e "Mais N datas, N unidades"; a igual sempre
  aparece.
- **Grupos pelo espaço, na grade de 4 px**: dentro da lista 4 e 8 px; "Faltam
  N" 12 px depois dela; notas 4/12 px.
- **Linhas do "No armário" com a seta ›**: são tocáveis, como nos Ajustes.
- Tela baixa (até 700 px de altura): o ícone decorativo da confirmação sai.
- `sw.js` v86.

## Versão 3.68: "Onde fica" desliza e botão preso nos formulários

Revisão de layout no resto do app (medido em 320, 375 e 393 px, e com letra
grande):

- **Seletor "Onde fica" desliza para o lado.** Cabendo, as opções dividem a
  faixa igual, como antes. Não cabendo (tela estreita, letra grande), cada
  opção fica com o nome inteiro e a faixa rola para o lado; tocar seleciona.
  Na borda que continua aparecem um degradê e uma setinha (só quando há mais);
  a opção escolhida (inclusive a que o app escolheu sozinho) fica à vista
  (`revealSegment` em `ui.js`). Antes, "Remédios" aparecia cortado
  ("Remédi…") em 320 px e com letra grande.
- **Botão principal preso no fim da folha** (`.sheet-sticky`) no cadastro de
  produto novo, na folha de guardar e em Editar detalhes: em 320 e 375 px e
  com letra grande, "Guardar" e "Salvar" ficavam abaixo da tela. Em Editar
  detalhes, "Remover do armário" continua no fim do conteúdo.
- `sw.js` v87.

## Versão 3.69: telemetria nova (primeiro passo da nova versão)

Primeiro item do [plano de melhorias](PLANO_MELHORIAS.md) (seção 3.3). Nada
muda na tela, a não ser dois textos:

- **Câmera negada:** no app instalado, "Feche e abra o app de novo para o
  iPhone perguntar outra vez, ou digite o código" (fechar e abrir funciona; é
  o que vocês fizeram). No navegador, continua apontando os ajustes do site.
- **Revisão da contagem sem nada contado** dizia "Tudo o que foi contado
  confere". Agora: "Nenhum produto foi contado · Volte e leia os produtos para
  contar."

Telemetria nova (detalhes em SYSTEM_DESIGN, 5.7): aparelho e tempo para abrir,
provável queda, câmera negada, resumo de cada ida ao leitor, Desfazer logo
depois de trocar de modo, diferenças da contagem, busca sem resultado, tempo da
leitura do código no modo Validade e o tempo de cada etapa do repassador.

- `sw.js` v88.

## Versão 3.70: cópia automática

Segundo passo da nova versão (PLANO_MELHORIAS, seção 9, adiantado pela
seção 11.14). Em Mais › Backup:

- **Cópia automática** mostra a hora da última ("Hoje, 22:43", "Ontem, 18:10",
  "29/09" ou "Ainda não fez"). Tocar faz uma agora.
- **Restaurar de uma cópia:** mostra o **código desta casa** (com "Copiar o
  código") e um campo para digitar o código de outro celular. Busca a cópia,
  diz quantos produtos e de quando ("Restaurar 24 produtos? Cópia de
  30/09/2026 22:43…") e só então substitui.
- A nota embaixo passou a dizer que a cópia vai sozinha e como levar a outro
  celular.

Detalhes em SYSTEM_DESIGN, seção 5.8. `sw.js` v89.

## Versão 3.71: nenhuma loja tem o código

Terceiro passo da nova versão (PLANO_MELHORIAS, seções 5.3 a 5.5).

- **As opções aparecem em ~3 s**, não mais em até 17 s. O app consulta primeiro
  sem a web (`/lookup?web=0`); se nenhuma loja nem catálogo tem, a folha mostra:
  - o código, "Nenhuma loja tem este código" e "Fotografe a frente da
    embalagem, onde está o nome. O resto se preenche sozinho.";
  - **Fotografar a frente** (principal) e **Digitar o nome**;
  - embaixo, "Ainda procurando na internet". Se a web achar, a linha vira
    "Na internet: {nome}" com **É este**, no mesmo lugar (nada se mexe em cima).
    Se não, "A internet também não tem este código."
- **Foto → sugestões:** só aparecem as da marca que a IA leu, com o tamanho igual
  primeiro. A mensagem diz o que está na embalagem ("Na embalagem: …").
  "Usar o que a foto leu" virou **"Usar o que está na embalagem"**.
- **Nome escolhido numa sugestão e diferente do da embalagem:** ao tocar no
  campo do nome, aparece **"Usar o que está na embalagem: {nome}"**.
- **Nomes em outro alfabeto** saem também das sugestões da busca e da web
  (repassador).
- **"Confira onde fica"** só aparece depois de ter um nome, e não diz mais
  "Não tenho certeza" (o texto não fala de si).
- `sw.js` v90.

## Versão 3.72: nomes da comunidade

Quinto passo da nova versão (PLANO_MELHORIAS, seção 6; SYSTEM_DESIGN, 5.9).

- Produto novo cujo nome veio de outra pessoa: selo **"Nome sugerido por outra
  pessoa"** (com "· 2 confirmaram" quando confirmado) e **É este** / **Não é
  este** (desde a 3.75 o selo diz só **"Da comunidade"**). "É este" deixa "Você confirmou este nome."; "Não é este" volta ao
  formulário sem o nome, para fotografar ou digitar.
- Ao guardar um produto cujo nome veio da foto da embalagem, sem mexer no nome,
  ele vai para a comunidade. Digitado à mão, não vai.
- Ícone novo: `users` (Phosphor bold).
- `sw.js` v91.

## Versão 3.73: validade e histórico

Sexto passo da nova versão (PLANO_MELHORIAS, seção 4).

- **Fabricação e validade com o mesmo dia e mês** ("18/02/24" e "18/02/27"): fica
  a mais distante, que conta como rotulada (`js/dates.js`). Eram os dois erros de
  ano da telemetria de 30/09.
- **Câmera pausada visível:** com uma folha aberta sobre o leitor, a imagem
  escurece e mostra "Câmera pausada" (depois de 400 ms, para não piscar).
- **Leitura difícil mais cedo:** a sugestão da foto do celular aos 8 s (antes
  14 s) e o "difícil", que oferece digitar, aos 15 s (antes 35 s).
- **Modo Validade, "todas com data" sem folha:** um aviso "Leite Integral 1L: já
  tem data. 15/10/2026 (2)." com **Abrir**, e a câmera segue lendo.
- **Data que já passou:** depois de marcar, o aviso diz "venceu há 51 dias" com
  **Jogar fora** (remédio: **Separar para descartar**, e lembra que as farmácias
  recebem). Jogar fora é um movimento novo, `descarte`: sai do armário, não conta
  como consumo, e oferece **Adicionar às Compras**.
- **Histórico como diário:** "Guardou 2", "Tirou 1", "Jogou fora 1", "Contou 3
  (eram 1)", "Ajustou para 4 (eram 5)" (produto e Mais).
- `sw.js` v92.

## Versão 3.74: bips diferentes

- **Guardar** toca dois tons subindo; **Tirar**, dois tons descendo. O ouvido
  percebe o modo sem olhar a tela (defesa contra troca de modo sem querer,
  PLANO_MELHORIAS, seção 11.2). Contagem e Validade continuam com o bip único.
- `sw.js` v93.


## Versão 3.75: sem pontos separadores

- **Regra nova** (DESIGN_SYSTEM, seção 8): nada de "·" ou "•" entre
  informações. Cada coisa vai no seu lugar.
- **Validades** (produto, folha de validade e "já cadastradas"): a data em
  cima, "Venceu há 52 dias" ou "Daqui a 212 dias" embaixo, e a quantidade à
  direita ("2 unidades").
- **Mais › Últimos registros:** o nome e a hora na primeira linha; o que
  aconteceu ("Guardou 4") e "ficou 4" na segunda.
- **Nome da comunidade:** o selo diz só **"Da comunidade"**, sem contar
  confirmações nem dizer quem sugeriu. O voto **É este / Não é este** fica.
- As telas de diagnóstico também trocaram o ponto por vírgula.
- `sw.js` v94.

## Versão 3.76: o selo da comunidade abraça o nome

- O selo **"Da comunidade"** é a ponta de um contorno fino que envolve o
  campo **Nome do produto** e o voto **É este / Não é este**. O selo e a linha
  têm o mesmo traço, para ler como uma peça só: fica claro que "da
  comunidade" é o nome, e que o voto é sobre ele.
- Raio do contorno concêntrico com o do campo (o do campo mais o espaço até a
  linha).
- **Mudou o nome, o contorno solta:** ao editar o nome, ele deixa de ser o da
  comunidade, e o contorno, o selo e o voto somem. Se voltar ao mesmo nome,
  voltam.
- `sw.js` v95.

## Versão 4.0: o design novo (DESIGN_NOVO.md)

O app inteiro no desenho das pranchas. Resumo do que mudou para quem usa:

- **Armário:** uma ação no topo, **Conferir**, com o menu dos três jeitos
  (Conferir tudo, Só contar, Só marcar validades). O **Pede atenção**
  (vencidos, vencem esta semana, acabando, zerados, dias sem conferir) filtra a
  lista no lugar; nos que vencem, a data vira a etiqueta e a linha ganha
  Adicionar às Compras e Jogar fora. **Toque longo** sobe o cartão com − número
  + e as validades, com um menu curto. Armário vazio e busca sem resultado com
  as ações certas.
- **Produto e remédio, a mesma página:** foto (ou a caixa) no centro, os três
  blocos Tirar 1 / número / Guardar 1, **Editar** escrito. Editar: Nome, Marca e
  Tamanho, Onde fica, Avisar quando tiver, Salvar, Remover em texto vermelho e
  o código no rodapé. Tocar no número corrige a quantidade.
- **Remédio como caixa:** a caixa desenhada pelos dados da Anvisa (tarja de
  verdade, G do genérico), o selo colado, o vencido com **Separar para
  descartar**, o cartão do que a tarja quer dizer, a unidade **caixa**, a ficha
  completa e o **Uso contínuo** com a cartela (estima quantos comprimidos sobram
  pelo ritmo; **Contar** corrige; avisa uma semana antes e põe nas Compras).
  Remédio de uso eventual não aparece como acabando nem vai para as Compras.
- **Leitor:** Guardar e Tirar; cada leitura de um produto conhecido guarda ou
  tira 1 na hora; o cartão tem − +1 + (no lugar do Rápido e do Desfazer) e
  tocar no número abre o teclado; Tirar que acaba oferece Adicionar às
  Compras; o cupom vivo; a barra Digitar + Nota fiscal / Concluir; o QR Code da
  nota vira um cartão com **Ver os N itens**; o cupom final "GUARDADO" fecha ao
  tocar fora.
- **Conferir:** faixa azul com o anel; a quantidade começa no que o armário
  diz; o cupom "Conferidos" com ✓; **Ver os N que faltam** por ambiente, com
  Contar; vencido com Jogar fora e Ainda está bom; na primeira vez, os três
  passos, o ambiente e o tempo estimado. **Revisão:** resumo em números, Não
  apareceram com Zerar por linha e Zerar todos, Diferenças, **Aplicar e
  concluir**.
- **Compras:** Adicionar à lista no alto, os remédios num cartão **Farmácia**
  com a receita de cada um e "Leve as receitas", "No carrinho" no marcado e
  "Voltou do mercado? Ler a nota fiscal".
- **Cupons** por dia, em cartões, com o ícone na cor do modo e a seta.
- **Mais:** Armário (Conferir, Cupons), Dados (Cópia automática, Baixar uma
  cópia, Restaurar uma cópia, Baixar planilha), Som e Avançado.
- **Botão Ler** com cor fixa e o nome; o leitor sempre abre em Guardar.
- **Animações** (DESIGN_SYSTEM, seção 7): selo de pronto, o produto voando até
  o cupom, a caixa do remédio, a cartela, o anel do Conferir.
- `sw.js` v96.

## Versão 4.1: correções do remédio

- **Uso contínuo travava a tela.** O seletor "Toma por dia" avisava "mudou" ao
  ser montado; o aviso gravava o remédio, a gravação redesenhava o cartão, que
  montava o seletor de novo, sem fim. Agora o seletor só avisa quando o número
  muda de verdade (vale para todos os seletores do app). Teste novo:
  `tests/ui/remedio.test.mjs`.
- **A caixa cabe tudo:** o nome, o princípio ativo e a dose diminuem até caber
  (no máximo duas linhas cada); a caixa cresce em altura quando precisa; o
  laboratório e o G ficam numa coluna à direita, que o nome não invade
  (laboratório longo vira reticências). A ficha completa continua logo abaixo.
- **Todo remédio tem a caixa,** também os cadastrados sem os dados da Anvisa
  (à mão, por loja, por foto): a caixa sai do nome, da marca e do tamanho, sem
  tarja, porque não dá para saber qual é.
- O selo ("Vencido", "Acaba em ~6 dias") fica mais para fora da caixa.
- `sw.js` v97.

## Versão 4.2: inércia e aviso de receita

- **Inércia (motion.js `sway`):** como gente em pé no ônibus. Os blocos do
  "Pede atenção" ficam um pouco para trás quando a faixa arranca e, quando ela
  para, vão para a frente e voltam ("blup"). Giram pelos pés; o ícone vai
  pendurado e balança com atraso; cada bloco tem a sua mola, para não
  balançarem juntos. Rolando a página, os blocos também descem um pouco e
  quicam ao parar. As abas de ambiente se inclinam como texto em itálico. Na
  página do remédio, a caixa fica para trás quando a página rola e balança
  para a frente quando ela para.
- A faixa do "Pede atenção" não volta mais para o começo ao ligar um filtro:
  guarda onde estava e anda até o bloco escolhido.
- **Bobeirinhas:** a aba tocada dá um pulinho com o jeito do ícone (a caixa
  quica, o carrinho arranca e freia, o cupom sai da impressora, as linhas do
  Mais balançam); o selo das Compras pula quando o número muda; o botão Ler,
  na primeira vez, tem uma linha de leitor passando pelo código; cada bloco do
  "Pede atenção" reage do seu jeito ao ligar (o aviso treme, o calendário
  pula, a ampulheta vira, o tracejado gira); o ícone dos vazios flutua.
- **Aviso de receita só quando a farmácia fica com ela** (tarja preta e
  vermelha com retenção): na prática, ninguém leva receita para a tarja
  vermelha comum. Sem cartão "Precisa de receita" nem "Sem receita" para os
  outros; a ficha não tem mais a linha "Venda"; nas Compras, "Leve a receita"
  só para os retidos. A tarja continua na caixa desenhada. Teste novo em
  `tests/ui/remedio.test.mjs`.
- Com `prefers-reduced-motion`, nada disso se mexe.
- `sw.js` v98.

## Versão 4.3: nada pisca, tudo desliza

- **js/morph.js:** as telas não são mais redesenhadas a cada mudança. O app
  compara o HTML novo com o que está na tela e muda só o que mudou, então
  fotos, foco e rolagem ficam, e nada "pisca". Cada mudança se mexe com mola:
  - o que sai some no lugar e o espaço fecha devagar (o de baixo desliza para
    cima, nunca pula); no meio de uma linha (o "−" que some, uma pílula), a
    peça vira um fantasma e os vizinhos deslizam já;
  - o que entra abre espaço a partir de zero;
  - o que muda de lugar desliza até lá, inclusive de uma lista para outra
    (busca, filtros);
  - linhas e cartões que mudam de altura crescem ou encolhem;
  - números rolam para o lado certo; textos curtos (pílulas) trocam suave;
  - cores de estado (etiqueta preta, amarela, tracejada) mudam com transição.
  Itens se reconhecem por `data-key` (ou `data-code`, ou `id`).
- Onde vale: Armário (lista, "Pede atenção", abas, aviso do Conferir),
  página do produto (etiqueta, pílulas, vencido, uso contínuo, validades),
  Compras, leitor (cartão e cupom vivo), Conferir (cartão e cupom) e
  Validades.
- **Compras:** marcar risca o nome, o círculo pula ao encher e, meio segundo
  depois, o item desce para o fim do grupo, deslizando.
- **"−1" que sobe:** tirar 1 na lista ou no produto solta um "−1" (ou "+1")
  que sobe da etiqueta e some.
- **Cartela:** o comprimido tomado afunda e esvazia.
- **Chave:** a bolinha estica ao apertar e vai com mola.
- **Folhas:** o conteúdo sobe em cascata na abertura.
- **Título grande:** encolhe um pouco e esmaece ao rolar (onde o navegador tem
  animação por rolagem).
- **Abas de baixo:** a tela nova vem um pouco do lado da aba tocada.
- **Busca sem resultado:** a lupa balança a cabeça ("não achei").
- Com `prefers-reduced-motion`, tudo muda na hora.
- `sw.js` v99.

## Versão 4.4: abertura do produto de volta, toques e movimento do celular

- **A abertura do produto voltou a animar.** Logo depois de abrir, a página
  trocava a etiqueta de quantidade por outra igual; a etiqueta é uma das que
  voam da linha até a página, e trocá-la no meio cancelava a animação (a
  página aparecia num supetão). Agora a etiqueta muda no lugar: só a cor (com
  transição) e o número (rolando) quando mudam. Teste novo:
  `tests/ui/transicao.test.mjs` (abrir e voltar têm de durar a animação toda).
- **"Acabando" saindo no produto:** a pílula encolhe e some, e o que vem
  embaixo sobe junto (antes o espaço sumia de uma vez). No remédio, o selo da
  caixa descola (gira e cai) e o novo cola com um tapinha.
- **Aviso de baixo:** com um aviso já na tela, o novo não entra de novo (só
  troca o texto com um tapinha); arrastar o aviso para os lados ou para baixo
  e soltar com força joga fora; soltar devagar volta com mola.
- **Toques:** tocar na caixa do remédio chacoalha (com vibração de
  comprimidos); o ícone dos vazios quica; o ícone dos títulos balança; a foto
  do produto balança; a lupa olha em volta ao entrar na busca e pula a cada
  letra (js/play.js).
- **Movimento do celular (bem de leve):** a caixa do remédio inclina até
  5 graus com o celular e o brilho da embalagem corre junto; os ícones do
  "Pede atenção" pendem um tiquinho para o lado do chão. Só a mudança conta:
  segurando inclinado, volta ao neutro em cerca de um segundo. No iPhone, a
  licença é pedida no primeiro toque na caixa. Mais › Som e movimento ›
  "Reagir ao movimento do celular" desliga. Nada disso com "Reduzir
  movimento".
- `sw.js` v100.

## Versão 4.5: movimento do celular no iPhone

- O Safari só dá a licença do movimento se o pedido vier no fim de um toque
  (pointerup, touchend, click). O app pedia no começo do toque
  (pointerdown): o Safari recusava sem mostrar nada, e o app não tentava de
  novo. Agora pede ao soltar o dedo da caixa do remédio, e um erro deixa
  tentar no próximo toque.
- Mais › Som e movimento: no iPhone, a chave aparece desligada até haver
  licença; ligar pede ali mesmo e, se o iPhone negar, ela volta a desligar e
  o aviso diz o que fazer.
- Com a licença dada uma vez, o primeiro toque em qualquer lugar, quando o
  app abre, pede de novo em silêncio (o iPhone esquece ao fechar o app).
- Teste novo: `tests/ui/movimento.test.mjs` simula o Safari (só aceita no
  fim do toque).
- `sw.js` v101.
