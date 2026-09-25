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
          └── menu ─────────► ┌──────────┐
                              │  Dados   │
                              │ #/dados  │
                              └──────────┘
```

As folhas (produto lido, escolha entre produtos, digitar código) abrem por cima
da tela atual e não mudam o endereço.

---

## 1. Armário `#/`

Tela inicial. Responde "quanto tem de cada coisa?".

```
┌─────────────────────────────────┐
│ Armário           [Contar]  [≡] │  Contar abre o inventário; ≡ abre Dados
│ 23 produtos, 4 acabando         │  resumo
│ ┌─────────────────────────────┐ │
│ │ Buscar no armário           │ │
│ └─────────────────────────────┘ │
│ Todos   Acabando 4   Zerados 1  │  abas, a ativa sublinhada
│ ‾‾‾‾‾                           │
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
- Ordem: acabando primeiro, depois alfabética.
- Busca filtra por nome, marca ou código enquanto digita.
- Vazio: "Comece pela Entrada." e uma frase com o passo a passo.

## 2. Leitor `#/entrada` e `#/saida`

Mesma tela, duas cores. A faixa do modo ocupa o topo inteiro.

```
┌─────────────────────────────────┐
│█ Entrada                    ✕ █│  faixa verde (ou beterraba em Saída)
│█ Aponte para o código de barras█│
├─────────────────────────────────┤
│                                 │
│        vídeo da câmera          │
│    ┌─                     ─┐    │
│    ───── linha vermelha ──────   │  mira com a linha do leitor do caixa;
│    └─                     ─┘    │  ao ler: bip, vibração e a linha pisca
│                                 │
├─────────────────────────────────┤
│ [Lanterna]      [Digitar código]│
├─────────────────────────────────┤
│ Leite condensado ........... +2 │  cupom: um item por linha
│ Arroz branco ............... +1 │
│ ═══════════════════════════════ │
│ 2 produtos                   +3 │  total
├─────────────────────────────────┤
│ [          Concluir           ] │  volta ao Armário
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
condensado agora tem 5" com **Desfazer**, e o leitor volta a ler.

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

Contagem física do armário. Serve para corrigir diferenças acumuladas.

```
┌─────────────────────────────────┐
│█ Inventário                 ✕ █│  faixa azul
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
│ Avisar com    [ 1 ] ou menos    │
│ Quantidade    [ − ] 5 [ + ]     │  ajuste manual
│ [          Salvar             ] │
├─────────────────────────────────┤
│ Histórico                       │
│ Entrada de 2       hoje 19:40   │
│ Saída de 1         ontem 12:10  │
│ Contagem +1        20/09        │
├─────────────────────────────────┤
│ Remover do armário              │  pede confirmação
└─────────────────────────────────┘
```

## 6. Dados `#/dados`

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
