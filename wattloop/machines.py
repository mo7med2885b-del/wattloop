"""Machine list: the plant's own chart. Users pick common machines and give counts, kW and hours; the twin is built from them.

Typical kW values are placeholders (round standard motor and plant sizes), UNVERIFIED as averages: the picker marks them
"typical, replace with yours". A kW the user typed is trusted; a typical one lowers the confidence label.
"""
from __future__ import annotations

# kind -> twin type, label, typical kW (each), typical hours/day (None = whole shift), twin defaults
CATALOG = {
    "pump": {"type": "pump", "label": "Pump (water, process, cooling)", "kw": 15.0, "hours": None, "extra": {"flow_demand": 0.8, "vsd": False, "static_share": 0.3}},
    "compressor": {"type": "compressor", "label": "Air compressor", "kw": 37.0, "hours": None, "extra": {"air_demand": 0.5, "leak": 0.2, "control": "modulating"}},
    "fan": {"type": "motors", "label": "Fan or blower", "kw": 15.0, "hours": None, "extra": {"load_factor": 0.7}},
    "conveyor": {"type": "motors", "label": "Conveyor", "kw": 5.5, "hours": None, "extra": {"load_factor": 0.6}},
    "mixer": {"type": "motors", "label": "Mixer or agitator", "kw": 22.0, "hours": None, "extra": {"load_factor": 0.7}},
    "motor": {"type": "motors", "label": "Other electric motor drive", "kw": 30.0, "hours": None, "extra": {"load_factor": 0.6}},
    "lighting_t8": {"type": "lighting", "label": "Lighting: fluorescent (T8)", "kw": 10.0, "hours": None, "extra": {"legacy": "t8", "led": False, "after_hours_h": 0}},
    "lighting_t12": {"type": "lighting", "label": "Lighting: older fluorescent (T12)", "kw": 10.0, "hours": None, "extra": {"legacy": "t12", "led": False, "after_hours_h": 0}},
    "lighting_hid": {"type": "lighting", "label": "Lighting: high-bay metal halide", "kw": 10.0, "hours": None, "extra": {"legacy": "metal_halide", "led": False, "after_hours_h": 0}},
    "lighting_led": {"type": "lighting", "label": "Lighting: LED (already)", "kw": 10.0, "hours": None, "extra": {"legacy": "t8", "led": True, "after_hours_h": 0}},
    "hvac": {"type": "hvac", "label": "Air conditioning or chiller", "kw": 60.0, "hours": 8, "extra": {"setpoint_c": 22.0}},
    "standby": {"type": "standby", "label": "Equipment left on standby", "kw": 3.0, "hours": None, "extra": {}},
}
MAX_MACHINES = 12


def catalog() -> list[dict]:
    return [{"kind": k, "label": v["label"], "kw": v["kw"], "hours": v["hours"], "type": v["type"]} for k, v in CATALOG.items()]


def clean(rows) -> list[dict]:
    """Validate rows from the browser: unknown kinds dropped, numbers clamped. Text is data."""
    out = []
    for r in (rows or [])[:MAX_MACHINES]:
        if not isinstance(r, dict) or r.get("kind") not in CATALOG:
            continue
        cat = CATALOG[r["kind"]]
        try:
            count = int(min(50, max(1, float(r.get("count", 1)))))
            kw = float(r.get("kw", cat["kw"]))
            hours = None if r.get("hours") in (None, "") else float(r["hours"])
        except (TypeError, ValueError):
            continue
        if not kw > 0:
            continue
        src = "user" if r.get("kw_source") == "user" else "typical"
        row = {"kind": r["kind"], "name": str(r.get("name") or cat["label"])[:50], "count": count, "kw": min(5000.0, kw), "kw_source": src}
        if hours is not None and hours > 0:
            row["hours"] = min(24.0, hours)
        for k, lo, hi in (("setpoint_c", 16.0, 30.0), ("after_hours_h", 0.0, 8.0)):   # optional facts the user may know
            if r.get(k) not in (None, ""):
                try:
                    row[k] = min(hi, max(lo, float(r[k])))
                except (TypeError, ValueError):
                    pass
        if r.get("control") in ("modulating", "load_unload", "vsd"):
            row["control"] = r["control"]
        if r.get("vsd") is True:
            row["vsd"] = True
        if r.get("id"):
            row["id"] = str(r["id"])[:16]
        out.append(row)
    return out


