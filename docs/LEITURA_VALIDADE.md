# Leitor de validade combinado

Implementação a partir de `b611d76`, mantendo sugestões por toque, confirmação
antes de salvar e processamento no aparelho. Nenhuma API paga ou envio de fotos.

## Fluxo

1. O Tesseract tenta original, cinza, Otsu, Sauvola e Otsu adaptativo por regiões.
   Também varia tamanho/desfoque, segmentação em bloco/linha/texto esparso e
   pequenas rotações. `js/expiryRecognition.js` define dez configurações.
2. Sem confirmação após seis tentativas (ou sete segundos após pelo menos três),
   carrega o PaddleOCR. Se o Tesseract não carregar, tenta o Paddle diretamente.
3. Os motores alternam quadros: contribuem para a mesma decisão, mas não fazem
   inferência simultânea. O carregamento/compilação do Paddle também suspende
   temporariamente a inferência do Tesseract.
4. As sugestões continuam disponíveis para toque. A confirmação automática usa
   uma janela de nove segundos, no máximo doze votos, vantagem de dois votos e
   pelo menos dois quadros distintos. Data rotulada exige dois votos; sem rótulo,
   permanece uma opção manual. Resultado ambíguo ou confiança inferior a 40/100 não confirma sozinho.
   Confiança é um sinal heurístico, não probabilidade de acerto.
5. Paddle também alterna original, cinza, Otsu e canais vermelho/azul com
   expansão de contraste. Seus blocos são reunidos por linha e posição horizontal.
6. A confirmação exibe a captura original usada na leitura e explica quando
   o último dia do mês foi inferido. A imagem fica só nessa tela, sem persistência.

FAB/LOTE agora excluem a data associada. São reconhecidos ano-mês-dia, data com
espaços sob rótulo VAL, `V02 27`, `V0227` e correções limitadas de nomes como `0UT`. Datas ambíguas
viram opções. Não se escolhe automaticamente a maior data entre duas sem rótulo.

## Recursos, falhas e offline

- Paddle usa um worker dedicado, WASM com uma thread, sem exigir WebGPU ou
  cabeçalhos COOP/COEP. O navegador precisa suportar module workers/WebAssembly.
- Tesseract usa um worker e fila de parâmetros, com limite de tempo. Fechar a
  câmera encerra os workers, pendências e trilhas da câmera.
- O processamento para enquanto a aba está oculta; ao voltar, os votos são
  reiniciados. Reconhecimento já iniciado pode terminar, mas seu resultado oculto
  não é usado.
- Se o Paddle falhar ou estiver indisponível no primeiro uso offline, o Tesseract
  continua e a digitação permanece disponível. Se ambos falharem, há orientação
  para digitar, sem nova tentativa infinita de baixar modelos na mesma sessão.
- Binários Paddle em `vendor/paddle/v3` (~185 MB sem compressão HTTP: duas
  camadas do PP-OCRv6, small com 31,2 MB para a leitura contínua e medium
  com 138,8 MB só para a foto nítida — ver "Duas camadas do Paddle" abaixo)
  só são requisitados no fallback; a medium começa a carregar em segundo
  plano quando a small fica pronta (ou quando a pessoa abre a câmera do
  celular). O service worker v54 usa cache separado e URLs
  versionadas. Após cache completo, funciona offline; caches podem ser
  removidos pelo navegador, e falta de espaço impede garantir persistência.
  Falha de gravação no cache não deve impedir leitura online.
- O build pronto está versionado. Publicação continua estática, sem dependências
  npm em produção. Instruções para reproduzir o bundle em `vendor/paddle/README.md`.

## Pacote de português junto do inglês

O Tesseract carrega `eng+por` (era só `eng`). O whitelist já restringe a
saída a números, separadores e A–Z, mas o pacote "por" ainda ajuda a
desambiguar entre formas de letra parecidas, porque a rede treinada em
português acha mais provável "VALIDADE", "FABRICAÇÃO" e meses como "OUT" e
"DEZ" — o inglês sozinho não tem razão para preferir essas sequências.
`por.traineddata.gz` é o mesmo nível `best_int` do `eng.traineddata.gz` já
usado (mesma fonte, `naptha/tessdata`), 1,33 MB a mais no download (que só
acontece quando a câmera de validade é usada).

Rodar os dois juntos passou a impressão de que dobraria o tempo por leitura
(a documentação do Tesseract descreve isso de forma geral), mas medido aqui
(16 leituras, mesmo whitelist e PSM 6, texto sintético "VAL 15/10/2026"): a
mediana com `eng+por` não ficou mais lenta que só `eng`. Não é uma garantia
para todo texto/PSM, mas não há custo perceptível neste uso.

