# Experimento: PaddleOCR no Armário

Protótipo isolado, sem alteração do app, estoque, service worker ou publicação.
Base estudada: `b611d76c1df2ddb313dcb12e3872d21c9bf4f10d`.

## Resultado medido

Teste no Chromium 134 para Linux, WebAssembly com uma thread e sem isolamento
COOP/COEP. Não é medição em iPhone. Os 20 recortes são **sintéticos**, produzidos
por `fixtures.js`, com 16 validades e 4 controles negativos.

| Configuração | Resultados corretos / 20 | Datas erradas | Validades não encontradas | Mediana por imagem |
| --- | ---: | ---: | ---: | ---: |
| Fluxo atual do Tesseract | 14 | 2 | 4 | 217 ms |
| Tesseract sem filtro, uma passagem (controle) | 13 | 3 | 4 | 30 ms |
| PaddleOCR v5 mobile, uma passagem | 15 | 2 | 3 | 364 ms |

“Correto” inclui rejeitar corretamente os controles negativos. Não são taxas de
precisão generalizáveis. A política de aceitação difere: o fluxo atual exige
dois votos e tenta até nove variantes; os outros usam uma passagem. O controle
sem filtro serve para isolar o efeito do pré-processamento, não para defender
a retirada da confirmação. O vídeo real pode continuar além das nove tentativas.

O Paddle acertou sombra e reflexo simulados que o fluxo atual não leu. O controle
Tesseract sem filtro também não resolveu esses dois casos (no reflexo, devolveu
fabricação). No mês escrito, Paddle leu `OUT` como `0UT`, e perdeu a validade;
Tesseract acertou. A pontuação Paddle nesse erro foi alta (~0,98): confiança do
motor não pode ser tratada como probabilidade calibrada de validade correta.

Todos passam pelo `findExpiry` original, sem mudanças. Os dois casos de data
errada comuns aos motores são fabricação e lote aceitos como validade. Paddle
leu corretamente os caracteres de `VAL 2026-10-15` e `VAL 15 10 2026`, mas o
interpretador não aceitou esses formatos. Trocar OCR não corrige o interpretador.

Modelos oficiais: detecção 4.843.520 bytes, reconhecimento 16.701.440 bytes;
**21,5 MB antes do runtime/OpenCV/JavaScript**. O build inclui arquivos grandes
adicionais; não foi otimizado para tamanho. A inicialização medida foi local,
sem medir download pela internet. Não medimos pico de memória, bateria ou
qualidade da câmera. O benchmark do build terminou sem requisições externas;
os modelos e bibliotecas foram servidos por localhost. O protótipo não registra
service worker nem promete cache offline persistente no telefone.

Resultados completos, textos e tempos: `results/chromium-linux-synthetic.json`.
Uma execução anterior no servidor de desenvolvimento deu as mesmas contagens.

## Como reproduzir

Requisitos: Node 20.19+ e Python 3.10+.

```sh
cd experiments/ocr
npm ci
npm run setup
npx playwright install chromium
npm run dev
```

Abra `http://127.0.0.1:5173`. Em outro terminal, na mesma pasta:

```sh
npm run benchmark
```

O benchmark grava `results.local.json` (ignorado pelo git). Para verificar o
build estático, rode `npm run build` e sirva `dist/` na raiz de um servidor local
na porta 5173. Esta versão usa URLs a partir da raiz; não foi preparada para
publicação em subpasta de GitHub Pages.

`npm run setup` baixa modelos oficiais com verificação SHA-256 e copia as
bibliotecas locais. Os binários não entram no git. Os arquivos do leitor atual
são copiados sem alterações do checkout: para reproduzir a comparação original,
eles devem continuar iguais ao commit base indicado acima.

A tela permite escolher uma foto recortada da validade, comparar os três fluxos
e exportar o resultado. A foto fica no navegador; não há API de reconhecimento.
Os resultados exportados incluem o texto reconhecido e o nome do arquivo.
Fotos novas não têm gabarito: a tela exige conferência, sem contar acerto.

## Próxima decisão

Não substituir automaticamente o leitor principal com base nesta amostra.
Paddle é viável no navegador e candidato a segunda tentativa em imagens difíceis.
Antes de integrar: corrigir interpretação e ambiguidade; testar fotos reais de
embalagens brasileiras e iPhone/Safari; medir memória, tempo e download; limitar
a execução a um motor por vez; decidir modelos menores/latinos e cache versionado.
Nenhuma dessas alternativas exige cobrança por leitura.

## Dependências e fontes

- SDK oficial `@paddleocr/paddleocr-js` 0.4.2, Apache-2.0:
  https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js
- Modelos PP-OCRv5 mobile oficiais, URLs e hashes em `download_models.py`.
- ONNX Runtime Web 1.24.3, MIT: https://github.com/microsoft/onnxruntime
- OpenCV.js via dependência do SDK: https://github.com/TechStark/opencv-js
- Tesseract.js 7 e modelo inglês já presentes no repositório, com as licenças
  em `vendor/tesseract/`.

O SDK oficial precisou ser excluído da pré-otimização do Vite para preservar a
URL de seu worker. Os runtimes WASM são locais e fixados à versão do SDK.
