"""Collect the model-designed machine parts of the demo plants into wattloop/data/demo_parts.json ({plant id: {component id: parts}}).
Reads static/dev/parts_<id>.json written by tools/test_parts.py or the batch generator. Usage: python tools/merge_demo_parts.py [suffix]"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
suffix = sys.argv[1] if len(sys.argv) > 1 else ""
out = {}
for f in sorted((ROOT / "static/dev").glob(f"parts_*{suffix}.json")):
    pid = f.stem[len("parts_"):]
    if suffix:
        pid = pid[: -len(suffix)]
    d = json.loads(f.read_text())
    if "components" in d:   # written by test_parts.py as a whole spec
        d = {c["id"]: c["design"]["parts"] for c in d["components"] if c.get("design") and c["design"].get("parts")}
    out[pid] = d
(ROOT / "wattloop/data/demo_parts.json").write_text(json.dumps(out))
print({k: sum(len(v) for v in d.values()) for k, d in out.items()})
