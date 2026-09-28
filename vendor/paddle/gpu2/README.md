# Paddle com GPU (teste)

Mesmo PP-OCRv6 de ../v3, com o ONNX Runtime Web 1.30.0 que usa a GPU
(WebGPU, variante "asyncify"). Só para a tela de testes do app (#/testes,
js/views/testes.js), que compara esta versão com a de produção no próprio
celular. Os modelos são lidos de ../v3/ (não são duplicados).

O SDK cria as duas sessões em paralelo, e o WebGPU do onnxruntime só aceita
uma por vez: o build aplica um patch que as cria em série.

Reproduzir: `cd scripts/paddle && npm ci && node build-gpu.mjs`.
