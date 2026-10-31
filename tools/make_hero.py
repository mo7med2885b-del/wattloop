"""Design the HERO demo plant (Delta Foods) with the real pipeline step: layout + props + Muse Wonder machine shapes for the demo's own component ids.
Costs about 3 model calls (~$0.3). Usage: python tools/make_hero.py <tag>   -> static/dev/hero_<tag>.json (gitignored)
Then: python tools/make_hero.py --save <tag>  copies it to wattloop/data/demo_design.json (used by the instant Demo)."""
import copy
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from wattloop import demo, pipeline, scene  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
if sys.argv[1] == "--save":
    spec = json.loads((ROOT / f"static/dev/hero_{sys.argv[2]}.json").read_text())
    out = {"components": {c["id"]: c["design"] for c in spec["components"] if c.get("design")}, "extras": spec.get("extras", [])}
    (ROOT / "wattloop/data/demo_design.json").write_text(json.dumps(out))
    print("saved", {k: len(v.get("parts", [])) for k, v in out["components"].items()}, len(out["extras"]), "extras", sum(1 for x in out["extras"] if x.get("parts")), "with parts")
    sys.exit()

d = {x["id"]: x for x in json.loads((ROOT / "static/dev/designs.json").read_text())}["demo"]   # vision + SAM results for the demo photo
spec = copy.deepcopy(demo.TRUTH)
case = {"description": demo.DESCRIPTION, "bill_kwh": demo.case()["bill_kwh"], "shift": spec["shift"], "name": spec["name"]}
run = pipeline.Run(case, scene.demo_png())
t0 = time.time()
out, info = pipeline.scene_designer(run, spec, d["obs"], d["boxes_list"])
(ROOT / "static/dev" / f"hero_{sys.argv[1]}.json").write_text(json.dumps(out["spec"]))
print(sys.argv[1], "seconds", round(time.time() - t0, 1), "$", round(info.get("usd", 0), 3), info.get("note"), [(c["id"], len((c.get("design") or {}).get("parts", []))) for c in out["spec"]["components"]], "extras with parts:", sum(1 for x in out["spec"].get("extras", []) if x.get("parts")))
