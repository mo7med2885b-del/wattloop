"""Regenerate the pre-made 3D of the 9 gallery demo plants with the live design step (machines + full-AI hall). ~ $0.35 per plant.
Usage: python tools/make_demo_halls.py <id> ...   -> wattloop/data/demo_parts.json (machines) and wattloop/data/demo_halls.json (hall)"""
import copy, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import meta, parts, pipeline, scene  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
D = {d["id"]: d for d in json.loads((ROOT / "static/dev/designs.json").read_text())}
fp, fh = ROOT / "wattloop/data/demo_parts.json", ROOT / "wattloop/data/demo_halls.json"
for pid in sys.argv[1:]:
    d = D[pid]
    spec = copy.deepcopy(d["spec"])
    for c in spec["components"]:
        c.pop("design", None) if False else None
    spec.pop("extras", None)
    run = pipeline.Run({"description": "", "bill_kwh": 1, "shift": spec["shift"], "name": d["title"]}, (ROOT / "static/gallery" / Path(d["file"]).name).read_bytes())
    out, info = pipeline.scene_designer(run, spec, d["obs"], d["boxes_list"])
    P = json.loads(fp.read_text()) if fp.exists() else {}
    H = json.loads(fh.read_text()) if fh.exists() else {}
    P[pid] = {c["id"]: c["design"]["parts"] for c in out["spec"]["components"] if (c.get("design") or {}).get("parts")}
    H[pid] = out["spec"].get("hall", [])
    fp.write_text(json.dumps(P)); fh.write_text(json.dumps(H))
    print(pid, {k: len(v) for k, v in P[pid].items()}, len(H[pid]), "hall parts", round(info.get("usd", 0), 3), flush=True)
