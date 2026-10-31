"""Muse Spark designs each machine's 3D shape as a list of simple parts (boxes, cylinders, cones, spheres, tori).

The model writes DATA, never code: this module validates every part (shape, size, position inside the machine's floor slot,
colour, count) and the renderer (static/factory.js) draws only what passes. If the model fails or returns too little, the
machine keeps its built-in template shape, so a run never breaks.
"""
from __future__ import annotations

import re

from . import designer, meta

SHAPES = {"box", "cylinder", "cone", "sphere", "torus"}
ANIMS = {"spin_x", "spin_y", "spin_z", "slide_x"}
MAX_PARTS = 48
MAX_TOTAL = 170
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# half-width (x), half-depth (z) and height of the floor slot where each machine stands (same slots as the template shapes)
SLOT = {"pump": (5.5, 2.4, 5.0), "compressor": (5.0, 2.4, 5.5), "motors": (9.0, 2.2, 6.0), "hvac": (2.4, 1.6, 4.0), "standby": (1.9, 1.6, 3.2)}

SYSTEM = """You are the 3D Modeller agent of an industrial energy-audit pipeline. You model each machine of ONE facility so that it looks like the machine in the photo (when a photo is attached) or like a typical real machine of that kind.
You build every machine ONLY from simple parts. Return ONE JSON object and nothing else: {"machines":[{"id":str,"parts":[{"shape":"box|cylinder|cone|sphere|torus","pos":[x,y,z],"size":[...],"rot":[rx,ry,rz],"color":"#rrggbb","opacity":0.3-1,"anim":"spin_x|spin_y|spin_z|slide_x"}]}]}

FRAME AND UNITS: one unit is about 0.7 m. Origin = centre of the machine's floor slot, on the floor. x runs left to right, y is UP (0 = floor), z runs toward the viewer. pos is the CENTRE of each part, so a part resting on the floor has pos y = half its height. rot is in degrees: a cylinder stands upright by default; rot [0,0,90] lays it along x (motors, tanks, pipes, rollers); rot [90,0,0] lays it along z. anim (optional) marks moving parts while the machine runs: "spin_x|spin_y|spin_z" for turning parts (fan blades, impellers, flywheels, drums; at most 3 per machine) and "slide_x" for PRODUCTS riding a conveyor (bottles, boxes, tiles, bags: up to 12 small parts placed on the belt top, spaced evenly along x; they travel along the belt and wrap around, so keep them inside the belt length).
OPACITY (optional, default 1): use 0.35 to 0.6 for glass and clear plastic (bottles, windows, covers, tank sight glasses).
SIZES: box [width,height,depth]; cylinder [radius,height]; cone [radius,height]; sphere [radius]; torus [ring radius, tube radius] (a torus is a ring in the x-y plane: use it for handwheels, flanges and rings).
SLOT LIMITS (parts outside are clamped): pump skid x +-5.5, z +-2.4, height 5; compressor x +-5, z +-2.4, height 5.5; production line (motors) x +-9, z +-2.2, height 6; HVAC unit x +-2.4, z +-1.6, height 4; standby cabinet x +-1.9, z +-1.6, height 3.2.

HOW TO DESIGN (follow these steps in order for every machine):
1. LOOK at the photo and the machine's name and rating. Pick the real silhouette: tall or low, long or compact, what sits on top of what.
2. BUILD IN LAYERS. Layer 1: base plate or frame (dark #2b313a, thin box, 0.25 to 0.4 high). Layer 2: the 2 to 5 big bodies that give the machine its mass (motor, casing, tank, housing, drum). Layer 3: connections (pipes as thin cylinders of radius 0.12 to 0.25, legs, rails, guards). Layer 4: small details (handwheels as tori, gauges as short wide cylinders, control boxes, lamps as small spheres, bolts are NOT needed).
3. NOTHING FLOATS: every part must touch or overlap another part or the floor. Compute y from the part below it (for example a motor of height 2 standing on a 0.3 base has y = 0.3 + 1.0).
4. USE THE PHOTO'S COLOURS: blue pumps, red or orange compressors, grey steel housings, yellow guards. Give each machine one main colour, one accent colour, dark bases (#2b313a) and steel greys (#8b96a3, #c3cbd4). Avoid pure black and pure white.
5. SCALE: big bodies are big (a motor is 1.5 to 3 units long, a compressor receiver tank is 2.5 to 4 units long and 1.2 to 1.8 across, a conveyor frame spans the whole slot, a rooftop AC unit is about 4 by 3 by 2). Use 30 to 46 parts per machine (the machine that dominates the photo, the HERO, gets the most parts and the most height). Fill the slot: a production line spans nearly the full slot length (x from -8.5 to 8.5), a pump skid carries all its pumps side by side. Several identical units (for example 3 pumps, 5 presses, 8 looms) are separate part groups spaced evenly along x inside the slot.
6. MACHINE RECIPES. PUMP: base plate; motor cylinder laid along x; coupling guard (short cylinder); volute casing (wide short cylinder standing or a sphere); inlet and outlet pipes (thin cylinders); gate valve with a handwheel (torus on a short stem). SCREW COMPRESSOR: boxy enclosure; horizontal receiver tank (cylinder laid along x) beside or under it; gauge (flat cylinder); pipe stubs; legs. PRODUCTION LINE: ALWAYS include the line's big main machine (the tallest machine at the head of the line in the photo: a blow-moulder, filler, press, loom, kiln, mixer or extruder) as a tall detailed housing with a door, a top structure and a drive, THEN the long belt or frame (thin long box) on legs with rollers (cylinders along z), side rails and guards, products on the belt (mark them slide_x), and drive motors. Match the materials in the photo: stainless steel is light grey #c3cbd4, painted steel is the colour you see. AC OR CHILLER: box housing, round fan grille on top (cylinder + torus ring + spinning blade box), pipe connections, small legs. STANDBY CABINET: box, a door seam (thin dark box), a small red sphere for the standby lamp.
7. SURFACE DETAIL (this is what makes it look real, use many small parts): panel seams and doors as thin dark boxes on the housing; cooling fins on motors as 5 to 8 thin flat cylinders (rings) along the motor; flange rings as short wide cylinders at pipe ends; round pipe elbows as a small sphere at each corner; cable trays and rails as thin long boxes; warning stripes as thin yellow #f2c230 boxes on guards and frames; a nameplate as a tiny light box; indicator lamps as small spheres (green or red); bottles, boxes or products on conveyors as repeated small parts; legs and cross braces under frames.
8. CHECK before you answer: silhouette matches the photo, no floating part, 30 to 46 parts, colours from the photo, spinning parts marked, every id in the list answered.

FORMAT EXAMPLE (only to show the format and how parts attach; design YOUR machines from the photo, do not copy it): {"machines":[{"id":"pump_1","parts":[{"shape":"box","pos":[0,0.15,0],"size":[7,0.3,2.6],"color":"#2b313a"},{"shape":"cylinder","pos":[-1.6,1.35,0],"size":[0.8,2.4],"rot":[0,0,90],"color":"#2f6fb5"},{"shape":"cylinder","pos":[0.4,1.0,0],"size":[0.45,0.9],"rot":[0,0,90],"color":"#8b96a3"},{"shape":"cylinder","pos":[1.6,1.1,0],"size":[0.95,0.8],"rot":[0,0,90],"color":"#3d4651","anim":"spin_x"},{"shape":"cylinder","pos":[1.6,2.1,0],"size":[0.18,1.2],"color":"#8b96a3"},{"shape":"torus","pos":[1.6,2.8,0],"size":[0.35,0.07],"rot":[90,0,0],"color":"#d83a2e"}]}]}
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
            if p.get("opacity") is not None:
                op = _num(p.get("opacity"), 0.25, 1.0, 1.0)
                if op < 0.99:
                    part["opacity"] = round(op, 2)
            rot = _vec(p.get("rot"), 3, -360, 360, 0.0) if p.get("rot") is not None else None
            if rot and any(abs(r) > 0.01 for r in rot):
                part["rot"] = [round(r, 1) for r in rot]
            if p.get("anim") == "slide_x" and sum(1 for q in parts if q.get("anim") == "slide_x") < 16:
                part["anim"] = "slide_x"
            elif p.get("anim") in ANIMS and p.get("anim") != "slide_x" and sum(1 for q in parts if q.get("anim") and q["anim"] != "slide_x") < 3:
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
