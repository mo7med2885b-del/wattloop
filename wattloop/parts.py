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
SLOT = {"pump": (5.5, 2.4, 5.0), "compressor": (5.0, 2.4, 5.5), "motors": (9.0, 3.6, 6.0), "hvac": (2.4, 1.6, 4.0), "standby": (1.9, 1.6, 3.2)}

SYSTEM = """You are the 3D Modeller agent of an industrial energy-audit pipeline. You model each machine of ONE facility so that it looks like the machine in the photo (when a photo is attached) or like a typical real machine of that kind.
You build every machine ONLY from simple parts. Return ONE JSON object and nothing else: {"machines":[{"id":str,"parts":[{"shape":"box|cylinder|cone|sphere|torus","pos":[x,y,z],"size":[...],"rot":[rx,ry,rz],"color":"#rrggbb","opacity":0.3-1,"anim":"spin_x|spin_y|spin_z|slide_x"}]}]}

FRAME AND UNITS: one unit is about 0.7 m. Origin = centre of the machine's floor slot, on the floor. x runs left to right, y is UP (0 = floor), z runs toward the viewer. pos is the CENTRE of each part, so a part resting on the floor has pos y = half its height. rot is in degrees: a cylinder stands upright by default; rot [0,0,90] lays it along x (motors, tanks, pipes, rollers); rot [90,0,0] lays it along z. anim (optional) marks moving parts while the machine runs: "spin_x|spin_y|spin_z" for turning parts (fan blades, impellers, flywheels, drums; at most 3 per machine) and "slide_x" for PRODUCTS riding a conveyor (bottles, boxes, tiles, bags: up to 12 small parts placed on the belt top, spaced evenly along x; they travel along the belt and wrap around, so keep them inside the belt length).
OPACITY (optional, default 1): use 0.35 to 0.6 for glass and clear plastic (bottles, windows, covers, tank sight glasses).
SIZES: box [width,height,depth]; cylinder [radius,height]; cone [radius,height]; sphere [radius]; torus [ring radius, tube radius] (a torus is a ring in the x-y plane: use it for handwheels, flanges and rings).
SLOT LIMITS (parts outside are clamped): pump skid x +-5.5, z +-2.4, height 5; compressor x +-5, z +-2.4, height 5.5; production line (motors) x +-9, z +-3.6, height 6; HVAC unit x +-2.4, z +-1.6, height 4; standby cabinet x +-1.9, z +-1.6, height 3.2.

HOW TO DESIGN (follow these steps in order for every machine):
1. LOOK at the photo and the machine's name and rating. Pick the real silhouette: tall or low, long or compact, what sits on top of what.
2. BUILD IN LAYERS. Layer 1: base plate or frame (dark #2b313a, thin box, 0.25 to 0.4 high). Layer 2: the 2 to 5 big bodies that give the machine its mass (motor, casing, tank, housing, drum). Layer 3: connections (pipes as thin cylinders of radius 0.12 to 0.25, legs, rails, guards). Layer 4: small details (handwheels as tori, gauges as short wide cylinders, control boxes, lamps as small spheres, bolts are NOT needed).
3. NOTHING FLOATS: every part must touch or overlap another part or the floor. Compute y from the part below it (for example a motor of height 2 standing on a 0.3 base has y = 0.3 + 1.0).
4. USE THE PHOTO'S COLOURS: blue pumps, red or orange compressors, grey steel housings, yellow guards. Give each machine one main colour, one accent colour, dark bases (#2b313a) and steel greys (#8b96a3, #c3cbd4). Avoid pure black and pure white.
5. SCALE: big bodies are big (a motor is 1.5 to 3 units long, a compressor receiver tank is 2.5 to 4 units long and 1.2 to 1.8 across, a conveyor frame spans the whole slot, a rooftop AC unit is about 4 by 3 by 2). Use 30 to 46 parts per machine (the machine that dominates the photo, the HERO, gets the most parts and the most height). Fill the slot: a production line spans nearly the full slot length (x from -8.5 to 8.5), a pump skid carries all its pumps side by side. Several identical units (for example 3 pumps, 5 presses, 8 looms) are separate part groups spaced evenly along x inside the slot.
6. MACHINE RECIPES. PUMP: base plate; motor cylinder laid along x; coupling guard (short cylinder); volute casing (wide short cylinder standing or a sphere); inlet and outlet pipes (thin cylinders); gate valve with a handwheel (torus on a short stem). SCREW COMPRESSOR: boxy enclosure; horizontal receiver tank (cylinder laid along x) beside or under it; gauge (flat cylinder); pipe stubs; legs. PRODUCTION LINE: ALWAYS include the line's big main machine (the tallest machine at the head of the line in the photo: a blow-moulder, filler, press, loom, kiln, mixer or extruder) as a tall detailed housing with a door, a top structure and a drive, THEN the long belt or frame (thin long box) on legs with rollers (cylinders along z), side rails and guards, products on the belt (mark them slide_x), and drive motors. Match the materials in the photo: stainless steel is light grey #c3cbd4, painted steel is the colour you see. AC OR CHILLER: box housing, round fan grille on top (cylinder + torus ring + spinning blade box), pipe connections, small legs. STANDBY CABINET: box, a door seam (thin dark box), a small red sphere for the standby lamp.
6b. COUNT AND PRODUCT RULES (very important for the production line): first COUNT the identical machines you can see in the photo (robot arms, presses, looms, fillers, mixers, lathes) and model that many, 2 to 8, as identical groups evenly spaced along x across the slot (or in two rows along z when the photo shows two rows); never model just one when the photo shows several. Then model the PRODUCT the plant makes, several units evenly spaced along the line and recognisable: a car body shell is a long low box plus a smaller cabin box plus four wheel cylinders (or an open frame with thin pillars), bottles, boxes, tiles, bags or steel coils as they are; mark products on a conveyor slide_x. Robot arms: a round base cylinder, a lower arm box tilted by rot, an upper arm box, a small wrist cylinder and a gripper, in the photo's colour (often orange or yellow).
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


def _clean(plist, hx: float, hz: float, hy: float, room: int, allow_anim: bool = True, limit: int = MAX_PARTS) -> list[dict]:
    """Validate one machine's or prop's parts inside its slot (half-width hx, half-depth hz, height hy)."""
    parts: list[dict] = []
    for p in (plist or [])[:limit]:
        if not isinstance(p, dict) or p.get("shape") not in SHAPES or len(parts) >= room:
            continue
        sh = p["shape"]
        big = 2 * max(hx, hy)
        size = {"box": lambda s: _vec(s, 3, 0.04, big, 0.5), "cylinder": lambda s: _vec(s, 2, 0.04, big, 0.5),
                "cone": lambda s: _vec(s, 2, 0.04, big, 0.5), "sphere": lambda s: _vec(s, 1, 0.04, hy, 0.4), "torus": lambda s: _vec(s, 2, 0.03, hy, 0.3)}[sh](p.get("size"))
        if sh == "box" and (size[0] > 2 * hx or size[2] > 2 * hz):
            size = [min(size[0], 2 * hx), size[1], min(size[2], 2 * hz)]
        raw = p.get("pos") if isinstance(p.get("pos"), (list, tuple)) else [0, 0, 0]
        raw = list(raw) + [0] * (3 - len(raw))
        pos = [_num(raw[0], -hx, hx, 0), _num(raw[1], 0.0, hy, 0.5), _num(raw[2], -hz, hz, 0)]
        color = p.get("color") if isinstance(p.get("color"), str) and HEX.match(p["color"]) else "#8b96a3"
        part = {"shape": sh, "pos": [round(v, 2) for v in pos], "size": [round(v, 2) for v in size], "color": color}
        if p.get("opacity") is not None:
            op = _num(p.get("opacity"), 0.25, 1.0, 1.0)
            if op < 0.99:
                part["opacity"] = round(op, 2)
        rot = _vec(p.get("rot"), 3, -360, 360, 0.0) if p.get("rot") is not None else None
        if rot and any(abs(r) > 0.01 for r in rot):
            part["rot"] = [round(r, 1) for r in rot]
        if allow_anim:
            if p.get("anim") == "slide_x" and sum(1 for q in parts if q.get("anim") == "slide_x") < 16:
                part["anim"] = "slide_x"
            elif p.get("anim") in ANIMS and p.get("anim") != "slide_x" and sum(1 for q in parts if q.get("anim") and q["anim"] != "slide_x") < 3:
                part["anim"] = p["anim"]
        parts.append(part)
    return parts


PROP_ROLES = {"machine_block", "tank", "column", "bin", "pump_skid"}


def eligible_props(spec: dict) -> dict[int, dict]:
    """The biggest structures of the hall that are not twin machines (furnaces, ovens, silos, filler blocks): the model may design them too."""
    out = []
    for i, x in enumerate(spec.get("extras") or []):
        if x.get("role") not in PROP_ROLES or (x.get("repeat") or {}).get("n", 1) > 3:
            continue
        sz = x.get("size") or [1, 1, 1]
        w, h, d = (2 * sz[0], sz[1], 2 * sz[0]) if x.get("shape") in ("cylinder", "hopper", "ribbed") else (sz[0], sz[1], sz[2] if len(sz) > 2 else sz[0])
        out.append((w * h * d, i, {"w": w, "h": h, "d": d, "x": x["pos"][0], "z": x["pos"][2], "role": x.get("role")}))
    return {i: v for _, i, v in sorted(out, key=lambda t: -t[0])[:5]}


def validate_parts(raw: dict | None, spec: dict) -> dict[str, list[dict]]:
    """Return {id: clean parts} for machines (by component id) and props ("prop_<extras index>"). Fewer than 10 valid parts = left out (the template or box stays)."""
    ids = {c["id"]: c["type"] for c in spec["components"] if c["type"] in SLOT}
    out: dict[str, list[dict]] = {}
    total = 0
    for m in ((raw or {}).get("machines") or [])[:12]:
        if not isinstance(m, dict) or m.get("id") not in ids or m["id"] in out:
            continue
        hx, hz, hy = SLOT[ids[m["id"]]]
        parts = _clean(m.get("parts"), hx, hz, hy, MAX_TOTAL - total)
        if len(parts) >= 10:
            out[m["id"]] = parts
            total += len(parts)
    props = eligible_props(spec)
    for m in ((raw or {}).get("props") or [])[:6]:
        if not isinstance(m, dict) or not isinstance(m.get("id"), str) or not m["id"].startswith("prop_"):
            continue
        try:
            k = int(m["id"][5:])
        except ValueError:
            continue
        if k not in props or m["id"] in out:
            continue
        v = props[k]
        parts = _clean(m.get("parts"), max(1.0, v["w"] / 2 * 1.1), max(0.8, v["d"] / 2 * 1.1), max(2.0, v["h"] * 1.3), MAX_TOTAL - total, allow_anim=False)
        if len(parts) >= 10:
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


_BODY = SYSTEM[SYSTEM.index("FRAME AND UNITS"):]
_BODY = re.sub(r"SLOT LIMITS[^\n]*\n", "", _BODY).replace('{"machines":[{"id":"pump_1"', '{"props":[{"id":"prop_0"').replace("Never invent machines that are not in the list.", "Never invent structures that are not in the list.")
PROPS_SYSTEM = ("You are the 3D Modeller agent of an industrial energy-audit pipeline. The hall of ONE facility contains big structures that dominate the photo but are not metered machines: furnaces, ovens, kilns, silos, tanks, filler or moulding blocks, big housings. "
                "Model each structure in the list so it looks like the one in the photo. Return ONE JSON object and nothing else: {\"props\":[{\"id\":str,\"parts\":[{\"shape\":\"box|cylinder|cone|sphere|torus\",\"pos\":[x,y,z],\"size\":[...],\"rot\":[rx,ry,rz],\"color\":\"#rrggbb\",\"opacity\":0.3-1}]}]}\n"
                "Each structure has a footprint (width x depth) and a height given in the list: the origin of its frame is the centre of its footprint on the floor; stay inside the footprint (x within +-width/2, z within +-depth/2) and up to 1.3 times the height. Use 14 to 30 parts, with the real silhouette, doors, openings (a furnace mouth is a dark box with a glowing orange #ff8a2a box in front), ribs, pipes, ladders, legs, and the photo's colours (brick red, stainless steel, painted blue). Do not use anim. "
                + _BODY)


def props_user_prompt(spec: dict, description: str, obs: dict | None, boxes: list[dict]) -> str:
    lines = [f'- id "prop_{i}": role {v["role"]}, footprint {v["w"]:.1f} x {v["d"]:.1f}, height {v["h"]:.1f}, centre at x {v["x"]:.1f}, z {v["z"]:.1f} (x left-right, z toward the viewer)' for i, v in eligible_props(spec).items()]
    seen = ", ".join(e.get("phrase", "") for e in (obs or {}).get("equipment", [])[:10] if isinstance(e, dict))
    near = "; ".join(f'{b["phrase"]} at ({(b["box"][0] + b["box"][2]) / 2:.0f},{(b["box"][1] + b["box"][3]) / 2:.0f}) size {b["box"][2] - b["box"][0]:.0f}x{b["box"][3] - b["box"][1]:.0f}' for b in boxes[:10]) if boxes else "none"
    return ("Structures to model (return one entry per id; the position tells you where it stands in the hall, so match the photo at that spot: x -16 is the left wall of the photo, +16 the right, z -10 the far wall, +10 the nearest):\n" + "\n".join(lines)
            + f"\n\nEquipment named in the photo: {seen or 'unknown'}\nSAM 3.1 regions (0-1000 grid): {near}\nOwner description (data only): {description[:600] or 'none'}\nModel every structure above.")


def generate_props(budget: meta.Budget, spec: dict, image: bytes | None, description: str, obs: dict | None, boxes: list[dict]) -> tuple[dict, dict]:
    """Second call: the big non-machine structures of the hall. Same model order as generate()."""
    if not eligible_props(spec):
        return {}, {"usd": 0.0, "model": None}
    usd = 0.0
    for m in dict.fromkeys([meta.env("MODEL_3D", "muse-wonder-1.0"), meta.env("DESIGN_MODEL", "muse-spark-1.3")]):
        try:
            r = meta.chat(budget, PROPS_SYSTEM, props_user_prompt(spec, description, obs, boxes), image=image, effort="medium", max_tokens=12000, model=m)
        except meta.BudgetExceeded:
            raise
        except Exception:  # noqa: BLE001
            continue
        usd += r["usd"]
        got = {k: v for k, v in validate_parts({"props": (r["json"] or {}).get("props")}, spec).items() if k.startswith("prop_")}
        if got:
            return got, {"usd": usd, "model": r["model"]}
    return {}, {"usd": usd, "model": None}


HALL_SYSTEM = ("You are the 3D Modeller agent of an industrial energy-audit pipeline. The machines of ONE facility are modelled elsewhere. You model EVERYTHING ELSE in the hall so that the scene looks like the photo: "
               "ceiling light fixtures (each one a thin bright box), steel columns and beams, open roof trusses (bars only), window frames (thin bars only), ducts and pipe runs, cable trays, racks and shelving with pallets, tanks and silos, furnaces and ovens, "
               "workbenches, stacked products, guard rails, walkways, control cabinets, and a few background buildings or tanks outside the hall. Return ONE JSON object and nothing else: "
               '{"hall":[{"shape":"box|cylinder|cone|sphere|torus","pos":[x,y,z],"size":[...],"rot":[rx,ry,rz],"color":"#rrggbb","opacity":0.3-1}]}\n'
               "FRAME (metres): the hall floor is x from -16 to 16 and z from -10 to 10 (z positive toward the viewer, y up, 0 = floor); pos is the CENTRE of each part; you may also place things outside the floor up to x +-32 and z +-18 for the background. "
               "The machines stand in these slots, so keep them free: pumps near x -8 z 6; compressor near x 7 z 5.4; production line along x -9 to 9 at z -3.6; AC unit near x 10 z -9.3; standby cabinet near x -13.5 z -3.6 (the layout may move them; stay clear of the middle band). "
               "NO OVERHEAD STRUCTURE (very important): do not model anything above height 6 except ceiling light fixtures (thin bright boxes hanging at y 6.5 to 7.5). No roof, no roof beams, no trusses, no overhead bars, no ceiling grid. Columns stop at height 6. The hall is OPEN to the sky. "
               "OPEN FRAME RULE: the hall floor area is an open space with standing structure only. NEVER model a roof, a ceiling, a floor slab or any wall or solid panel: no box wider than 6 and deeper than 6 that is thin, no big flat sheet of any kind. Build structure only from thin bars (columns up to height 6, rails, braces, low ducts and pipes, each under 0.6 thick) so that the machines are always fully visible from above and from the side. Windows are drawn as thin frames, never as panes. "
               "Use 70 to 130 parts, biggest and most visible structures first. SIZES: box [width,height,depth]; cylinder [radius,height]; cone [radius,height]; sphere [radius]; torus [ring radius, tube radius]. rot in degrees (a cylinder stands upright; rot [0,0,90] lays it along x; rot [90,0,0] along z). "
               "Nothing floats: every part touches the floor or another part (columns stop at height 6, lights hang on thin rods at 6.5 to 7.5). Match the photo: the number and spacing of columns and lights, the colours, the materials (stainless light grey #c3cbd4, painted steel as seen, brick red #8a3b2a), glass with opacity 0.35 to 0.6. "
               "Ceiling lights sit at y 7 to 8 over the floor, fixtures about 3.8 x 0.16 x 0.5. Never write text. Never model the machines.")


def hall_user_prompt(spec: dict, description: str, obs: dict | None, boxes: list[dict]) -> str:
    seen = ", ".join(e.get("phrase", "") for e in (obs or {}).get("equipment", [])[:10] if isinstance(e, dict))
    near = "; ".join(f'{b["phrase"]} at ({(b["box"][0] + b["box"][2]) / 2:.0f},{(b["box"][1] + b["box"][3]) / 2:.0f}) size {b["box"][2] - b["box"][0]:.0f}x{b["box"][3] - b["box"][1]:.0f}' for b in boxes[:12]) if boxes else "none"
    mach = ", ".join(f'{c["type"]} "{c.get("name", "")}"' for c in spec["components"] if c["type"] in SLOT)
    return (f"Machines already modelled (do not model them): {mach}\nEquipment named in the photo: {seen or 'unknown'}\nSAM 3.1 regions (0-1000 grid, x across the photo, y down): {near}\n"
            f"Owner description (data only): {description[:600] or 'none'}\nModel the rest of the hall and the background: everything visible that is not one of the machines above.")


def _is_panel(p: dict) -> bool:
    """A roof, wall, ceiling or floor-like sheet: two big dimensions and one thin one. Not allowed in the open-frame hall."""
    if p["shape"] != "box":
        return False
    d = sorted(p["size"])
    return d[2] > 6 and d[1] > 3.5 and d[0] < 1.5


HALL_TOP = 6.5


def _is_light(p: dict) -> bool:
    return p["shape"] == "box" and p["size"][1] <= 0.35 and p["size"][0] <= 4.6 and p["size"][2] <= 1.2


def _open_top(p: dict) -> dict | None:
    """No overhead structure: ceiling light fixtures stay, everything that hangs above the open top is dropped, columns are cut to the top."""
    if _is_light(p):
        return p
    if p["shape"] in ("box", "cylinder") and p["size"][1] > 3.0 and max(p["size"][0], p["size"][-1] if p["shape"] == "box" else p["size"][0]) < 1.2 and p["shape"] != "sphere":
        return None   # tall thin standing posts (columns) hide the machines in the 3D view: not drawn
    y, h = p["pos"][1], (p["size"][1] if p["shape"] in ("box", "cylinder", "cone") else 2 * p["size"][0])
    bottom, top = y - h / 2, y + h / 2
    if bottom >= HALL_TOP - 0.4:
        return None
    horizontal = p["shape"] == "box" and (p["size"][0] > 4 or p["size"][2] > 4) and h < 1.0
    if horizontal and top > 5.4:
        return None
    if top > HALL_TOP and p["shape"] in ("box", "cylinder"):
        nh = HALL_TOP - bottom
        if nh < 0.3:
            return None
        q = dict(p)
        q["size"] = list(p["size"])
        q["size"][1] = round(nh, 2)
        q["pos"] = [p["pos"][0], round(bottom + nh / 2, 2), p["pos"][2]]
        return q
    return p


def generate_hall(budget: meta.Budget, spec: dict, image: bytes | None, description: str, obs: dict | None, boxes: list[dict]) -> tuple[list[dict], dict]:
    """Full-AI scene: Muse Wonder designs lights, columns, ducts, racks, tanks, furnaces and the background too (validated parts, no templates)."""
    usd = 0.0
    for m in dict.fromkeys([meta.env("MODEL_3D", "muse-wonder-1.0"), meta.env("DESIGN_MODEL", "muse-spark-1.3")]):
        try:
            r = meta.chat(budget, HALL_SYSTEM, hall_user_prompt(spec, description, obs, boxes), image=image, effort="medium", max_tokens=16000, model=m)
        except meta.BudgetExceeded:
            raise
        except Exception:  # noqa: BLE001
            continue
        usd += r["usd"]
        plist = (r["json"] or {}).get("hall")
        got = [q for q in (_open_top(p) for p in _clean(plist, 32.0, 18.0, 10.0, 150, allow_anim=False, limit=150) if not _is_panel(p)) if q]
        if len(got) >= 20:
            return got, {"usd": usd, "model": r["model"]}
    return [], {"usd": usd, "model": None}


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
    extras = spec.get("extras") or []
    for key, plist in parts.items():
        if key.startswith("prop_"):
            try:
                extras[int(key[5:])]["parts"] = plist
                n += 1
            except (ValueError, IndexError):
                pass
    return n
