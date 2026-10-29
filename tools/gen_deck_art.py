"""One-off: one Muse Image 1.0 illustration per slide of the pitch deck (about $0.01 each). Output: ../deck-art (private, outside the repo)."""
import base64, io, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent.parent / "deck-art"
STYLE = " Clean modern flat vector illustration, soft shading, orange (#ff6a00) and charcoal grey palette, plain pure white background, centred composition with generous white margin, no text, no letters, no numbers, no logos."
ITEMS = {
    "s1_hook": "A factory building with an orange lightning bolt above it and a glowing orange wireframe 3D digital twin of the same factory floating next to it.",
    "s2_problem": "Electric motors, pumps and an air compressor in a factory, with orange arrows showing wasted energy leaking away and coins flowing out.",
    "s3_loop": "A circular loop of orange arrows around a magnifying glass, a gear and a check mark, representing an agent loop.",
    "s4_photo": "A camera taking a photo of a factory floor, and the photo turning into an orange wireframe 3D model of the plant.",
    "s5_verify": "A calculator-like simulator screen with a green check mark accepting a fix and a red cross rejecting an over-aggressive fix.",
    "s6_report": "A report document with bar charts next to a clipboard machine list, and an engineer's hand signing approval.",
    "s7_meta": "An abstract AI network brain connected to an eye, segmentation outlines around machines and an image frame, representing vision and image models.",
    "s8_close": "A friendly engineer in a hard hat and a small friendly robot working together over a tablet showing a factory plan.",
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
        print(sorted(k for k in ex.map(gen, ITEMS.items()) if k))
