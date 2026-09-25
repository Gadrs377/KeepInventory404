# Design system do KeepInventory404

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
| `--saida` | `#A3173F` | `#F07A9C` | Modo Saída |
| `--contagem` | `#1F3F9E` | `#8FA5F5` | Modo Inventário |
| `--acabando` | `#F2C230` | `#F2C230` | Etiqueta de estoque baixo (amarelo de etiqueta de oferta) |

Regras:
- Texto de corpo e mensagens sempre em `--ink`. `--ink-2` só para metadados.
- Nenhum degradê, nenhum vidro fosco, nenhuma sombra difusa em cartões.
- Na tela inicial, só Entrada e Saída levam cor. O inventário é uma ação de
  segunda ordem e fica em preto.

## 4. Tipografia

Duas famílias com papéis bem diferentes:

| Papel | Fonte | Onde |
| --- | --- | --- |
| Números e títulos | **Archivo**, largura 62 a 75, peso 800 | Etiquetas, seletor de quantidade, títulos de tela, totais do cupom |
| Texto e interface | **Atkinson Hyperlegible Next**, 400 e 700 | Nomes de produto, botões, mensagens, campos |

A Atkinson foi desenhada pelo Braille Institute para ser lida de relance, com
letras que não se confundem (1, l e I; 0 e O). É exatamente a situação de quem
lê um nome de produto em pé na cozinha.

Escala: título 34 px, nome de produto 18 px, texto 17 px, metadados 15 px,
etiqueta 34 px (lista) a 64 px (produto), seletor 96 px. Peso de texto 400,
nomes e botões 700. Caixa de frase em tudo. Números com `tabular-nums`.

## 5. Forma

- **Raio único de 4 px** para botões, campos, etiquetas e visor. A folha
  inferior tem 10 px só nos cantos de cima. Nada em formato de pílula.
- **Fios em vez de sombras.** Listas são uma prateleira contínua com fio de
  1 px entre os itens. A única sombra é a da folha, que realmente flutua.
- Grade de 4 px. Margem lateral de 16 px. Alvos de toque de 48 px no mínimo;
  botões de modo com 72 px.

## 6. Componentes

| Componente | Descrição |
| --- | --- |
| **Etiqueta** (`.tag`) | Bloco com número condensado. Preto normal, amarelo quando acabando, tracejado quando zero, azul quando contado |
| **Linha de produto** (`.row`) | Foto da embalagem 48 px (ou ícone de pacote), nome, metadados, etiqueta à direita |
| **Barra de modos** (`.modebar`) | Rodapé com Entrada e Saída grandes, lado a lado. Inventário fica no topo da tela, como botão de texto "Contar" |
| **Faixa de modo** (`.band`) | Cabeçalho cheio na cor do modo, título condensado e botão Fechar |
| **Visor** (`.viewfinder`) | Câmera com a mira no formato de um código de barras e uma linha de leitura vermelha, como a do leitor do caixa |
| **Cupom** (`.receipt`) | Lista da sessão: nome, pontilhado, quantidade; total sob traço duplo |
| **Folha** (`.sheet`) | Painel que sobe do rodapé com o produto e a ação |
| **Escolha de produto** (`.pick`) | Lista dentro da folha quando um código tem mais de um produto |
| **Seletor de quantidade** (`.stepper`) | − e + de 64 px e o número de 96 px no meio; tocar no número abre o teclado |
| **Abas de filtro** (`.tabs`) | Todos, Acabando, Zerados, com sublinhado no ativo |
| **Aviso** (`.toast`) | Bloco sólido na cor do modo (ou preto), com Desfazer |

Ícones: [Phosphor](https://phosphoricons.com), peso bold, MIT. Nunca desenhados à mão.

## 7. Som e movimento

- **Bip de leitura:** onda quadrada suavizada em 2.700 Hz por 110 ms, como o
  leitor do caixa. Toca quando a câmera reconhece um código.
- **Bip de erro:** dois tons graves curtos, quando o código lido não pode ser
  usado (por exemplo, saída de um produto que não está no armário).
- O som pode ser desligado em Dados. No iPhone, a chave de silencioso também
  silencia o bip.
- Ao ler, a linha de leitura do visor pisca e o celular vibra 40 ms.
- A folha sobe em 200 ms. Nenhuma outra animação.
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
| Barra inferior com vidro fosco (`backdrop-filter`) | Barra sólida com fio no topo |
| Filtros em pílula | Abas com sublinhado |
| Três botões iguais lado a lado para ações de peso diferente | Entrada e Saída grandes; inventário vira ação secundária |
| Raios variados e grandes (12 a 20 px) em tudo | Raio único de 4 px |
| Inicial do nome num quadrado quando falta foto | Ícone de pacote |
| Mesma família no título e no corpo | Archivo para números e títulos, Atkinson para texto |
| Reticências tipográficas em textos | Texto direto |
