"""One-off: Muse Image 1.0 illustrations for the README 'inputs' graphic (about $0.01 each)."""
import base64, io, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent / "assets" / "inputs"
STYLE = " Clean modern flat vector illustration, soft shading, orange (#ff6a00) and charcoal grey palette, plain pure white background, single centred object, no text, no letters, no numbers, no logos."
ITEMS = {
    "photo": "A framed photograph of a factory floor with machines and pipes, with a small camera icon.",
    "description": "An open notebook with handwritten lines and a pen, suggesting a typed description of machines.",
    "bill": "An electricity bill document with a lightning bolt symbol, a bar chart and a kilowatt-hour meter, no readable text.",
    "machines": "A clipboard checklist with small icons of a pump, a compressor, a fan and a light bulb, no readable text.",
    "engineer": "An engineer in a hard hat holding a tablet that shows a report with charts, friendly, flat style.",
}


def gen(kv):
    key, scene = kv
    for _ in range(2):
        try:
            r = httpx.post(meta.env("META_BASE_URL").rstrip("/") + "/images/generations", headers={"Authorization": "Bearer " + meta.env("META_API_KEY")},
                           json={"model": "muse-image-1.0", "prompt": scene + STYLE, "size": "1024x1024"}, timeout=240)
            r.raise_for_status()
            Image.open(io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))).convert("RGB").save(OUT / f"{key}.png")
            return key
        except Exception as e:  # noqa: BLE001
            print("retry", key, e)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as ex:
        print([k for k in ex.map(gen, ITEMS.items()) if k])
