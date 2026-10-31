"""Dev: full-AI scene test. Takes the current-way spec (static/dev/parts_<id>_<cur>.json) and adds a Muse Wonder 'hall' (everything except machines).
Usage: python tools/test_hall.py <id> <cur-suffix>   -> static/dev/parts_<id>_ai.json"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta, parts, scene  # noqa: E402
ROOT = Path(__file__).resolve().parent.parent
pid, cur = sys.argv[1], sys.argv[2]
D = {d["id"]: d for d in json.loads((ROOT / "static/dev/designs.json").read_text())}[pid]
spec = json.loads((ROOT / f"static/dev/parts_{pid}_{cur}.json").read_text())
img = (ROOT / "static/gallery" / Path(D["file"]).name).read_bytes()
t0 = time.time()
hall, info = parts.generate_hall(meta.Budget(), spec, img, "", D["obs"], D["boxes_list"])
spec["hall"] = hall
(ROOT / f"static/dev/parts_{pid}_ai.json").write_text(json.dumps(spec))
print(pid, len(hall), "hall parts", round(time.time() - t0, 1), "s $", round(info["usd"], 3))
