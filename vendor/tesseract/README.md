# Tesseract.js (leitura de texto no aparelho)

Usado para ler a data de validade impressa na embalagem, sem internet e sem IA
na nuvem. Só é baixado quando alguém toca em "ler a validade com a câmera".

- `tesseract.min.js`, `worker.min.js`: tesseract.js 7.0.0 (Apache-2.0).
- `core/`: tesseract.js-core 7.0.0, só as versões LSTM (sem SIMD, SIMD e SIMD relaxado; o motor escolhe a do aparelho).
- `lang/eng.traineddata.gz`: @tesseract.js-data/eng 1.0.0, modelo 4.0.0_best_int.
  Números e letras latinas; é o que a data precisa.
