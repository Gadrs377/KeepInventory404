"""Download the exact official models used in the experiment (standard library)."""
import hashlib
from pathlib import Path
import urllib.request

BASE = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/'
MODELS = {
    'PP-OCRv5_mobile_det': '781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30',
    'PP-OCRv5_mobile_rec': 'f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c',
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
