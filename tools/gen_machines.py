"""One-off: generate the machine picker thumbnails with Muse Image 1.0 (about $0.01 each, 12 images). Synthetic illustrations."""
import base64, io, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent / "static" / "machines"
STYLE = " Single object centred, clean light-grey studio background, soft shadow, photorealistic product photograph, no people, no text, no logos."
ITEMS = {
    "pump": "A blue industrial centrifugal pump with an electric motor, bolted to a steel base, with a red gate valve on the pipe.",
    "compressor": "A large red industrial screw air compressor with a receiver tank and pressure gauge.",
    "fan": "A large industrial axial exhaust fan with a steel housing and an electric motor.",
    "conveyor": "A factory conveyor belt with a steel frame and a motor drive, cardboard boxes on the belt.",
    "mixer": "A stainless steel industrial dough mixer with a big bowl and an electric motor on top.",
    "motor": "A large grey industrial three-phase electric motor with cooling fins and a nameplate.",
    "lighting_t8": "A ceiling-mounted industrial fluorescent tube light fixture with two long tubes, lit.",
    "lighting_t12": "An old dusty industrial fluorescent tube light fixture with two thick tubes, lit.",
    "lighting_hid": "An industrial high-bay metal halide lamp hanging from a ceiling, bright round reflector, lit.",
    "lighting_led": "A modern industrial LED high-bay light fixture, round, cool white, lit.",
    "hvac": "A large industrial rooftop air conditioning chiller unit with fans on top.",
    "standby": "A factory machine control panel with a glowing red standby light and a switched-off display.",
}


def gen(kv):
    key, scene = kv
    for _ in range(2):
        try:
            r = httpx.post(meta.env("META_BASE_URL").rstrip("/") + "/images/generations", headers={"Authorization": "Bearer " + meta.env("META_API_KEY")},
                           json={"model": "muse-image-1.0", "prompt": scene + STYLE, "size": "1024x1024"}, timeout=240)
            r.raise_for_status()
            im = Image.open(io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))).convert("RGB")
            im.thumbnail((420, 420)); im.save(OUT / f"{key}.jpg", quality=84)
            return key
        except Exception as e:  # noqa: BLE001
            print("retry", key, e)
    return None


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(3) as ex:
        done = [k for k in ex.map(gen, ITEMS.items()) if k]
    print("done", len(done), "of", len(ITEMS))
