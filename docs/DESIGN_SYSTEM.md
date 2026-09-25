# Design system do KeepInventory404

Construído seguindo os princípios da skill
[frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
(Anthropic): partir do assunto real, escolher paleta e tipografia específicas
para ele, gastar a ousadia em um só lugar e manter o resto disciplinado.

## 1. Brief

- **Assunto:** o armário de comidas de uma casa. Latas, pacotes, caixas.
- **Quem usa:** as pessoas da casa, em pé na cozinha, com o celular em uma mão
  e a embalagem na outra.
- **Trabalho principal:** registrar entrada e saída em segundos e confiar no
  número que aparece.

## 2. Ideia central: a etiqueta de gôndola

O vocabulário visual vem da **etiqueta de prateleira do mercado**: um bloco de
cor com um número grande e condensado, o nome do produto ao lado em letra menor.
Todo item do armário é mostrado assim. É o elemento memorável do app.

A segunda regra é funcional: **cada modo tem uma cor e ela ocupa a tela
inteira** enquanto o modo está ativo. Quem está dando baixa vê a faixa
beterraba e não confunde com entrada. A cor é informação, não enfeite.

Todo o resto (fundo, listas, botões secundários) é quieto e neutro.

## 3. Cores

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--paper` | `#E9EDE8` | `#141A17` | Fundo. Cinza-sálvia de forro de prateleira, não creme |
| `--surface` | `#FFFFFF` | `#1D2521` | Linhas da lista, folhas |
| `--ink` | `#17201C` | `#E8EEEA` | Texto principal. Verde muito escuro, puxa o sálvia |
| `--ink-soft` | `#55615B` | `#9BA8A1` | Texto secundário |
| `--line` | `#CDD4CF` | `#2E3833` | Divisórias |
| `--entrada` | `#1D6B42` | `#46B57A` | Modo Entrada. Verde couve |
| `--saida` | `#9E1F4A` | `#E0628E` | Modo Saída. Beterraba |
| `--contagem` | `#2B45A8` | `#7E95F0` | Modo Inventário. Azul caneta de prancheta |
| `--acabando` | `#B8860B` | `#E0B43A` | Estoque baixo. Mostarda |

Texto sobre as cores de modo é sempre branco no tema claro e `--paper` no
escuro; todos os pares passam contraste AA para texto grande e botões.

Por que não as cores de sempre: evitamos o creme com terracota e o preto com
verde-ácido. Verde, beterraba e azul caneta vêm de dentro da cozinha e da
prancheta de contagem.

## 4. Tipografia

Uma família só: **Archivo** (Google Fonts, variável em peso e largura). A
diferença de papel vem da largura, não de outra fonte.

| Papel | Configuração | Onde |
| --- | --- | --- |
| Número de estoque | Archivo, largura 62, peso 800, 44 a 96 px, algarismos tabulares | Etiquetas, seletor de quantidade |
| Título de tela | Archivo, largura 75, peso 750, 30 px | "Armário", "Entrada" |
| Nome de produto | Archivo, largura 100, peso 600, 17 px | Listas, folhas |
| Texto | Archivo, largura 100, peso 400, 16 px, entrelinha 1.45 | Explicações, avisos |
| Detalhe | Archivo, largura 100, peso 400, 14 px, `--ink-soft` | Marca, tamanho, datas |

Regras:
- Tudo em caixa de frase. Nada de rótulos em caixa alta.
- Sem palavra destacada em cor dentro de título.
- Números sempre com `font-variant-numeric: tabular-nums` para não pular.

## 5. Espaço, forma e profundidade

- Grade de 4 px. Espaços usados: 4, 8, 12, 16, 24, 32, 48.
- Margem lateral: 16 px.
- **Raios com hierarquia:** etiqueta de quantidade 6 px (canto de etiqueta de
  papel), linhas da lista 0 (são uma prateleira contínua separada por fio),
  botões de modo 14 px, folha inferior 20 px só nos cantos de cima.
- Sombra só na folha inferior, que realmente flutua sobre o conteúdo.
- Alvos de toque com pelo menos 48 px; botões de modo com 64 px.

## 6. Componentes

| Componente | Descrição |
| --- | --- |
| **Etiqueta** (`.tag`) | Bloco com o número condensado. Fundo `--ink` normal, `--acabando` quando baixo, contorno tracejado quando zero |
| **Linha de produto** (`.row`) | Foto 44 px, nome, marca e tamanho, etiqueta à direita. Toque abre o produto |
| **Barra de modos** (`.modebar`) | Três botões fixos no rodapé: Entrada, Saída, Inventário, cada um na sua cor |
| **Faixa de modo** (`.band`) | Cabeçalho cheio na cor do modo, com título e botão Fechar |
| **Visor** (`.viewfinder`) | Vídeo da câmera com a janela de mira horizontal, do formato de um código de barras |
| **Folha** (`.sheet`) | Painel que sobe do rodapé com o produto e a ação. Fecha arrastando, no X ou tocando fora |
| **Seletor de quantidade** (`.stepper`) | Botões − e + de 56 px e o número grande no meio; tocar no número abre o teclado numérico |
| **Aviso** (`.toast`) | Faixa curta acima do rodapé confirmando a ação, com Desfazer por 5 s |
| **Filtro** (`.chip`) | Todos, Acabando, Zerados |
| **Estado vazio** | Frase que diz o próximo passo e um botão para dá-lo |

## 7. Movimento

- A folha sobe em 220 ms com desaceleração; é a resposta ao toque ou à leitura.
- Ao ler um código, a janela de mira pisca uma vez na cor do modo e o celular
  vibra 40 ms. É o único momento "de efeito".
- O número da etiqueta muda sem animação. Clareza antes de charme.
- `prefers-reduced-motion` remove todas as transições.

## 8. Escrita

- Verbos claros e iguais do começo ao fim: o botão **Dar baixa em 2** gera o
  aviso **Baixa de 2** e o histórico **Saída de 2**.
- Botões dizem o que acontece: "Adicionar 3", "Salvar contagem",
  "Aplicar contagem". Nunca "Enviar" ou "OK".
- Erros dizem o que houve e o que fazer: "Não encontramos esse código. Digite o
  nome do produto para cadastrar."
- Estado vazio convida a agir: "Seu armário ainda está vazio. Toque em Entrada e
  aponte a câmera para o código de barras."

## 9. Qualidade mínima

- Funciona de 320 px de largura para cima, sem rolagem lateral.
- Foco de teclado visível (contorno de 3 px na cor do modo ou `--ink`).
- Tema claro e escuro seguindo o sistema.
- Área segura do iPhone respeitada (`env(safe-area-inset-bottom)`).
