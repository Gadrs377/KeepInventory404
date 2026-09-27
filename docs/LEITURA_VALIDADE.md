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
