# PaddleOCR local

SDK oficial @paddleocr/paddleocr-js 0.4.2 (Apache-2.0), PP-OCRv6 small det/rec,
ONNX Runtime Web 1.24.3 (MIT) e OpenCV.js. Executa somente em WebAssembly,
uma thread, no worker local. Nenhuma imagem ou texto é enviado a servidores.

Os modelos somam 29,8 MB (era PP-OCRv5 mobile, 21,5 MB); o runtime e JS
também são baixados no primeiro fallback. Trocado em v2 porque o PP-OCRv6
small leu corretamente todo um teste sintético em que o v5 mobile errou
2 de 6 casos, e recuperou texto limpo (LOTE completo, duas vezes, a 99% de
confiança) numa foto real de relevo em metal onde o v5 mobile só achou
ruído — ver docs/LEITURA_VALIDADE.md.

Assets em cada pasta vN são imutáveis; ao mudar qualquer dependência/modelo,
gerar a próxima vN e atualizar js/paddleOcr.js e o cache no service worker.

Reproduzir a partir da raiz:

    python3 experiments/ocr/download_models.py
    cd scripts/paddle
    npm ci
    npm run build

Fontes: https://github.com/PaddlePaddle/PaddleOCR e https://github.com/microsoft/onnxruntime
Modelos oficiais e hashes em build.mjs e experiments/ocr/download_models.py.
