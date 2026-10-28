"""Dev check: run the first agents (vision, SAM, twin, Scene Designer) on every gallery image and save the specs for visual review.
Costs real API calls (about 9 per image). Output: static/dev/designs.json (gitignored). Usage: python tools/test_designs.py [model]"""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if args:
    os.environ["DESIGN_MODEL"] = args[0]
from wattloop import pipeline, scene  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
items = json.loads((ROOT / "static/gallery/manifest.json").read_text())


PREV = {}
if "--redesign" in sys.argv and (ROOT / "static/dev/designs.json").exists():   # reuse vision, SAM and twin; only re-run the Scene Designer
    PREV = {d["id"]: d for d in json.loads((ROOT / "static/dev/designs.json").read_text())}


def one(it):
    img = scene.demo_png() if it["id"] == "demo" else (ROOT / "static/gallery" / Path(it["file"]).name).read_bytes()
    case = {"description": "", "bill_kwh": it["bill_kwh"], "shift": {"start": 6, "end": 22, "days_per_week": 6}, "name": it["title"]}
    run = pipeline.Run(case, img)
    t0 = time.time()
    if it["id"] in PREV:
        p = PREV[it["id"]]; obs, boxes = p["obs"], p["boxes_list"]
        spec = {k: v for k, v in p["spec"].items() if k != "extras"}; spec["components"] = [{k: v for k, v in c.items() if k != "design"} for c in spec["components"]]
    else:
        obs = pipeline.vision_reader(run)[0]
        boxes = pipeline.segmenter(run, obs)[0]["boxes"]
        spec = pipeline.twin_engineer(run, obs)[0]["spec"]
    out, info = pipeline.scene_designer(run, spec, obs, boxes)
    return {"id": it["id"], "title": it["title"], "file": it["file"], "spec": out["spec"], "notes": out["design"]["notes"], "fallback": info.get("fallback", False),
            "equipment": [e["phrase"] for e in obs.get("equipment", [])], "boxes": len(boxes), "obs": obs, "boxes_list": boxes, "seconds": round(time.time() - t0, 1), "usd": round(run.budget.usd, 4)}


with ThreadPoolExecutor(3) as ex:
    res = list(ex.map(one, items))
(ROOT / "static/dev").mkdir(exist_ok=True)
(ROOT / "static/dev/designs.json").write_text(json.dumps(res))
for r in res:
    print(r["id"], "fallback" if r["fallback"] else "model", len(r["spec"]["components"]), "machines", len(r["spec"].get("extras", [])), "props", r["seconds"], "s", "$", r["usd"], "|", r["notes"][:90])
print("total $", round(sum(r["usd"] for r in res), 3))
