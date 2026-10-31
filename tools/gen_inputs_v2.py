"""One-off: simple 'what goes in' graphic made entirely by Muse Image 1.0 (a few variants, about $0.01 each). Output: assets/inputs/v2/"""
import base64, io, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent / "assets" / "inputs" / "v2"
BASE = ("A clean minimalist keynote-style infographic on a pure white background, flat vector, generous empty space. "
        "On the left, four short labels in dark charcoal bold capital letters stacked vertically, each with a small orange dot: PHOTO, DESCRIPTION, BILL, MACHINES. "
        "Four thin elegant orange curved lines flow from the four labels and converge into one point on the right, where an orange rounded rectangle contains the white word WATTLOOP. "
        "From that rectangle one orange arrow leads to a final charcoal label: PLAN. "
        "Large title text in charcoal at the top left: What goes in. No other words, no logos, spelling must be exact.")
VARS = {"a": BASE, "b": BASE + " Include a small orange lightning bolt icon above the title.", "c": BASE + " Add a small engineer hard-hat icon next to the PLAN label."}


def gen(kv):
    k, p = kv
    for _ in range(2):
        try:
            r = httpx.post(meta.env("META_BASE_URL").rstrip("/") + "/images/generations", headers={"Authorization": "Bearer " + meta.env("META_API_KEY")},
                           json={"model": "muse-image-1.0", "prompt": p, "size": "1536x1024"}, timeout=240)
            r.raise_for_status()
            Image.open(io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))).convert("RGB").save(OUT / f"{k}.png")
            return k
        except Exception as e:  # noqa: BLE001
            print("retry", k, e)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as ex:
        print(sorted(k for k in ex.map(gen, VARS.items()) if k))
