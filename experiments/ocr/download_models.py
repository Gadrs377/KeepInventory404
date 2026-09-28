"""Download the exact official models used in the experiment (standard library)."""
import hashlib
from pathlib import Path
import urllib.request

BASE = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/'
MODELS = {
    # small: leitura contínua ao vivo. medium: só a foto nítida. Ver
    # scripts/paddle/worker.js (TIERS) e docs/LEITURA_VALIDADE.md.
    'PP-OCRv6_small_det': 'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4',
    'PP-OCRv6_small_rec': 'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1',
    'PP-OCRv6_medium_det': 'c5adb0b15de1b1838934eba1dd72e7529e7d80132216c6ee6d26eba6fa054fcf',
    'PP-OCRv6_medium_rec': 'd8cc46c7163c83a151aef8fce5856b965860df90a875029216d605b0f607eaec',
}
folder = Path(__file__).parent / 'public/models'
folder.mkdir(parents=True, exist_ok=True)
for name, digest in MODELS.items():
    target = folder / f'{name}.tar'
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == digest:
        print(f'{name}: verified')
        continue
    temporary = target.with_suffix('.download')
    try:
        with urllib.request.urlopen(f'{BASE}{name}_onnx_infer.tar', timeout=90) as response, temporary.open('wb') as out:
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'{name}: incomplete download or upstream model changed; do not use')
        temporary.replace(target)
        print(f'{name}: downloaded and verified')
    finally:
        temporary.unlink(missing_ok=True)
