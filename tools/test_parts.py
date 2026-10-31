"""Dev check: Muse Spark designs machine shapes (parts) for gallery plants from static/dev/designs.json. Costs 1 call per plant.
Usage: python tools/test_parts.py bottling [other ids...]   Output: static/dev/parts_<id>.json (gitignored)"""
import json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta, parts, scene  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = {d["id"]: d for d in json.loads((ROOT / "static/dev/designs.json").read_text())}
SUF = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--suffix=")), "")
MODEL = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--model=")), None)
for pid in [a for a in sys.argv[1:] if not a.startswith("--")]:
    d = D[pid]
    img = scene.demo_png() if pid == "demo" else (ROOT / "static/gallery" / Path(d["file"]).name).read_bytes()
    spec = d["spec"]
    t0 = time.time()
    got, info = parts.generate(meta.Budget(), spec, img, "", d["obs"], d["boxes_list"], model=MODEL)
    n = parts.apply_parts(spec, got)
    (ROOT / "static/dev" / f"parts_{pid}{SUF}.json").write_text(json.dumps(spec))
    print(pid, n, "machines", {k: len(v) for k, v in got.items()}, round(time.time() - t0, 1), "s", "$", round(info["usd"], 4))
