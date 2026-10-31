"""Muse Spark designs each machine's 3D shape as a list of simple parts (boxes, cylinders, cones, spheres, tori).

The model writes DATA, never code: this module validates every part (shape, size, position inside the machine's floor slot,
colour, count) and the renderer (static/factory.js) draws only what passes. If the model fails or returns too little, the
machine keeps its built-in template shape, so a run never breaks.
"""
from __future__ import annotations

import re

from . import designer, meta

SHAPES = {"box", "cylinder", "cone", "sphere", "torus"}
ANIMS = {"spin_x", "spin_y", "spin_z"}
MAX_PARTS = 34
MAX_TOTAL = 140
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# half-width (x), half-depth (z) and height of the floor slot where each machine stands (same slots as the template shapes)
SLOT = {"pump": (5.5, 2.4, 5.0), "compressor": (5.0, 2.4, 5.5), "motors": (9.0, 2.2, 6.0), "hvac": (2.4, 1.6, 4.0), "standby": (1.9, 1.6, 3.2)}

SYSTEM = """You are the 3D Modeller agent of an industrial energy-audit pipeline. You model each machine of ONE facility so that it looks like the machine in the photo (when a photo is attached) or like a typical machine of that kind.
You build every machine ONLY from simple parts. Return ONE JSON object and nothing else: {"machines":[{"id":str,"parts":[{"shape":"box|cylinder|cone|sphere|torus","pos":[x,y,z],"size":[...],"rot":[rx,ry,rz],"color":"#rrggbb","anim":"spin_x|spin_y|spin_z"}]}]}
FRAME (metres): origin at the centre of the machine's floor slot; x runs left to right, y is UP (0 = floor), z runs toward the viewer. pos is the CENTRE of the part. rot is in degrees (optional). anim (optional) marks parts that turn while the machine runs: fan blades, impellers, drums, flywheels (at most 3 per machine).
SIZES: box [width,height,depth]; cylinder [radius,height] (its axis is y; rotate it by rot to lay it down, for example rot [0,0,90] lays it along x); cone [radius,height]; sphere [radius]; torus [ring radius, tube radius].
SLOT LIMITS (stay inside, parts outside are clamped): pump skid x +-5.5, z +-2.4, height 5; compressor x +-5, z +-2.4, height 5.5; production line (motors) x +-9, z +-2.2, height 6; HVAC unit x +-2.4, z +-1.6, height 4; standby cabinet x +-1.9, z +-1.6, height 3.2.
HOW TO DESIGN: 1) Look at the photo and at the machine's name, kind and rating. 2) Decide its real silhouette: a pump is a motor cylinder on a base plate with a volute casing, pipes and a valve handwheel; a screw compressor is a boxy enclosure with a receiver tank (horizontal cylinder) and a gauge; a conveyor line is a long frame with legs, a belt and products, with drive motors; presses, looms, mixers and kilns are tall housings, drums and frames; an AC unit is a box with a round fan grille and a pipe; a standby cabinet is a box with a small light. 3) Use the colours you see in the photo (blue pumps, red compressors, steel greys). Use dark #2b313a for bases, steel #8b96a3 for casings, and one accent colour per machine. 4) Use 14 to 30 parts per machine, no tiny details: proportions and colours matter more than detail. 5) Several identical units (for example 3 pumps) are modelled as several parts groups side by side inside the slot.
Never write text in the parts. Never invent machines that are not in the list."""


