# PaddleOCR local

SDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv6 (duas
camadas, veja abaixo), ONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa
somente em WebAssembly, uma thread, no worker local. Nenhuma imagem ou
texto é enviado a servidores.

Duas camadas do mesmo PP-OCRv6, escolhidas por `tier` na mensagem `init`
do worker (`worker.js`, mapa `TIERS`):

- **small** (31,2 MB): usada na leitura contínua ao vivo. Rápida (~0,6 s por
  leitura) — o que importa ali é tentar muitos quadros por segundo.
- **medium** (138,8 MB): usada só na foto nítida (manual ou automática
  durante a dica de inclinar/luz). Mais lenta (~4 s por leitura, quase 7x),
  mas enxerga mais em material difícil: no mesmo conjunto de quadros reais
  de uma lata com validade gravada a laser, a small só recuperava o LOTE; a
  medium também achou fragmentos da própria data (ex. "AB-29/DEZ", que bate
  com a validade real). Só é baixada quando a foto nítida realmente entra
  em ação, não na leitura contínua. Ver docs/LEITURA_VALIDADE.md.

Assets em cada pasta vN são imutáveis; ao mudar qualquer dependência/modelo,
gerar a próxima vN e atualizar js/paddleOcr.js e o cache no service worker.

Reproduzir a partir da raiz:

    python3 experiments/ocr/download_models.py
    cd scripts/paddle
    npm ci
    npm run build

Fontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime
Modelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.
