# Tesseract.js (leitura de texto no aparelho)

Usado para ler a data de validade impressa na embalagem, sem internet e sem IA
na nuvem. Só é baixado quando alguém toca em "ler a validade com a câmera".

- `tesseract.min.js`, `worker.min.js`: tesseract.js 7.0.0 (Apache-2.0).
- `core/`: tesseract.js-core 7.0.0, só as versões LSTM (sem SIMD, SIMD e SIMD relaxado; o motor escolhe a do aparelho).
- `lang/eng.traineddata.gz`: @tesseract.js-data/eng 1.0.0, modelo 4.0.0_best_int
  (2,95 MB). Números e letras latinas; é o que a data precisa.
- `lang/por.traineddata.gz`: mesma fonte e nível (`4.0.0_best_int`, 1,33 MB),
  `naptha/tessdata`. Carregado junto (`eng+por`): ajuda a desambiguar rótulos e
  meses em português (VALIDADE, FABRICAÇÃO, OUT, DEZ…) que o inglês sozinho não
  tem razão para achar prováveis. Medido (16 leituras, mesmo whitelist/PSM):
  não ficou mais lento que "eng" sozinho — ver `docs/LEITURA_VALIDADE.md`.