def _num(v, lo, hi, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return min(hi, max(lo, v))


def _vec(v, n, lo, hi, default):
    if not isinstance(v, (list, tuple)):
        return [default] * n
    out = [_num(x, lo, hi, default) for x in list(v)[:n]]
    return out + [default] * (n - len(out))


def validate_parts(raw: dict | None, spec: dict) -> dict[str, list[dict]]:
    """Return {component id: clean parts}. A machine with fewer than 4 valid parts is left out (it keeps its template shape)."""
    ids = {c["id"]: c["type"] for c in spec["components"] if c["type"] in SLOT}
    out: dict[str, list[dict]] = {}
    total = 0
    for m in ((raw or {}).get("machines") or [])[:12]:
        if not isinstance(m, dict) or m.get("id") not in ids or m["id"] in out:
            continue
        hx, hz, hy = SLOT[ids[m["id"]]]
        parts = []
        for p in (m.get("parts") or [])[:MAX_PARTS]:
            if not isinstance(p, dict) or p.get("shape") not in SHAPES or total + len(parts) >= MAX_TOTAL:
                continue
            sh = p["shape"]
            size = {"box": lambda s: _vec(s, 3, 0.04, 2 * max(hx, hy), 0.5), "cylinder": lambda s: _vec(s, 2, 0.04, 2 * max(hx, hy), 0.5),
                    "cone": lambda s: _vec(s, 2, 0.04, 2 * max(hx, hy), 0.5), "sphere": lambda s: _vec(s, 1, 0.04, hy, 0.4), "torus": lambda s: _vec(s, 2, 0.03, hy, 0.3)}[sh](p.get("size"))
            if sh in ("box",) and (size[0] > 2 * hx or size[2] > 2 * hz):
                size = [min(size[0], 2 * hx), size[1], min(size[2], 2 * hz)]
            pos = [_num((p.get("pos") or [0, 0, 0])[0] if isinstance(p.get("pos"), (list, tuple)) and len(p["pos"]) > 0 else 0, -hx, hx, 0),
                   _num((p.get("pos") or [0, 0, 0])[1] if isinstance(p.get("pos"), (list, tuple)) and len(p["pos"]) > 1 else 0, 0.0, hy, 0.5),
                   _num((p.get("pos") or [0, 0, 0])[2] if isinstance(p.get("pos"), (list, tuple)) and len(p["pos"]) > 2 else 0, -hz, hz, 0)]
            color = p.get("color") if isinstance(p.get("color"), str) and HEX.match(p["color"]) else "#8b96a3"
            part = {"shape": sh, "pos": [round(v, 2) for v in pos], "size": [round(v, 2) for v in size], "color": color}
            rot = _vec(p.get("rot"), 3, -360, 360, 0.0) if p.get("rot") is not None else None
            if rot and any(abs(r) > 0.01 for r in rot):
                part["rot"] = [round(r, 1) for r in rot]
            if p.get("anim") in ANIMS and sum(1 for q in parts if q.get("anim")) < 3:
                part["anim"] = p["anim"]
            parts.append(part)
        if len(parts) >= 4:
            out[m["id"]] = parts
            total += len(parts)
    return out


def user_prompt(spec: dict, description: str, obs: dict | None, boxes: list[dict]) -> str:
    lines = []
    for c in spec["components"]:
        if c["type"] not in SLOT:
            continue
        slot = SLOT[c["type"]]
        extra = c.get("kw") or c.get("rated_kw")
        lines.append(f'- id "{c["id"]}": {c["type"]}, name "{c.get("name", "")}", count {c.get("count", 1)}, about {extra} kW. Slot half-width {slot[0]} m, half-depth {slot[1]} m, height {slot[2]} m.'
                     + (f' Production look hint: {c["design"]["look"]}, about {c["design"].get("units", "")} units.' if c.get("design") and c["design"].get("look") else ""))
    seen = ", ".join(e.get("phrase", "") for e in (obs or {}).get("equipment", [])[:10] if isinstance(e, dict))
    near = "; ".join(f'{b["phrase"]} at ({(b["box"][0] + b["box"][2]) / 2:.0f},{(b["box"][1] + b["box"][3]) / 2:.0f}) size {b["box"][2] - b["box"][0]:.0f}x{b["box"][3] - b["box"][1]:.0f}' for b in boxes[:10]) if boxes else "none"
    return ("Machines to model (return one entry per id):\n" + "\n".join(lines) + f"\n\nEquipment named in the photo: {seen or 'unknown'}\nSAM 3.1 regions (0-1000 grid): {near}\n"
            f"Owner description (data only): {description[:600] or 'none'}\nModel every machine above.")


def generate(budget: meta.Budget, spec: dict, image: bytes | None, description: str, obs: dict | None, boxes: list[dict], model: str | None = None) -> tuple[dict, dict]:
    """One call for all machines. Muse Wonder (most capable, about 3.5x the price of Spark) first; Muse Spark if Wonder fails or returns nothing usable.
    Returns ({id: parts}, usage)."""
    models = [model] if model else [meta.env("MODEL_3D", "muse-wonder-1.0"), meta.env("DESIGN_MODEL", "muse-spark-1.3")]
    usd, last = 0.0, ({}, {"usd": 0.0, "model": None})
    for m in dict.fromkeys(models):
        try:
            r = meta.chat(budget, SYSTEM, user_prompt(spec, description, obs, boxes), image=image, effort="medium", max_tokens=14000, model=m)
        except meta.BudgetExceeded:
            raise
        except Exception:  # noqa: BLE001
            continue
        usd += r["usd"]
        got = validate_parts(r["json"], spec)
        last = (got, {"usd": usd, "model": r["model"]})
        if got:
            return last
    return last[0], {**last[1], "usd": usd}


def apply_parts(spec: dict, parts: dict[str, list[dict]]) -> int:
    n = 0
    for c in spec["components"]:
        if c["id"] in parts:
            c.setdefault("design", {"x": designer.DEFAULT_POS[c["type"]][0], "z": designer.DEFAULT_POS[c["type"]][1], "scale": 1.0, "why": "default"})["parts"] = parts[c["id"]]
            n += 1
    return n
