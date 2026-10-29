"""One-off: wide Muse Image 1.0 assets for the faceless pitch video (about $0.01 each). Output: ../the video for the presentation/faceless video/assets-src"""
import base64, io, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent.parent / "the video for the presentation" / "faceless video" / "assets-src"
STYLE = " Clean modern flat vector illustration, soft shading, orange (#ff6a00) and charcoal grey palette on a pure white background, wide cinematic composition with empty white space, no text, no letters, no numbers, no logos."
ITEMS = {
    "bg_blueprint": "A very subtle light-grey engineering blueprint grid with faint orange pipe and wiring lines, mostly empty white.",
    "bg_flow": "Abstract flowing orange energy lines and glowing nodes sweeping across a white canvas, elegant and minimal.",
    "factory_wide": "A wide panoramic flat illustration of a modern factory complex with chimneys, pipes and a glowing orange lightning bolt above it, at dawn.",
    "meter": "A large electricity smart meter dial with an orange needle and a stack of electricity bills, wide scene.",
    "coins_bolt": "An orange lightning bolt with coins leaking out of it like water, dramatic and clear.",
    "nodes": "A network of connected light-grey nodes with a few glowing orange nodes forming a loop, representing agents collaborating.",
    "plant_room": "A plant room with large pumps, pipes and an air compressor in flat vector style, orange highlights, wide view.",
    "engineer_robot": "A friendly engineer in an orange hard hat and a small friendly robot looking together at a glowing holographic 3D factory model, wide scene.",
    "solar_roof": "A factory roof with rows of solar panels under a bright sun, flat vector, orange accents, wide view.",
    "report_stack": "A stack of report pages with charts and an approved stamp, an engineer's hand holding a pen, wide scene.",
}


def gen(kv):
    key, scene = kv
    for _ in range(2):
        try:
            r = httpx.post(meta.env("META_BASE_URL").rstrip("/") + "/images/generations", headers={"Authorization": "Bearer " + meta.env("META_API_KEY")},
                           json={"model": "muse-image-1.0", "prompt": scene + STYLE, "size": "1536x1024"}, timeout=240)
            r.raise_for_status()
            Image.open(io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))).convert("RGB").save(OUT / f"{key}.jpg", quality=90)
            return key
        except Exception as e:  # noqa: BLE001
            print("retry", key, e)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as ex:
        print(sorted(k for k in ex.map(gen, ITEMS.items()) if k))
