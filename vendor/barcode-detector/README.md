# barcode-detector (vendored)

- `barcode-detector.js`: `barcode-detector@3.2.2` (`dist/es/zxing-exported.js`), MIT, Ze-Zheng Wu.
- `zxing_reader.wasm`: `zxing-wasm@3.1.3` (`dist/reader/zxing_reader.wasm`), MIT, Ze-Zheng Wu. Built from zxing-cpp (Apache-2.0).

Copied here so the scanner works offline on iOS/Safari (no native `BarcodeDetector`).
To update: `npm pack barcode-detector` and copy the same files, keeping the wasm version equal to the one pinned by barcode-detector.