## Sem confirmar por muito tempo: inclinar/luz, fotos e digitar olhando

Depois de `STRUGGLE_MS` (10 s) sem confirmar, `js/views/expiryCam.js` mostra um
painel com duas sugestões que alternam a cada 4,2 s (`TILT_HINTS`, em
`js/expiryRecognition.js`) — inclinar a embalagem devagar ou mudar a direção
da luz, mantendo a validade na mira — e o botão **Tirar foto com a câmera do
celular**.

**Foto automática.** A cada troca de dica, o app congela o quadro atual (ou
usa `ImageCapture.takePhoto()` quando existe — no Safari não existe) e lê essa
foto parada. A imagem pisca em branco e o celular dá um toque curto, para a
pessoa perceber o instante e aprender o ritmo "inclina, para, inclina". Nunca
duas fotos ao mesmo tempo. Cada foto:

1. Roda os cinco filtros do Tesseract com um recorte maior
   (`BURST_TESSERACT_VARIANTS`) e depois os cinco do Paddle
   (`BURST_PADDLE_VARIANTS`) — com o medium, se já estiver pronto; senão com o
   small. Nunca espera o medium carregar.
2. A leitura ao vivo **continua rodando** enquanto a foto é lida: o Tesseract
   tem fila própria (`js/ocr.js`) e o medium tem worker próprio. Só pausa
   (`busy`) se a foto precisar do Paddle small, que é o mesmo worker da
   leitura ao vivo. Antes, a leitura ao vivo parava a foto inteira — com o
   medium (~4 s por filtro) isso chegava a ~20 s parada; num teste, a
   confirmação caiu de 14,9 s para 0,3 s depois da mudança.
3. **Uma foto conta como uma imagem só.** Todos os filtros votam, mas com a
   mesma origem (`source: photo-<n>` em `createExpiryConsensus`), então a regra
   de "duas imagens diferentes" não se cumpre com uma foto só. Antes, dois
   filtros da mesma foto já confirmavam — e filtros diferentes sobre a mesma
   imagem borrada tendem a errar igual. Agora a confirmação precisa de outra
   foto ou de um quadro ao vivo concordando.
4. Se a `ImageCapture` tem outra proporção que o vídeo (foto 4:3, vídeo 16:9),
   a mira é convertida para a foto (antes, o recorte caía no lugar errado), e
   `takePhoto()` tem limite de 3 s — sem isso, uma trilha que cai no meio
   deixava a foto esperando para sempre.

