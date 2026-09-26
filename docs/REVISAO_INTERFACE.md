# Revisão de interface (better-interface)

Revisão feita com as skills de [jakubkrehel/skills](https://github.com/jakubkrehel/skills)
(`better-interface`, que orquestra `better-accessibility`, `better-layout`,
`better-writing`, `better-typography`, `better-colors` e `better-ui`) e
[make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better),
todas instaladas em `.claude/skills/`. Em seguida o material foi refeito com a
skill [liquid-glass](https://github.com/Armitanemati/liquid-glass-claude-skill)
(seção final).

## Escopo e cobertura

- **Escopo:** o app inteiro no commit `2856904` (as linhas citadas abaixo se
  referem a ele): `index.html`, `css/app.css`, `js/ui.js`, `js/views/*.js`.
  Telas Armário, Entrada, Saída, Contagem, Revisão, Produto, Dados e as folhas
  (produto, "Qual destes?", digitar código, confirmação), incluindo estados
  vazio, carregando, erro e 320 px.
- **Stack:** HTML, CSS puro com tokens em `:root`, módulos ES sem framework.
- **Documentos do projeto lidos:** `docs/DESIGN_SYSTEM.md`,
  `docs/INTERFACES.md`, `docs/SYSTEM_DESIGN.md`. Não há `CONTRIBUTING.md`,
  `AGENTS.md` nem `CLAUDE.md`.

| Domínio | Evidência inspecionada | Resultado |
| --- | --- | --- |
| Acessibilidade | Nomes acessíveis, foco, teclado na folha, região viva, formulários, cor como único sinal, 320 px | 6 achados |
| Layout | Agrupamento, bordas, recuos, truncamento em textos longos, 320 px e 200% | Coberto pelos achados de tipografia (truncamento) |
| Escrita | Rótulos de botão, vocabulário do fluxo de contagem, estados vazios, erros | 3 achados |
| Tipografia | Escala, entrelinha, quebra de linha, truncamento, suavização | 2 achados |
| Cores | Contraste medido de todos os pares (claro e escuro), papéis dos tokens, matiz de perigo | 2 achados |
| UI | Raios concêntricos, retorno ao toque, contorno de imagem, estados de ícone, saída de animação | 2 achados |

## Achados

| Severidade | Domínio | Local | Antes | Depois | Por quê |
| --- | --- | --- | --- | --- | --- |
| HIGH | accessibility | `js/views/armario.js:88`, `js/views/productSheet.js` (lista "Qual destes?") | "Acabando" só aparece quando o produto não tem marca/tamanho; senão o estado fica só na cor amarela da etiqueta | `stockNote()` escreve **Acabando** ou **Zerado** em todas as linhas, na folha de escolha e na página do produto; a etiqueta ganhou texto oculto "No armário:" | Estado comunicado só por cor (gatilho de severidade alta) |
| HIGH | accessibility | `css/app.css:84` | `outline: 3px solid var(--ink)` também sobre as faixas coloridas: 2,66:1 (Entrada), 2,34:1 (Saída), 1,92:1 (Contagem) | `--focus: var(--on-mode)` dentro de `.band`, botões de modo e aviso colorido: 6,71 a 9,28:1 | Indicador de foco precisa de 3:1 contra a cor vizinha |
| HIGH | typography | `css/app.css:328`, `css/app.css:348`, lista "Qual destes?" | Nome no cupom e na revisão cortado com reticências, sem outro jeito de ler | Quebra de linha (`overflow-wrap: anywhere`) no cupom, na revisão e na escolha de produto | Conteúdo truncado sem acesso ao valor completo |
| HIGH | colors | `css/app.css:169`, `css/app.css:170`, `css/app.css:403` | Botão de remover, de restaurar backup e mensagens de erro usavam `--saida` (matiz 343°), a mesma cor do modo Saída | Token `--danger` #B42318 (matiz 4°) só para ações destrutivas e erros; Saída foi para #8E1B5C (326°), 38° de distância | Cor de perigo aplicada a uma ação que não é destrutiva, e vice-versa |
| MEDIUM | accessibility | `js/ui.js:79` a `js/ui.js:113` | Folha modal não movia o foco, o fundo continuava navegável e o foco não voltava ao fechar | `#app.inert` enquanto a folha está aberta, foco entra na folha, volta para o botão que a abriu | Modais precisam prender e devolver o foco |
| MEDIUM | accessibility | `js/ui.js:61`, `index.html:26` | Aviso com **Desfazer** sumia em 5 s; região viva era escondida com `hidden` e reescrita | Aviso com ação fica até ser fechado (botão "Fechar aviso"), substituído ou até trocar de tela; anúncio vai por `#toast-live`, sempre no DOM | Aviso com ação não pode sumir sozinho; região viva precisa ser estável |
| MEDIUM | accessibility | `js/views/armario.js:27`, `js/views/armario.js:60` | `role="tablist"`/`role="tab"` sem painéis nem setas | Botões nativos com `aria-pressed` num `role="group"` | ARIA errado é pior que nenhum |
| MEDIUM | accessibility | `js/views/productSheet.js:217`, `js/views/camera.js` (digitar código) | Botão desabilitado até digitar o nome; erro do código sem ligação com o campo | Botão sempre habilitado; no envio, `aria-invalid`, `aria-describedby` apontando para o erro e foco no campo | Validar no envio e anunciar o erro junto do campo |
| MEDIUM | writing | `js/views/inventario.js:15` | Botão "Contar" leva a uma tela "Inventário" com botões "Salvar contagem" | Tela se chama **Contagem**, igual aos botões e avisos | Um vocabulário por fluxo |
| MEDIUM | ui | `js/views/camera.js:27` | Lanterna ligada só mudava `aria-pressed`; nada mudava na tela | Ligada = botão preenchido | Estado precisa de sinal visual |
| MEDIUM | writing | `js/views/armario.js:93` | "Nenhum produto neste filtro." e busca vazia sem saída | Diz o que foi buscado e oferece **Limpar busca** ou **Mostrar todos** | Estado vazio aponta o próximo passo |
| MEDIUM | writing | `js/views/productSheet.js:102`, `js/views/produto.js:103`, `js/views/dados.js:93` | "Outro produto com este código", confirmação "Remover", "Restaurar" | "Cadastrar outro produto com este código", "Remover produto", "Restaurar backup" | Botão começa com verbo e repete a consequência |
| MEDIUM | colors | `css/app.css:190`, `css/app.css:435` | Contorno do "zerado" em `--line` (1,43:1); `--line` (separador) usado como cor de ícone desabilitado | Contorno tracejado em `--ink-2` (9,82:1); token novo `--ink-disabled` | Contorno informativo precisa de 3:1; token só no seu papel |
| LOW | ui | `css/app.css:158`, `css/app.css:254` | Toque escurecia o botão (`brightness`); fotos sem contorno | `scale: 0.96` com transição de 150 ms em botões; contorno de 1 px `oklch(0 0 0 / 0.1)` (branco no escuro) nas fotos | Retorno tátil e profundidade consistente nas imagens |
| LOW | typography | `css/app.css:71`, `css/app.css:94` | Sem `text-wrap` em títulos e descrições; suavização só para WebKit | `balance` em títulos, `pretty` em textos; `-moz-osx-font-smoothing: grayscale` | Quebras equilibradas e renderização consistente |

Fora do limite de 15: dois mecanismos de tema escuro (`prefers-color-scheme` e
`[data-theme]`) no mesmo CSS; resolvido junto, ficou só a media query.

## Verificação

Todas no Chromium, tela de Pixel 7, depois das correções:

| Verificação | Resultado |
| --- | --- |
| Fluxo completo (migração v1, entrada, outro produto no mesmo código, escolha, saída, contagem, revisão) | Passou, quantidades corretas, sem erros |
| Contraste de todos os pares de cor, claro e escuro | Texto de 4,93:1 a 17,84:1; contornos e foco de 6,71:1 a 9,82:1 |
| Contraste medido sobre o vidro (texto escondido, fundo amostrado no centro de cada texto, lista rolando por baixo) | Claro 5,35 a 17,84:1; escuro 6,23 a 15,77:1 |
| Teclado: abrir folha com Enter, 6 Tabs, Esc | Foco entrou na folha, não escapou, voltou para "Digitar código" |
| Nome vazio no cadastro | Botão habilitado, erro "Digite o nome do produto para cadastrar.", `aria-invalid`, foco no campo |
| Nome longo no cupom | Aparece inteiro, em duas linhas |
| 320 px e zoom de 200% (195 px) em Armário, Entrada, Contagem e Dados | Sem rolagem lateral |
| Filtros | `aria-pressed` correto; "Limpar busca" funciona |
| **Não verificado** | Leitor de tela real (VoiceOver/TalkBack) e renderização no Safari do iPhone |

## Veredito

**Approve.** Os quatro achados HIGH foram corrigidos e verificados; não há
achados pendentes.

---

# Liquid glass

Aplicado com a skill liquid-glass, em modo autônomo (o dono pediu para aplicar
direto). A proposta que a skill exige antes do código está aqui.

## Mapa de camadas

| Elemento | Camada | Vidro | Nível | Por quê |
| --- | --- | --- | --- | --- |
| Lista do Armário, cupom, listas da contagem, revisão | Conteúdo | Não | Nenhum | É o que a pessoa veio ver |
| Faixa do modo (Entrada/Saída/Contagem) | Estrutura | Não | Nenhum | Não flutua; a cor sólida é informação |
| Busca e filtros do Armário | Controle flutuante | Sim | Grosso (88%/90%) | Fica preso no topo enquanto a lista passa por baixo; texto denso, por isso o nível mais opaco |
| Barra de Entrada e Saída | Controle flutuante | Sim | Regular (72%/78%) | Flutua sobre a lista; botões tingidos a 90% dentro dela |
| Barra de ação da Contagem e da Revisão | Controle flutuante | Sim | Regular | Listas longas passam por baixo |
| Barra "Concluir" da Entrada e Saída | Controle flutuante | Estático | Regular sem desfoque | Medido: menos de 1% dos pixels mudam com desfoque, porque quase nada passa por baixo |
| Lanterna e Digitar código | Controle sobre mídia | Sim | Escuro 66% | Ficam sobre a imagem da câmera, que se move o tempo todo |
| Folha inferior | Controle temporário | Sim | Grosso + véu 38% | Contextual, sobre a tela; texto denso |
| Aviso | Controle temporário | Não | Sólido | A skill permite sólido; aviso colorido informa o modo |
| Campos, cartões, páginas | Conteúdo/estrutura | Não | Nenhum | Anti-padrão da skill |

## Orçamento e alternativas

- No máximo **2 camadas** com `backdrop-filter` por tela no celular (medido:
  Armário 2, Entrada 1, Entrada com folha 1). Com a folha aberta, o que fica
  atrás do véu perde o desfoque.
- Sem suporte a `backdrop-filter`: versão sólida desenhada primeiro.
- `prefers-reduced-transparency`, `prefers-contrast: more` e
  `forced-colors`: vidro vira superfície sólida (medido: 0 camadas).
- Raios concêntricos: barras 26 px com 8 px de espaço, botões internos 18 px;
  folha 28 px; controles 14 px; aviso 22 px com botões de 14 px.

## Limites honestos

- O desfoque é uma aproximação do material nativo da Apple: sem refração nem
  brilho que muda com o movimento. Isso é intencional (a skill recomenda não
  depender disso na web).
- No Safari do iPhone o desfoque funciona (`-webkit-backdrop-filter`); não foi
  testado num aparelho real.
- A skill no-ai-slop lista "glassmorphism por padrão" como sinal de IA. Aqui o
  vidro foi pedido pelo dono e só entra onde passa na pergunta da skill de
  liquid glass ("que função esse material comunica?").