def spec_from_machines(rows: list[dict], shift: dict, name: str = "Your facility") -> dict:
    """Build the twin spec directly from the user's machine list. Ratings are locked: calibration may tune utilisation, never the nameplate."""
    n = max(1, shift["end"] - shift["start"])
    comps, seen = [], set()
    for i, r in enumerate(rows):
        cat = CATALOG[r["kind"]]
        t = cat["type"]
        cid = "".join(ch for ch in str(r.get("id") or f"{r['kind']}{i + 1}").lower() if ch.isalnum() or ch == "_")[:16] or f"m{i + 1}"
        while cid in seen:
            cid += "x"
        seen.add(cid)
        hours = min(n, r.get("hours") or (cat["hours"] if cat["hours"] else n))
        c = {"id": cid, "type": t, "name": r["name"], "locked": True, "kw_source": r["kw_source"], "kind": r["kind"], **cat["extra"]}
        for k in ("setpoint_c", "after_hours_h", "control", "vsd"):
            if k in r and k in cat["extra"]:
                c[k] = r[k]
        c["detail_known"] = [k for k in ("setpoint_c", "after_hours_h", "control", "vsd") if k in r and k in c]
        if r.get("hours"):
            c["hours_user"] = True   # hours the user gave are facts: calibration must not change them
        total = r["kw"] * r["count"]
        if t == "pump":
            c.update(count=r["count"], rated_kw=r["kw"], hours=hours)
        elif t == "compressor":
            c.update(rated_kw=total, hours=hours)
        elif t == "standby":
            c.update(kw=total)
        else:
            c.update(kw=total, hours=hours)
        comps.append(c)
    return {"name": name, "shift": shift, "components": comps}


def from_spec(spec: dict) -> list[dict]:
    """Machine rows describing a spec (used to show the demo plants' machine lists)."""
    rows = []
    for c in spec["components"]:
        t = c["type"]
        if t == "pump":
            kind, kw, count = "pump", c["rated_kw"], c["count"]
        elif t == "compressor":
            kind, kw, count = "compressor", c["rated_kw"], 1
        elif t == "lighting":
            kind = "lighting_led" if c.get("led") else {"t12": "lighting_t12", "metal_halide": "lighting_hid"}.get(c.get("legacy"), "lighting_t8")
            kw, count = c["kw"], 1
        elif t == "hvac":
            kind, kw, count = "hvac", c["kw"], 1
        elif t == "standby":
            kind, kw, count = "standby", c["kw"], 1
        elif t == "motors":
            kind, kw, count = "motor", c["kw"], 1
        else:
            continue
        row = {"kind": kind, "name": c.get("name", kind), "count": count, "kw": round(kw, 1), "kw_source": "user", "id": c["id"]}
        for k in ("setpoint_c", "after_hours_h", "control"):
            if k in c and t in ("hvac", "lighting", "compressor"):
                row[k] = c[k]
        if c.get("hours"):
            row["hours"] = round(c["hours"], 1)
        rows.append(row)
    return rows


def basis(spec: dict) -> str:
    """How the ratings were obtained: user (typed by the user), typical (catalog defaults) or guessed (inferred from the bill)."""
    locked = [c for c in spec["components"] if c.get("locked") and c.get("kw_source") != "inferred"]
    if not locked:
        return "guessed"
    return "user" if all(c.get("kw_source") == "user" for c in locked) else "typical"


def tune_utilisation(spec: dict, bill: float, monthly) -> float:
    """Match the bill without touching locked ratings: scale how hard each machine works (flow, air demand, load factor).
    If the machines cannot reach the bill, add a clearly labelled 'unlisted loads' block for the missing kWh. Returns that unlisted kW (0 if none)."""
    from . import twin
    for _ in range(8):
        kwh = monthly(spec)
        k = bill / max(1.0, kwh)
        if abs(k - 1) < 0.01:
            break
        for c in spec["components"]:
            if not c.get("locked"):
                continue
            if c.get("kw_source") == "typical":   # a catalog value is a placeholder: scale it like a guess instead of trusting it
                for f in ("kw", "rated_kw"):
                    if f in c:
                        c[f] = min(c[f] * k, 3000.0)
                continue
            if c["type"] == "pump":
                c["flow_demand"] = min(1.0, max(0.3, c["flow_demand"] * k))
            elif c["type"] == "compressor":
                c["air_demand"] = min(max(0.1, 0.97 - c["leak"]), max(0.1, c["air_demand"] * k))
            elif c["type"] == "motors":
                c["load_factor"] = min(1.0, max(0.2, c["load_factor"] * k))
    gap = bill - monthly(spec)
    if gap > 0.03 * bill:   # the listed machines cannot explain the bill: say so instead of inflating them
        days = spec["shift"]["days_per_week"] * twin.DAYS_PER_MONTH
        n = max(1, spec["shift"]["end"] - spec["shift"]["start"])
        kw = gap / (n * days)
        spec["components"].append({"id": "unlisted", "type": "motors", "name": "Unlisted loads (balance to the bill)", "kw": kw, "hours": n, "load_factor": 1.0, "locked": True, "kw_source": "inferred", "kind": "motor"})
        return kw
    return 0.0
