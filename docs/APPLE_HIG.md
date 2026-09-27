# Guia Apple (Human Interface Guidelines) para o KeepInventory404

Regras tiradas das Human Interface Guidelines oficiais da Apple (páginas
consultadas em 09/2026, já com o Liquid Glass do iOS 26), filtradas para o
que um app de iPhone como este usa. Cada seção diz a regra, os números quando
existem, e como ela vale aqui. A seção final é a auditoria do app.

Fonte: <https://developer.apple.com/design/human-interface-guidelines/>. As
páginas usadas estão nos links de cada seção.

## 1. Fundamentos do iPhone ([Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios))

- Poucos controles na tela; o secundário fica a um toque de distância.
- Adaptar-se a Modo Escuro, texto maior (Dynamic Type) e orientação.
- O polegar alcança melhor o meio e a parte de baixo da tela: ações frequentes
  embaixo, e deixar **voltar arrastando** e **agir arrastando a linha**.
- Usar o que o aparelho já sabe (câmera, localização) em vez de pedir digitação.

## 2. Navegação

### Barra de abas ([Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars))

- Serve para **navegar entre áreas**, não para ações. Ação na tela é barra de
  ferramentas.
- **Fica visível ao entrar num detalhe** da área; só some por baixo de uma tela
  modal (temporária). Esconder faz a pessoa esquecer onde está.
- Poucas abas; nada de aba "Mais" automática por falta de espaço.
- Nunca desabilitar nem esconder uma aba; se está vazia, explicar por quê.
- Rótulo de uma palavra sob o ícone; ícone cheio na aba ativa.
- Selo (badge): oval vermelho com número branco, **só para o que é crítico**.
- No iOS 26 a barra flutua em Liquid Glass sobre o conteúdo; pode ter uma aba
  de busca no fim.

### Barra de ferramentas e navegação ([Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars))

- Título curto (até ~15 caracteres), nunca o nome do app.
- **Título grande** que vira título pequeno ao rolar.
- Voltar e Fechar com os símbolos padrão, sem escrever "Voltar"/"Fechar".
- Preferir símbolos sem moldura; texto só quando nenhum símbolo diz a ação
  (ex.: "Editar").
- Uma ação principal, destacada, no lado direito. No máximo 3 grupos.
- Botões de texto separados de botões de ícone (juntos parecem um só).

### Modalidade e folhas ([Modality](https://developer.apple.com/design/human-interface-guidelines/modality), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets))

- Modal só quando ajuda a focar; tarefa curta e simples; sem "app dentro do app".
- Tela cheia modal para câmera e tarefas de vários passos.
- **Uma folha por vez**: fechar a primeira antes de abrir outra.
- Título que diz a tarefa. Cancelar/fechar à esquerda; Concluir à direita.
- Folha redimensionável tem a alça (grabber) e fecha arrastando para baixo;
  se houver algo não salvo, confirmar antes.
- Altura média (meia tela) para mostrar o mais relevante primeiro.

### Menus de contexto ([Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus))

- Só os comandos mais prováveis; poucos itens; até 3 grupos.
- **Tudo que está no menu também existe na interface principal.**
- Esconder (não apagar) o que não se aplica. Apagar/remover no fim, em vermelho.
- Usar em todo lugar parecido, ou em nenhum.

## 3. Layout ([Layout](https://developer.apple.com/design/human-interface-guidelines/layout))

- Mais importante em cima e à esquerda; alinhar para escanear; recuo mostra
  subordinação; agrupar com espaço, contêiner ou fio.
- Revelar aos poucos (menus, telas de detalhe).
- Controles separados do conteúdo pela camada de vidro e pelo efeito de borda
  de rolagem, não por fundo sólido.
- Respeitar áreas seguras; testar no menor e no maior tamanho de tela e de texto.

## 4. Listas ([Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables))

- Texto curto nas linhas; o resto vai para o detalhe.
- Estilo agrupado: cabeçalhos, rodapés e espaço separando grupos.
- Seta (›) quando a linha abre outra tela; botão de informação só para mais
  detalhes, não para navegar.
- Retorno ao tocar: destaque breve e a mudança (ex.: marca de seleção).

## 5. Botões ([Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons))

