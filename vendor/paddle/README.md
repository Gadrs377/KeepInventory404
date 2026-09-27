# PaddleOCR local

SDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv5 mobile det/rec,
ONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa somente em WebAssembly,
uma thread, no worker local. Nenhuma imagem ou texto é enviado a servidores.

Os modelos somam 21,5 MB; o runtime e JS também são baixados no primeiro fallback.
Assets em v1 são imutáveis; ao mudar qualquer dependência/modelo, gerar v2 e
atualizar js/paddleOcr.js e o cache no service worker.

Reproduzir a partir da raiz:

    python3 experiments/ocr/download_models.py
    cd scripts/paddle
    npm ci
    npm run build

Fontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime
Modelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.