**Câmera do celular.** O botão abre a câmera do próprio aparelho
(`<input type="file" capture="environment">`): foco, HDR e resolução cheia —
no iPhone, a única forma de ter uma foto realmente mais nítida que o vídeo. A
foto inteira é lida (`PHOTO_*_VARIANTS`: Tesseract com texto esparso, e o
Paddle medium, que espera ficar pronto só neste caso, já que a pessoa pediu
uma leitura cuidadosa). A foto automática em andamento cede a vez. Como é uma
foto só, não confirma sozinha: a data vira um botão ("Achei a data na foto.
Toque nela para conferir"). Na volta, se o iOS encerrou a câmera da página,
ela é religada.

**Mensagens de causa.** A cada ~1,2 s o recorte da mira (320 px) é medido em
`js/frameQuality.js`: brilho médio baixo → "Está escuro…"; mais de 2,5% de
pixels estourados → "Tem reflexo em cima da data…"; pouca variância do
Laplaciano → "Segure parado, com a data dentro da mira". Os limites vieram de
quadros reais do vídeo da lata (tremidos ficaram abaixo de ~35; nítidos acima
de ~95). A mensagem só aparece depois de a mesma causa ser vista duas vezes
seguidas, e só some do mesmo jeito. **É só para a mensagem**: nenhum quadro
deixa de ser lido por causa dela (descartar quadros "ruins" já piorou a
leitura antes). As mensagens que falavam da máquina ("leitura mais
detalhada", "mais precisa") viraram "Só um instante" ou sumiram.

**Desistir com dignidade.** Depois de 3 fotos automáticas sem confirmar, ou
35 s (`HARD_AFTER_*`) desde que já exista uma foto, o painel diz que a
embalagem está difícil de ler pela câmera, e "Digitar a data" vira o caminho
sugerido. A página de digitar mostra a foto com mais texto legível até ali
(foto do celular tem preferência), e um toque amplia em volta do ponto
tocado. A foto segue para a confirmação como prova. É o caminho realista para
a lata gravada a laser, que a pessoa lê a olho mas nenhum motor leu.

Testado com Tesseract simulado (Playwright): painel no tempo certo, dicas
alternando, fotos automáticas sem toque (contando o piscar), nenhuma
confirmação só com fotos, confirmação rápida quando a data fica legível,
câmera do celular (atributos, leitura, data virando botão, foto como prova,
falha sem data, trilha encerrada e religada), desistência com foto e zoom, e
as três mensagens de causa com vídeos falsos (escuro, reflexo, liso).

## Duas camadas do Paddle (PP-OCRv5 mobile → PP-OCRv6 small + medium)

A PaddlePaddle lançou o PP-OCRv6 em 11/06/2026. O SDK que já usávamos
(`@paddleocr/paddleocr-js` 0.4.2) já conhece os novos modelos oficiais
(`PP-OCRv6_tiny/small/medium`), sem precisar trocar de biblioteca — só o
nome dos modelos baixados.

Primeiro trocamos só o modelo da leitura contínua, do PP-OCRv5 mobile para
o PP-OCRv6 small, com base num teste comparando os dois lado a lado com o
motor real (não simulado): em 6 casos de texto sintético limpo (datas
com/sem rótulo, lote), o PP-OCRv5 mobile leu 4 de 6 perfeitamente (trocou
`/` por `I` numa data, cortou o último dígito de outra); o PP-OCRv6 small
leu os 6 perfeitamente, e mais rápido em cada caso. Também testamos o
PP-OCRv6 tiny (ainda menor, ~6 MB): leu os 6 casos sintéticos tão bem
quanto o small e mais rápido, mas no vídeo real da lata (próxima seção)
passou a "ver" texto onde não tinha nada, alucinando caracteres chineses
com confiança alta em vários quadros — pequeno demais, como modelo
multilíngue, para esse nível de ruído. Descartado.

Depois, decidimos não economizar no tamanho do download — o app é usado
majoritariamente em casa, por wi-fi, e o que importa é confirmar rápido e
certo, não o MB baixado uma vez. Testamos também o PP-OCRv6 medium (a
camada mais pesada, que o próprio artigo do PP-OCRv6 diz superar até
VLMs de bilhões de parâmetros em tarefas de OCR) contra o small, nos
mesmos 29 quadros exatos do vídeo real da lata (mesmo recorte, reaproveitados
para os dois, para não misturar "mais preciso" com "teve mais tentativas"):

- O PP-OCRv5 mobile (o original, antes de qualquer troca) só achava ruído
  nesses quadros (ex.: "LE" a 60% de confiança).
- O PP-OCRv6 small recuperou o LOTE inteiro e correto (`LOTE:1291225`)
  várias vezes, a até 100% de confiança — mas nunca um fragmento da
  validade em si.
- O PP-OCRv6 medium, nos mesmos quadros, também recuperou o LOTE e ainda
  achou fragmentos da própria data (`AB-29/DEZ`, `FAB:29/1` + `UAL`) que
  batem com a validade real (FAB 29/DEZ/25) — o small nunca chegou perto
  disso. Só que o medium levou em média **3954 ms por leitura contra 586 ms
  do small (quase 7x mais lento)**.

Essa lentidão importa porque a estratégia da câmera é tentar muitos quadros
rápido, não pensar bastante sobre um só: com o medium, uma rodada de foto
nítida completa (5 filtros) passaria de poucos segundos para quase 20 s só
na parte do Paddle, e cada ciclo de dica de inclinar levaria de 4,2 s para
esse tanto. Por isso a divisão adotada: **small na leitura contínua** (onde
tentar rápido vale mais) e **medium só na foto nítida** (onde a pessoa já
está esperando uma resposta mais cuidadosa, e vale a pena pensar mais numa
única foto bem tirada). A foto tenta o Tesseract primeiro e depois o
Paddle; o medium carrega em segundo plano e nenhuma foto automática espera
por ele nem pausa a leitura ao vivo (ver a seção anterior).

Mesmo com o medium, o vídeo real da lata não chegou a confirmar a validade
de ponta a ponta pelo fluxo completo do app (testado por até 90 s) — o
ganho de precisão é real (fragmentos da data, antes inexistentes), mas essa
embalagem específica continua sem solução completa; ver
`TESTES_VALIDADES_REAIS.md`.

Tamanhos: small 31,2 MB (era 21,5 MB no PP-OCRv5 mobile), medium 138,8 MB —
juntos, 185 MB de binários em `vendor/paddle/v3`; a medium só é baixada
quando a embalagem já se mostrou difícil (small pronta) ou a pessoa pede a
câmera do celular. Suite completa de testes (unitários, câmera real com motores
reais, ciclo de vida do Paddle offline/cancelamento, painel de ajuda e foto
automática) rodada de novo depois da troca, sem regressão.

## Por que não usamos EasyOCR

Chegou a ser considerado como um terceiro motor. Pesados demais para um app
que baixa por trás, no celular:

- O modelo oficial otimizado da Qualcomm para aparelhos móveis (o mais leve
  encontrado) já tem 79,2 MB só no detector, sem contar o reconhecedor; ele
  roda em NPU específica do aparelho (QNN/TFLite), não em WASM de navegador.
- A única porta JavaScript/WASM encontrada (`easyocr.js`, um projeto novo, sem
  uso conhecido em produção) cita 100–300 MB de download na primeira vez.
- Um estudo comparando os três motores nesta mesma tarefa (leitura de
  validade em embalagem real) mediu o Paddle na frente, seguido do EasyOCR, e
  o Tesseract em último — ou seja, o motor mais pesado dos dois não seria
  nem o mais preciso aqui.

Para comparação, o Tesseract já usado pesa uns 7 MB e o Paddle (`vendor/paddle`)
uns 21,5 MB de modelos.

## Diagnóstico, rótulo e a pergunta "É esta data?"

A votação sempre sabe por que não confirmou (`why()` em
`createExpiryConsensus`: sem data, mais de uma, sem rótulo, confiança baixa,
só uma imagem, poucos votos, empate, data já escolhida). A câmera guarda cada
tentativa com esse motivo (`promise.log()`), e com o diagnóstico ligado
(Mais, ou `?debug`) mostra o recorte e as últimas tentativas na tela, com um
botão para copiar tudo em JSON. Foi esse registro que mostrou que, nas
embalagens reais em que a data certa era lida, o que faltava quase sempre
era o rótulo ("Nono teste" em `TESTES_VALIDADES_REAIS.md`).

Por isso:

- `js/dates.js` reconhece o "VAL" mal lido no começo da linha, a data que
  vem depois de uma linha de fabricação, o rótulo em outra parte do recorte
  e o cabeçalho junto "VAL/LOTE:" — cada um com limites para não aceitar
  fabricação (sempre anterior à validade) nem lote.
- Uma data sem rótulo continua sem confirmar sozinha. Vista em 4 imagens
  diferentes, 2 à frente das outras, vira uma pergunta ("Li … várias vezes.
  É a validade?"), só se for futura ou já tiver vindo com rótulo alguma vez.
- Cada data mostra em quantas imagens apareceu; a mais vista ganha destaque
  e já vem escrita na página de digitar.

## Validação

`node --test tests/expiry.test.mjs`: formatos, fabricação/lote, datas impossíveis,
ambiguidade, votos de motores distintos, expiração dos votos, repetição de quadro,
confiança insuficiente e datas já escolhidas.

`node --test --test-concurrency=1 tests/ui/*.test.mjs`: o fluxo na tela, com
câmera falsa gerada no teste e leitor simulado — confirmação, ordem e
contagem das datas, a pergunta ("Sim" e "Não"), digitar pré-preenchido,
embalagem difícil com a melhor foto, foto do celular com andamento, avisos de
escuro/reflexo/tremido e o diagnóstico. Sobe o próprio servidor.

`tests/ocr-browser.mjs` usa Chromium 134 com os motores reais, sem serviço remoto:

- Tesseract melhorado confirmou **15 de 16** validades sintéticas nas dez
  configurações; não confirmou nenhuma data errada. Quatro controles negativos
  também foram rejeitados. O reflexo simulado restante não foi confirmado.
- O worker Paddle empacotado reconheceu o exemplo com sombra.
- Fluxo completo de câmera foi exercitado com `canvas.captureStream` e motores
  reais, incluindo encerramento da trilha na confirmação.
- Um teste força seis resultados vazios do Tesseract para validar o fallback:
  Paddle real mais uma leitura Tesseract controlada confirmaram juntos.
- Um novo worker Paddle conseguiu reconhecer com o navegador offline depois
  do primeiro carregamento/cache.
- `tests/ocr-lifecycle.mjs` confirmou que falha no download do Paddle mantém
  o Tesseract funcionando, cancelar a inicialização rejeita a pendência e fechar
  antes da resposta da câmera também encerra a trilha que chega depois.

Textos das tentativas estão em `tests/ocr-browser-results.json`. São controles
simulados, não uma taxa de acerto em embalagens reais. Não foi medido consumo de
memória/bateria nem validado o desempenho em iPhone/Safari.

Para reproduzir, instalar as dependências de teste em `experiments/ocr` com
`npm ci` e `npx playwright install chromium`, servir a raiz com
`python3 -m http.server 8765 --bind 127.0.0.1` e executar, em outro terminal,
`node tests/ocr-browser.mjs`.

Os resultados das seis fotos reais, as limitações e os experimentos que não
foram ativados estão em [TESTES_VALIDADES_REAIS.md](TESTES_VALIDADES_REAIS.md).