- Área de toque de **44 × 44 pt** (mínimo absoluto 28 × 28), com uns 12 pt de
  folga entre botões com fundo e 24 pt entre os sem fundo.
- **Todo botão tem estado pressionado.**
- **Um ou dois botões de destaque por tela**; diferenciar por estilo, não por
  tamanho.
- Texto quando comunica melhor que ícone, começando por verbo.
- Destrutivo em vermelho, nunca como botão principal.
- Ação que demora: **indicador de atividade dentro do botão** e rótulo que
  muda ("Salvando…").

## 6. Tipografia ([Typography](https://developer.apple.com/design/human-interface-guidelines/typography))

Padrão de texto 17 pt; **mínimo 11 pt**. Escala do iOS (tamanho grande, o padrão):

| Estilo | Tamanho / entrelinha | Peso |
| --- | --- | --- |
| Large Title | 34 / 41 | Regular (negrito na ênfase) |
| Title 1 | 28 / 34 | Regular |
| Title 2 | 22 / 28 | Regular |
| Title 3 | 20 / 25 | Regular |
| Headline | 17 / 22 | Semibold |
| Body | 17 / 22 | Regular |
| Callout | 16 / 21 | Regular |
| Subhead | 15 / 20 | Regular |
| Footnote | 13 / 18 | Regular |
| Caption 1 | 12 / 16 | Regular |
| Caption 2 | 11 / 13 | Regular |

A interface precisa aguentar o texto aumentado até **200%**.

## 7. Cor, material e Modo Escuro ([Color](https://developer.apple.com/design/human-interface-guidelines/color), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode))

- Cor com significado e consistente; **nunca a cor como único sinal**.
- Contraste mínimo: **4,5:1** para texto até 17 pt; 3:1 a partir de 18 pt ou
  em negrito. Conferir no claro e no escuro.
- **Liquid Glass só na camada de controles e navegação** (barras, botões
  flutuantes), **nunca no conteúdo**, e com moderação. Variante "clara" só
  sobre foto e vídeo, com escurecimento de 35% se o fundo for claro.
- Não repetir a cor do conteúdo nos rótulos das barras.
- Sem seletor de tema próprio do app: seguir o do sistema.

## 8. Ícones ([Icons](https://developer.apple.com/design/human-interface-guidelines/icons))

- Um conceito por ícone, simples; mesmo peso de traço do texto ao lado.
- Ajuste óptico quando o desenho parece fora do centro.
- Ícone só quando é reconhecível; senão, texto. Sempre com rótulo para leitor
  de tela.

## 9. Retorno, alertas e carregamento

([Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts),
[Loading](https://developer.apple.com/design/human-interface-guidelines/loading),
[Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators),
[Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo))

- Retorno por mais de um canal (cor, texto, som, vibração).
- Status perto do que ele descreve, sem interromper.
- Confirmar só tarefas importantes; avisar só perda de dados **inesperada**.
- Alerta só para o crítico e com ação; **nunca ao abrir o app**; nunca para
  ação que se desfaz. No máximo 3 botões, títulos de 1 ou 2 palavras, sem "OK"
  quando há escolha; Cancelar sempre se chama "Cancelar".
- Escolhas sobre uma ação que a pessoa iniciou: folha de ações, não alerta.
- Mostrar algo na hora (esqueleto) e deixar usar o resto enquanto carrega.
- Indicador sempre em movimento, no mesmo lugar, com descrição curta se ajudar.
- Desfazer mostra o resultado e pode ser repetido.
- Evitar coisas que somem por tempo quando exigem leitura ou ação.

## 10. Movimento e vibração ([Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics))

- Movimento com propósito, breve e preciso; realista (o que desce volta
  subindo).
- **Não animar o que se faz o tempo todo.** Nunca obrigar a esperar animação.
- "Reduzir movimento": molas mais firmes, sem profundidade nem desfoque
  animados, **trocar deslizamentos por esmaecimentos**.
- Vibração curta, consistente (mesma vibração, mesmo significado), junto do
  visual e do som, sem exagero e desligável.

## 11. Escrita ([Writing](https://developer.apple.com/design/human-interface-guidelines/writing))

- Voz própria e lista de termos fixos (aqui: Guardar, Tirar, Contar, armário).
- Poucas palavras; o mais importante primeiro; verbo nos botões.
- Sem "nós" e sem "Ops!"; erro perto do problema, dizendo como resolver.
- Tela vazia sempre com o próximo passo e um botão.
- Dica dentro do campo (ex.: "Ex.: feijão camil").
- "Tocar", nunca "clicar".

## 12. Busca, dados e privacidade

([Searching](https://developer.apple.com/design/human-interface-guidelines/searching),
[Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data),
[Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields),
[Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy))

- Busca num lugar claro, dizendo onde procura; sugestões enquanto digita.
- Oferecer escolhas em vez de digitação; validar na hora; teclado certo
  (numérico para código e data); botão de limpar no campo.
- Pedir permissão (câmera, notificações) **só na hora de usar**, explicando por
  quê; nada de pedir ao abrir o app.
- Processar no aparelho quando der.

## 13. Abertura e ajuda ([Launching](https://developer.apple.com/design/human-interface-guidelines/launching), [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding))

- Abrir na hora; tela de abertura igual à primeira tela, sem logo nem texto.
- **Voltar ao ponto onde a pessoa estava.**
- Ensinar fazendo, com dicas no contexto, não com um tutorial longo.

## 14. Notificações ([Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications))

- Só com permissão; só o que importa; urgência verdadeira ("sensível ao
  tempo" só quando é para agora); nada de propaganda; dá para ajustar no app.

---

## 15. Auditoria do app (09/2026)

| Regra | Como está | Situação |
| --- | --- | --- |
| Barra de abas só navega | 4 abas; o leitor é um botão separado, como o "escrever" do Mail no iOS 26 | Ok |
| Barra visível no detalhe | Aparece na página do produto, com Armário marcado | Corrigido na 3.21 |
| Selo só para o crítico, vermelho | Compras mostra a quantidade a comprar, em amarelo | Desvio consciente: amarelo é "acabando" no app; vermelho é só erro |
| Título grande que encolhe | Armário, Compras, Cupons, Mais | Ok |
| Voltar/Fechar com símbolo | Seta e X em círculo de vidro | Ok |
| Voltar arrastando da borda | No app instalado não existe | **Falta** |
| Uma folha por vez; fechar à esquerda | `openSheet` fecha a anterior; X à esquerda; arrastar para baixo fecha | Ok |
| Menu de contexto espelha a interface | Tirar 1, Guardar 1, lista de compras, ver produto | Ok |
| 44 pt de toque | "−" da linha voltou a 44 pt | Corrigido na 3.21 |
| Estado pressionado em todo botão | Escala 0,96 ou fundo | Ok |
| 1 ou 2 botões de destaque | Folhas com um botão cheio | Ok |
| Indicador dentro do botão | Botões ficam `aria-busy`; falta o giro visível em alguns | Parcial |
| Texto mínimo 11 pt | Menor texto: 11 px na barra de abas | Ok |
| Texto maior até 200% | Tamanhos fixos em px; o iOS não aumenta | **Falta** (usar `-apple-system-body` como base) |
| Contraste 4,5:1 | Medido no design system (seções 3 e 10) | Ok |
| Vidro só em controles | Barra de abas, busca presa no topo, barra da câmera, folhas | Ok |
| Cor não é o único sinal | Pílulas com texto; tarja com nome | Ok |
| Ícone só se universal | "Sem código" e "Nota fiscal" em texto | Ok |
| Não animar o frequente | Cascata só na primeira vez; números rolam discretos | Ok |
| Reduzir movimento = esmaecer | Trocas de tela viram esmaecimento de 180 ms | Corrigido na 3.21 |
| Sem alerta ao abrir; sem alerta para o que se desfaz | Avisos com Desfazer; sem alertas na abertura | Ok |
| Tela vazia com próximo passo | Armário e Cupons com "Abrir o leitor" | Ok |
| Permissão na hora de usar | Câmera pedida ao abrir o leitor | Ok |
| Voltar onde parou | Abre sempre no Armário | **Falta** (lembrar a última aba) |
| Atalhos na tela inicial | `manifest` tem atalhos, mas o iPhone não mostra para app web | Limite da plataforma |
