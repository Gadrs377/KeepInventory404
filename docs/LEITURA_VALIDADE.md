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
- Binários Paddle em `vendor/paddle/v1` (~43 MB sem compressão HTTP; modelos
  correspondem a 21,5 MB) só são requisitados no fallback. O service worker v48
  usa cache separado e URLs versionadas. Após cache completo, funciona offline;
  caches podem ser removidos pelo navegador, e falta de espaço impede garantir
  persistência. Falha de gravação no cache não deve impedir leitura online.
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

## Sem confirmar por muito tempo: inclinar/luz e foto nítida

Depois de `STRUGGLE_MS` (10 s) sem confirmar, `js/views/expiryCam.js` mostra um
painel com duas sugestões que alternam a cada 4,2 s (`TILT_HINTS`, em
`js/expiryRecognition.js`) — inclinar a embalagem devagar ou mudar a direção
da luz, mantendo a validade na mira — e o botão **Tirar uma foto nítida da
validade**. Foi a próxima experiência sugerida em `TESTES_VALIDADES_REAIS.md`
para a embalagem roxa em relevo que não confirmou em nenhum teste.

A cada troca de dica (mesmo ciclo de 4,2 s), o app também tira e lê uma foto
parada sozinho, sem esperar o toque no botão — quem está inclinando a
embalagem ou mudando a luz tem mais chances de a leitura pegar o instante
certo sem precisar parar para tocar em nada. O botão continua ali para
tentar na hora, sem esperar o próximo ciclo. Enquanto uma rodada está em
andamento (`busy = true`), o ciclo seguinte só continua alternando a dica —
não inicia uma segunda rodada por cima da primeira.

Cada rodada (automática ou pelo botão):

1. Pausa a leitura contínua (`busy = true`; o laço só volta a rodar quando a
   foto termina).
2. Tenta `ImageCapture.takePhoto()` na trilha da câmera, que costuma trazer
   mais pixels do sensor que um quadro de vídeo; sem suporte, usa o próprio
   quadro atual do vídeo.
3. Roda os cinco filtros distintos do Tesseract (sem as variações de
   segmentação/rotação, pensadas para variar entre quadros de vídeo, não uma
   foto só) com um recorte maior (`BURST_TESSERACT_VARIANTS`,
   `prepareFrame` ganhou `maxH`/`maxScale` para isso) e, se o Paddle já
   carregou (ou carrega agora, com aviso), os cinco filtros dele também
   (`BURST_PADDLE_VARIANTS`). Cada filtro entra na mesma votação como um
   "quadro" à parte, com um número de rodada crescente no identificador
   (`photo-<rodada>-<filtro>`) para que uma nova foto nunca seja descartada
   como "quadro repetido" de uma rodada anterior — cada tentativa segue
   independente, sem misturar pixels entre fotos. Confirma sozinha nos
   mesmos critérios de sempre.
4. Sem confirmar em nenhum filtro, volta ao normal: mostra o que achou como
   opção para tocar, e a leitura contínua retoma.

Testado com Tesseract simulado (Playwright): o painel aparece só depois do
tempo certo, a dica alterna, a leitura contínua não confirma sozinha depois
que a foto é pedida (só os quadros dela contam), a foto dispara sozinha a
cada ciclo sem exigir toque no botão, duas rodadas nunca ficam pendentes ao
mesmo tempo (uma leitura de 900 ms por filtro, mais longa que o próprio
ciclo de dica, não gera chamadas simultâneas), confirma corretamente quando
algum filtro acerta (pelo toque ou sozinha), e devolve o botão e a câmera
quando nenhum acerta.

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

## Validação

`node --test tests/expiry.test.mjs`: formatos, fabricação/lote, datas impossíveis,
ambiguidade, votos de motores distintos, expiração dos votos, repetição de quadro,
confiança insuficiente e datas já escolhidas.

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
