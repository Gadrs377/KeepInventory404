# Design system do KeepInventory404

Versão 3.1: cupom impresso, modo rápido, ambientes, validade e compras,
revisados de novo com liquid-glass e better-interface (seção 11).

Versão 3: revisão com as skills better-* e make-interfaces-feel-better, e
material liquid glass. O relatório completo, com medições, está em
[REVISAO_INTERFACE.md](REVISAO_INTERFACE.md).

Versão 2. A versão 1 foi auditada com a skill
[no-ai-slop](../.claude/skills/no-ai-slop/SKILL.md)
([unslop-ui-skill](https://github.com/claudiusararu/unslop-ui-skill), MIT,
catálogo completo em `.claude/skills/no-ai-slop/TELLS.md`) e tinha vários sinais
de interface gerada por IA. A seção 10 lista cada um e o que mudou.

Também seguimos a skill
[frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
da Anthropic: partir do assunto real e gastar a ousadia em um lugar só.

## 1. Brief

- **Assunto:** o armário de comidas de uma casa. Latas, pacotes, caixas.
- **Quem usa:** as pessoas da casa, em pé na cozinha, com o celular em uma mão
  e a embalagem na outra, olhando de relance.
- **Trabalho principal:** registrar entrada e saída em segundos e confiar no
  número que aparece.

## 2. Direção: o caixa do mercado

O app pega emprestado o vocabulário do **caixa de supermercado**, que todo mundo
já conhece:

1. **O bip.** Toda leitura de código toca o bip curto do leitor do caixa. É a
   confirmação principal, antes de qualquer coisa visual.
2. **A etiqueta de gôndola.** A quantidade de cada item aparece como o preço na
   etiqueta da prateleira: número condensado, grande, num bloco retangular.
3. **O cupom.** O que foi lido na sessão aparece como um cupom fiscal: uma linha
   por item com pontilhado até a quantidade, e um total embaixo de um traço
   duplo.

A cor do modo continua sendo informação: a faixa do topo mostra em que modo você
está. Fora disso a interface é branca, preta e com fios finos.

## 3. Cores

Uma base neutra quase sem cor, e cor só onde ela significa algo.

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--paper` | `#FFFFFF` | `#161817` | Fundo. Branco limpo, sem creme nem sálvia |
| `--shelf` | `#F2F3F1` | `#1F2220` | Fundo de campos e da área da câmera |
| `--ink` | `#161817` | `#F1F2F0` | Texto, inclusive o de corpo |
| `--ink-2` | `#3F4541` | `#BFC5C1` | Só metadados (marca, tamanho, datas). Contraste AA |
| `--line` | `#D5D9D6` | `#343936` | Fios de 1 px que separam tudo |
| `--entrada` | `#17693F` | `#5CC48A` | Modo Entrada |
| `--saida` | `#8E1B5C` | `#E58CC0` | Modo Saída (beterraba, matiz 326°) |
| `--contagem` | `#1F3F9E` | `#8FA5F5` | Modo Inventário |
| `--acabando` | `#F2C230` | `#F2C230` | Etiqueta de estoque baixo (amarelo de etiqueta de oferta) |
| `--danger` | `#B42318` | `#FF8A7A` | Só ações destrutivas e erros (matiz 4°, 38° longe da Saída) |
| `--ink-disabled` | `#A3AAA6` | `#5E6561` | Ícones e trilhos desabilitados |
| `--tarja-vermelha` | `#C8102E` | `#FF6B7D` | Só a faixa da tarja nos dados do remédio. A tarja preta é preta com contorno; sem tarja, tracejado. O texto sempre diz a tarja |

Regras:
- Texto de corpo e mensagens sempre em `--ink`. `--ink-2` só para metadados.
- Estado de estoque nunca só pela cor: a linha escreve **Acabando** ou
  **Zerado** junto da etiqueta.
- Anel de foco em `--ink`; sobre fundos na cor do modo, em `--on-mode`
  (medido 6,71 a 9,28:1).
- Nenhum degradê, nenhum vidro fosco, nenhuma sombra difusa em cartões.
- Na tela inicial, só Entrada e Saída levam cor. O inventário é uma ação de
  segunda ordem e fica em preto.

## 4. Tipografia

Duas famílias com papéis bem diferentes:

| Papel | Fonte | Onde |
| --- | --- | --- |
| Títulos, nomes e números | **Urbanist**, 700 a 800 | Títulos de tela, nomes de produto, etiquetas, seletor de quantidade, totais do cupom |
| Texto e interface | **Schibsted Grotesk**, 400 a 700 | Descrições, botões, mensagens, campos, textos longos |

Versão 3.6: escolhidas pelo casal entre seis opções (ver `docs/fontes-opcoes.png`).
A Urbanist é geométrica e redonda, com charme sem ser a fonte padrão de todo app;
os algarismos têm largura igual, então as etiquetas não "dançam". A Schibsted
Grotesk vem de jornal: firme e confortável em frase longa. Substituem a Archivo
e a Atkinson Hyperlegible Next.

Escala: título 34 px, nome de produto 18 px, texto 17 px, metadados 15 px,
etiqueta 34 px (lista) a 64 px (produto), seletor 96 px. Peso de texto 400,
nomes e botões 700. Caixa de frase em tudo. Números com `tabular-nums`.

## 5. Forma e material

### Raios (concêntricos: interno = externo menos o espaço entre eles)

| Token | Valor | Onde |
| --- | --- | --- |
| `--r-sheet` | 28 px | Folha inferior (cantos de cima) |
| `--r-bar` | 26 px | Barras flutuantes (8 px de espaço interno) |
| `--r-in-bar` | 18 px | Botões dentro das barras (26 − 8) |
| `--r-control` | 14 px | Botões, campos, seletor |
| `--r-media` | 20 px | Visor da câmera |
| `--r-thumb` | 10 px | Foto do produto na lista (12 e 16 px nos tamanhos maiores) |
| `--r-tag` | 8 px | Etiqueta de gôndola (12 px na grande) |
| pílula | 999 px | Só o grupo de controles sobre a câmera |

### Material (liquid glass)

Vidro só na camada que flutua sobre conteúdo que se move. Mapa completo em
[REVISAO_INTERFACE.md](REVISAO_INTERFACE.md#mapa-de-camadas).

| Nível | Claro | Escuro | Desfoque | Uso |
| --- | --- | --- | --- | --- |
| Regular | branco 72% | `#161817` 78% | 24 px, saturação 140% | Barras flutuantes de rodapé |
| Grosso | branco 88% | `#161817` 90% | 28 px | Folha inferior, busca e filtros do Armário |
| Mídia | `#161817` 66% | igual | 16 px | Controles sobre a câmera |
| Estático | igual ao regular | igual | nenhum | Onde medimos que nada passa por baixo |

Cada superfície de vidro tem borda de 1 px em 10%, brilho de 1 px no topo e
sombra suave. A versão sólida é desenhada primeiro; o vidro entra por
`@supports`. Com reduzir transparência, mais contraste ou cores forçadas, tudo
fica sólido. No máximo 2 camadas de vidro por tela no celular.

### Outros

- **Fios para estrutura.** Listas são uma prateleira contínua com fio de 1 px
  entre os itens.
- Grade de 4 px. Margem lateral de 16 px. Alvos de toque de 44 px no mínimo;
  botões de modo com 64 px.
- Toque: `scale: 0.96` em 150 ms, curva `cubic-bezier(0.2, 0, 0, 1)`.
- Fotos com contorno de 1 px `oklch(0 0 0 / 0.1)` (branco a 10% no escuro).

## 6. Componentes

| Componente | Descrição |
| --- | --- |
| **Etiqueta** (`.tag`) | Bloco com número condensado. Preto normal, amarelo quando acabando, tracejado quando zero, azul quando contado |
| **Linha de produto** (`.row`) | Foto da embalagem 48 px (ou ícone de pacote), nome, metadados, etiqueta à direita |
| **Barra de modos** (`.modebar`) | Barra de vidro flutuante com Entrada e Saída, lado a lado, tingidas a 90%. A contagem fica no topo da tela, no botão "Contar" |
| **Barra flutuante** (`.floating-bar`) | Rodapé de ação de cada tela, em vidro, afastado 12 px das bordas |
| **Faixa de modo** (`.band`) | Cabeçalho cheio na cor do modo, título condensado e botão Fechar |
| **Visor** (`.viewfinder`) | Câmera com a mira no formato de um código de barras e uma linha de leitura vermelha, como a do leitor do caixa. Lanterna e Digitar código ficam num grupo de vidro escuro por cima da imagem |
| **Cupom** (`.receipt`) | Lista da sessão: nome, pontilhado, quantidade; total sob traço duplo |
| **Folha** (`.sheet`) | Painel que sobe do rodapé com o produto e a ação |
| **Escolha de produto** (`.pick`) | Lista dentro da folha quando um código tem mais de um produto |
| **Seletor de quantidade** (`.stepper`) | − e + de 64 px e o número de 96 px no meio; tocar no número abre o teclado |
| **Filtros** (`.tabs`) | Todos, Acabando, Zerados: botões com `aria-pressed`, sublinhado no ativo |
| **Cupom impresso** (`.ticket`) | Fica numa folha sólida (`.sheet-solid`): o vidro mostrava a câmera borrada atrás do papel. Pontilhado e valor acompanham a última linha do nome (`align-items: last baseline`). Papel sempre claro (também no tema escuro) que desce da boca da impressora (`.printer-slot`) com a borda de baixo rasgada em dentes de 12 px (máscara `conic-gradient`). Título do modo em caixa alta, linhas com pontilhado, total sob traço duplo e um código de barras decorativo. É conteúdo, não vidro |
| **Interruptor na faixa** (`.band-switch`) | Modo rápido. Sobre a cor do modo: trilho claro translúcido; ligado, trilho cheio e bolinha na cor do modo |
| **Para resolver** (`.pending`) | Caixa com contorno tracejado, a mesma linguagem da etiqueta zerada: algo que ainda falta |
| **Abas de ambiente** (`.tabs`) | Tudo, Cozinha, Limpeza, Beleza. Sublinhado no ativo. Em 320 px diminuem para caber inteiras |
| **Filtros de estado** (`.chip`) | Acabando, Zerados, Vencendo, com contagem. Só aparecem quando têm algo. Marcador quadrado na linguagem da etiqueta (amarelo, tracejado, calendário). Pressionado fica preto |
| **Seletor segmentado** (`.segmented`) | Onde fica: três rádios nativos num trilho de 4 px; o escolhido fica preto. Raio interno 10 = 14 − 4 |
| **Validade** (`.lot`) | Data em Urbanist; amarela quando vence em até 7 dias, como a etiqueta de acabando |
| **Lista de compras** (`.shop-item`) | Caixa de marcar de 28 px dentro de uma linha inteira tocável, nome completo, quantidade sugerida condensada à direita. Marcado fica riscado |
| **Fatos do remédio** (`.facts`) | Lista `dl`: rótulo de 13 px em `--ink-2`, valor de 17 px, fio entre as linhas. A venda leva uma faixa de 22 × 10 px na cor da tarja |
| **Aviso** (`.toast`) | Bloco sólido na cor do modo (ou preto), acima da barra flutuante. Com **Desfazer**, fica até ser fechado, trocado ou até mudar de tela; sem ação, some em 4 s. Fica atrás das folhas |

Ícones: [Phosphor](https://phosphoricons.com), peso bold, MIT. Nunca desenhados à mão.

## 7. Som e movimento

- **Bip de leitura:** onda quadrada suavizada em 2.700 Hz por 110 ms, como o
  leitor do caixa. Toca quando a câmera reconhece um código.
- **Bip de erro:** dois tons graves curtos, quando o código lido não pode ser
  usado (por exemplo, saída de um produto que não está no armário).
- O som pode ser desligado em Dados. No iPhone, a chave de silencioso também
  silencia o bip.
- Ao ler, a linha de leitura do visor pisca e o celular vibra 40 ms.
- A folha sobe em 200 ms.
- O cupom desce da impressora uma vez, em 0,6 a 1,7 s conforme o número de
  linhas, com `cubic-bezier(0.22, 1, 0.36, 1)` e 200 ms de espera para a folha
  chegar antes. O celular vibra de leve três vezes, como o papel saindo.
- A dica "Não está lendo?" aparece com 240 ms de opacidade e 6 px de descida.
- **Troca de tela (View Transitions), como no iPhone.** As capturas das
  telas têm fundo `--paper`; sem ele a tela de cima fica transparente e as
  duas se misturam.
  - Detalhe (empurrar): a nova entra pela direita com sombra na borda; a de
    trás anda 30% para a esquerda e escurece (brilho 0,82). Voltar é o
    inverso. Mola, 520 ms. Foto, nome e etiqueta voam entre a linha e o topo
    do produto.
  - Leitor (modal): sobe de baixo com os cantos de cima arredondados; a de
    trás recua para 94% e escurece sobre fundo preto.
  - Abas: a antiga esmaece em 140 ms e a nova aparece em 260 ms subindo 6 px,
    enquanto a pílula da barra desliza.
  - A faixa do leitor troca de cor (Entrada ↔ Saída) em 360 ms.
- `prefers-reduced-motion` remove todas as transições.

## 8. Escrita

- Verbos claros e iguais do começo ao fim: o botão **Dar baixa em 2** gera o
  aviso **Baixa de 2** e o histórico **Saída de 2**.
- Botões dizem o que acontece: "Adicionar 3", "Salvar contagem",
  "Aplicar contagem". Nunca "Enviar" ou "OK".
- Erros dizem o que houve e o que fazer.
- Sem travessão, sem reticências decorativas, sem adjetivos de propaganda.

## 9. Qualidade mínima

- Funciona de 320 px de largura para cima, sem rolagem lateral.
- Foco de teclado visível (contorno de 3 px em `--ink`).
- Tema claro e escuro seguindo o sistema.
- Área segura do iPhone respeitada.

## 10. Auditoria da versão 1 (no-ai-slop)

| Sinal encontrado | Correção na versão 2 |
| --- | --- |
| Fundo cinza-sálvia com texto verde-carvão (a combinação "sálvia + carvão" do catálogo) | Fundo branco limpo; neutros quase sem cor |
| Texto de corpo e estado vazio em cinza | Corpo sempre em `--ink`; cinza só em metadados |
| Ícones SVG desenhados à mão | Phosphor bold |
| Faixa colorida de um lado só no aviso, na folha e na nota de contagem | Removidas; aviso vira bloco sólido na cor do modo |
| Barra inferior com vidro fosco (`backdrop-filter`) | Barra sólida com fio no topo. **Na v3 o vidro voltou a pedido do dono**, agora só onde passa na regra da skill liquid-glass e com contraste medido |
| Filtros em pílula | Abas com sublinhado |
| Três botões iguais lado a lado para ações de peso diferente | Entrada e Saída grandes; inventário vira ação secundária |
| Raios variados e grandes (12 a 20 px) em tudo | Raio único de 4 px. **Na v3**, escala de raios concêntricos tokenizada (seção 5) |
| Inicial do nome num quadrado quando falta foto | Ícone de pacote |
| Mesma família no título e no corpo | Urbanist para títulos e números, Schibsted Grotesk para texto |
| Reticências tipográficas em textos | Texto direto |

## 11. Revisão da versão 3.1

**Liquid glass (mapa de camadas das telas novas).** O cupom é conteúdo: papel
sólido, sem vidro. A faixa de validade, os filtros e o Para resolver são
estrutura: fundos sólidos. A dica sobre a câmera fica sobre vídeo, mas é sólida
(86%) para não somar uma terceira camada com desfoque. Compras ganhou uma barra
flutuante de vidro regular porque a lista passa por baixo dela. Medido com o
Chromium, contando elementos com `backdrop-filter` na tela: Armário 2 (busca e
barra de modos), Leitor 1, Compras 1, Contagem 1, Produto 0, Dados 0; com uma
folha aberta, só a folha. Com cores forçadas e mais contraste, 0.

**Better-interface.** Achados e correções:

| Achado | Correção |
| --- | --- |
| Tirar foto e Restaurar backup não eram alcançáveis pelo teclado (campo de arquivo com `hidden`) | Campo escondido só visualmente (`.sr-only`); o botão mostra o anel de foco quando o campo tem foco |
| Em 320 px a aba Beleza ficava cortada na borda, sem sinal de que havia mais | Abas com 15 px e 12 px de espaço abaixo de 360 px; as quatro cabem |
| Nomes longos cortados na lista de compras, sem outro lugar para lê-los | Nome inteiro, quebrando linha |
| Com cores forçadas, o segmento escolhido, o filtro pressionado e a caixa marcada perdiam o preenchimento | `Highlight` e `HighlightText` nesses estados; a boca da impressora vira `CanvasText` |
| Botão "Ver" sem contexto no aviso de validade | "Ver o que vence" |
| Vários "Resolver" com o mesmo nome para leitor de tela | "Resolver o código 789…" |

Contraste medido na tela (fundo amostrado com o texto escondido), claro e escuro:

| Par | Claro | Escuro |
| --- | --- | --- |
| Aviso de validade | 15,46:1 | 8,32:1 |
| Filtro de estado | 17,84:1 | 15,89:1 |
| Aba inativa | 9,82:1 | 10,17:1 |
| Data amarela do lote | 10,65:1 | 10,65:1 |
| Texto do lote | 9,82:1 | 10,17:1 |
| Segmento inativo / escolhido | 8,54:1 / 17,84:1 | 8,57:1 / 15,89:1 |
| Modo rápido na faixa verde | 6,71:1 | 8,26:1 |


**Ajustes depois do uso (make-interfaces-feel-better e better-writing):** folha
do cupom sólida; valor na última linha do nome; papel mais largo em 320 px; raio
do Para resolver concêntrico com o botão (14 + 8); toque com escala 0,96 na dica
da câmera; validade aceita `10/2026`; textos "Revisar a lista com o Claude",
"Pedir receitas com o que vence", "Criar lembrete no calendário", "Acaba em
cerca de 5 dias" (em vez de "uns") e concordância de "A unidade sem data sai".

**Versão 3.2.** Componentes novos: botão "−" da linha (`.row-minus`, borda de 1 px,
raio 14, escala 0,96 ao tocar), seletor de modo na faixa (`.mode-switch`, trilho
on-mode a 18%, raio 18 com 4 px de espaço e itens de raio 14), lista agrupada
(`.group`, fundo `--shelf`, linhas de 56 px, ícone em quadrado de 32 px com raio
8). Vidro: folhas abertas nas telas com câmera ficam sólidas; as camadas de vidro
continuam no máximo 2 por tela (busca fixa e barra de modos no Armário).

## 12. Diretrizes da Apple (Human Interface Guidelines) aplicadas

Critério para qualquer tela nova ou mudança. Cada item diz a regra da Apple e
como ela vale aqui.

### Princípios

- **Hierarquia:** o conteúdo vem primeiro; a interface fica em volta dele.
  Aqui: a quantidade (etiqueta) é o que mais pesa na linha; botões e textos de
  apoio são leves.
- **Uma ação principal por tela ou folha**, em destaque (botão cheio na cor do
  modo). As outras são texto ou botões discretos ("Não é este?").
- **Sem texto de manual fixo na tela.** O controle se explica sozinho; se
  precisar de dica, ela aparece na hora e some (cápsula sobre a câmera).
- **Revelar aos poucos:** o raro fica atrás de um toque (Editar, menu de
  toque longo, "Marcar validade" fechado na entrada comum).
- **Retorno em toda ação:** bip, vibração, número que rola, aviso com
  Desfazer. Nada muda em silêncio.

### Navegação

- **Barra de abas** para as áreas do app (3 a 5; aqui 4). Não é lugar de
  filtro nem de tipo de produto: Remédios é ambiente do Armário, não aba.
- **Empurrar (push)** para ver detalhe (produto): entra pela direita, a tela
  de trás recua e escurece; voltar é o inverso.
- **Tela modal ou folha** para uma tarefa fechada (ler códigos, guardar,
  contar): sobe de baixo e tem fechar à esquerda.
- **Ação da tela no canto de cima**, ao lado do título grande (Nota fiscal no
  Armário, compartilhar em Compras, Editar no produto).
- **Título grande** que encolhe para a barra ao rolar.

### Layout

- Margem lateral de 16 px; espaços em múltiplos de 4 e 8.
- **Área de toque mínima de 44 × 44 px**, mesmo quando o desenho é menor.
- **Listas agrupadas (como os Ajustes):** título da seção fora do cartão,
  linhas dentro, nota de rodapé embaixo em 13 px.
- Informação técnica (código de barras, registro) vai para "Detalhes", no fim.
- Respeitar as áreas seguras (entalhe, Dynamic Island, barra de gestos).

### Tipografia (escala do iOS)

| Uso | Tamanho |
| --- | --- |
| Título grande | 34 |
| Título de seção | 20 a 22 |
| Corpo, nome na linha | 17 |
| Secundário (marca, tamanho) | 15 |
| Nota, legenda | 13 |
| Rótulo da barra de abas | 10 a 11 |

### Cor e material

- **Cor com significado:** verde é Entrada, beterraba é Saída, azul é
  Contagem, amarelo é "acabando". Cor nunca é o único sinal: sempre há texto.
- Botão de texto na cor do modo (como a cor de destaque do iOS), sem
  sublinhado.
- Modo escuro com as mesmas regras; contraste AA.
- Vidro (liquid glass) só na camada de navegação que flutua (barra de abas,
  barra do leitor), nunca no conteúdo.

### Ícones

- Ícone só quando é universal (lupa, lanterna, câmera, QR Code, lixeira).
  Quando nenhum desenho diz a ação, **texto** ("Produto sem código de barras",
  "Nota fiscal").

### Movimento

- Toda troca de tela mostra de onde veio e para onde vai (empurrar, subir,
  esmaecer), com molas e interrompível.
- O mesmo objeto voa entre telas (foto, nome e etiqueta da linha para o
  produto).
- Movimento curto: 150 a 520 ms. Com "reduzir movimento" ligado, nada anima.

### Escrita

- Frases curtas, na voz de quem usa ("Guardar", "Tirar"), sem jargão.
- Botões começam com verbo. Erros dizem o que fazer.

