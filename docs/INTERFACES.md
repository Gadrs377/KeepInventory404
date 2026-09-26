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

