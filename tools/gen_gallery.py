"""One-off: generate the demo gallery with Muse Image 1.0 (about $0.01 per image). Images are synthetic and labelled so in the UI."""
import base64, io, json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta

OUT = Path(__file__).resolve().parent.parent / "static" / "gallery"
STYLE = " Photorealistic wide interior photograph, daylight from windows, concrete floor, no people, no text, no logos."
ITEMS = [
    ("textile", "Textile weaving mill", 145000, "Rows of industrial weaving looms in a textile mill, large blue air compressors and ducting along the wall, long rows of fluorescent tube lights, an air-conditioning duct."),
    ("plastics", "Plastic injection moulding shop", 98000, "Plastic injection moulding workshop with several hydraulic presses, a large chiller unit with pipes, water pumps on a skid, fluorescent lighting."),
    ("bottling", "Water bottling line", 76000, "Water bottling and packaging line with conveyors, blow-moulding machine, two centrifugal pumps with valves, a red screw air compressor, bright LED panel lights."),
    ("ceramics", "Ceramic tile factory", 210000, "Ceramic tile factory with a long roller kiln, ball mill with big electric motors, large industrial fans and exhaust ducts, stacks of tiles."),
    ("metal", "Metal fabrication workshop", 38000, "Metal fabrication workshop with lathes, a welding bay, a small green air compressor with a hose, fluorescent strip lights hanging from the ceiling."),
    ("bakery", "Biscuit and bakery plant", 62000, "Industrial biscuit bakery with a tunnel oven, dough mixers, conveyor belts, a cooling tunnel and a wall-mounted split air conditioner."),
    ("coldstore", "Cold storage warehouse", 120000, "Cold storage warehouse with large refrigeration compressors and condensers on a plant-room floor, insulated pipes, pallet racking in the background."),
    ("pumpstation", "Water pumping station", 90000, "Industrial water pumping station with three large pumps driven by electric motors, red gate valves, big pipes, a control cabinet, fluorescent lights."),
    ("wood", "Furniture and wood workshop", 41000, "Wood and furniture workshop with table saws, a dust-extraction fan and ducting, a small air compressor, fluorescent tubes, wood shavings."),
]


def gen(item):
    key, title, bill, scene = item
    p = scene + STYLE
    for attempt in range(2):
        try:
            r = httpx.post(meta.env("META_BASE_URL").rstrip("/") + "/images/generations", headers={"Authorization": "Bearer " + meta.env("META_API_KEY")},
                           json={"model": "muse-image-1.0", "prompt": p, "size": "1536x1024"}, timeout=240)
            r.raise_for_status()
            im = Image.open(io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))).convert("RGB")
            im.thumbnail((1280, 1280)); im.save(OUT / f"{key}.jpg", quality=84)
            return {"id": key, "title": title, "file": f"/static/gallery/{key}.jpg", "bill_kwh": bill, "description": ""}
        except Exception as e:  # noqa: BLE001
            print("retry", key, e)
    return None


if __name__ == "__main__":
    with ThreadPoolExecutor(3) as ex:
        res = [r for r in ex.map(gen, ITEMS) if r]
    demo = {"id": "demo", "title": "Food plant (Delta Foods)", "file": "/api/demo/image", "bill_kwh": 68600, "description": "__demo__"}
    (OUT / "manifest.json").write_text(json.dumps([demo] + res, indent=1))
    print("done", len(res))
