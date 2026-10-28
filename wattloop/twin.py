"""Deterministic energy twin: physics-lite component models, a fix catalog and a verifier.

Everything here is plain code. Models only propose parameters; this module computes.
Defaults tagged ASSUMPTION are editable placeholders, not measured Egyptian figures.
"""
from __future__ import annotations

import copy

DAYS_PER_MONTH = 4.33  # weeks per month

# Scenario parameter sets for sensitivity (low / base / high savings).
PARAMS = {
    "tariff_egp_per_kwh": 2.55,       # UNVERIFIED blog figure for medium-voltage industry; user-editable (docs/research/egypt-energy.md)
    "grid_kgco2_per_kwh": 0.447,      # UNVERIFIED search-snippet figure; user-editable
    "pv_kwh_per_kwp_day": 5.0,        # PVGIS Cairo 1,827 kWh/kWp/yr (docs/research/egypt-energy.md)
    "led_factor": 0.5,                # LED draws about half of the old lamp power (ASSUMPTION)
    "hvac_pct_per_c": 0.06,           # HVAC power change per degree of setpoint (ASSUMPTION)
    "capex_vsd_egp_per_kw": 4500.0,   # ASSUMPTION
    "capex_leak_egp": 15000.0,        # ASSUMPTION per audit and repair
    "capex_led_egp_per_kw": 6000.0,   # ASSUMPTION
    "capex_controls_egp": 8000.0,     # ASSUMPTION
    "capex_standby_egp": 3000.0,      # ASSUMPTION
    "capex_pv_egp_per_kwp": 18000.0,  # ASSUMPTION
    "capex_hvac_egp": 0.0,
}
SENSITIVITY = {"low": 0.8, "base": 1.0, "high": 1.2}  # scales waste-related savings assumptions


def hours_in_window(spec: dict) -> list[int]:
    s, e = spec["shift"]["start"], spec["shift"]["end"]
    return list(range(s, e))


def _mask(hours: float, window: list[int]) -> list[float]:
    """Component runs for the first `hours` hours of the shift window (fractional last hour)."""
    out = [0.0] * 24
    left = max(0.0, min(hours, len(window)))
    for h in window:
        take = min(1.0, left)
        out[h] = take
        left -= take
        if left <= 0:
            break
    return out


def component_power_kw(c: dict, params: dict) -> float:
    """Average electrical power while the component runs."""
    t = c["type"]
    if t == "pump":
        f = c["flow_demand"]
        frac = (f ** 3) / 0.95 + 0.02 if c.get("vsd") else 0.55 + 0.45 * f
        return c["count"] * c["rated_kw"] * frac
    if t == "compressor":
        load = min(1.0, c["air_demand"] + c["leak"])
        return c["rated_kw"] * (0.25 + 0.75 * load)
    if t == "lighting":
        return c["kw"] * (params["led_factor"] if c.get("led") else 1.0)
    if t == "hvac":
        return max(0.0, c["kw"] * (1 - params["hvac_pct_per_c"] * (c["setpoint_c"] - 22.0)))
    if t == "motors":
        return c["kw"] * c["load_factor"]
    return 0.0


def hourly_kw(spec: dict, params: dict | None = None, split: bool = False):
    p = {**PARAMS, **(params or {})}
    window = hours_in_window(spec)
    total = [0.0] * 24
    parts: dict[str, list[float]] = {}
    for c in spec["components"]:
        t = c["type"]
        if t == "pv":
            prof = [0.0] * 24
            for h in range(6, 18):
                prof[h] = -c["kwp"] * p["pv_kwh_per_kwp_day"] / 12.0
            parts[c["id"]] = prof
            continue
        if t == "standby":
            prof = [0.0] * 24
            for h in range(24):
                if h not in window and not c.get("auto_off"):
                    prof[h] = c["kw"]
            parts[c["id"]] = prof
            continue
        pw = component_power_kw(c, p)
        run = _mask(c.get("hours", len(window)), window)
        prof = [pw * r for r in run]
        if t == "lighting" and c.get("after_hours_h", 0) > 0 and not c.get("controls"):
            extra = c["after_hours_h"]
            for h in range(24):
                if h not in window and extra > 0:
                    prof[h] += pw * min(1.0, extra)
                    extra -= 1
        parts[c["id"]] = prof
    for prof in parts.values():
        for h in range(24):
            total[h] += prof[h]
    # PV can only offset load, never export in this model
    net = [max(0.0, v) for v in total]
    return (net, parts) if split else net


def monthly_kwh(spec: dict, params: dict | None = None) -> float:
    day = sum(hourly_kw(spec, params))
    return day * spec["shift"]["days_per_week"] * DAYS_PER_MONTH + _offday_kwh(spec, params)


def _offday_kwh(spec: dict, params: dict | None = None) -> float:
    """Standby and after-hours lighting on non-working days."""
    p = {**PARAMS, **(params or {})}
    off_days = (7 - spec["shift"]["days_per_week"]) * DAYS_PER_MONTH
    kwh = 0.0
    for c in spec["components"]:
        if c["type"] == "standby" and not c.get("auto_off"):
            kwh += c["kw"] * 24 * off_days
    return kwh


def breakdown_kwh(spec: dict, params: dict | None = None) -> dict[str, float]:
    _, parts = hourly_kw(spec, params, split=True)
    wd = spec["shift"]["days_per_week"] * DAYS_PER_MONTH
    out = {cid: round(sum(v) * wd, 1) for cid, v in parts.items()}
    for c in spec["components"]:
        if c["type"] == "standby" and not c.get("auto_off"):
            out[c["id"]] = round(out[c["id"]] + c["kw"] * 24 * (7 - spec["shift"]["days_per_week"]) * DAYS_PER_MONTH, 1)
    return out


# ------------------------------------------------------------------ fixes
FIX_TYPES = ["vsd_pump", "repair_leaks", "led_retrofit", "lighting_controls", "hvac_setpoint", "standby_shutdown", "solar_pv"]


class FixError(ValueError):
    pass


def apply_fix(spec: dict, fix: dict, params: dict | None = None) -> tuple[dict, float]:
    """Return (new_spec, capex_egp). Raises FixError if the fix is not valid for this facility."""
    p = {**PARAMS, **(params or {})}
    s = copy.deepcopy(spec)
    by_id = {c["id"]: c for c in s["components"]}
    t = fix.get("type")
    tid = fix.get("target")
    capex = 0.0
    if t == "vsd_pump":
        c = by_id.get(tid)
        if not c or c["type"] != "pump":
            raise FixError(f"{tid} is not a pump")
        if c.get("vsd"):
            raise FixError(f"{tid} already has a variable-speed drive")
        c["vsd"] = True
        capex = p["capex_vsd_egp_per_kw"] * c["rated_kw"] * c["count"]
    elif t == "repair_leaks":
        c = by_id.get(tid)
        if not c or c["type"] != "compressor":
            raise FixError(f"{tid} is not a compressor")
        target = float(fix.get("target_leak", 0.05))
        if not 0.0 <= target < c["leak"]:
            raise FixError(f"target leak {target} must be below the current leak {c['leak']:.2f}")
        c["leak"] = target
        capex = p["capex_leak_egp"]
    elif t == "led_retrofit":
        c = by_id.get(tid)
        if not c or c["type"] != "lighting" or c.get("led"):
            raise FixError(f"{tid} cannot take an LED retrofit")
        c["led"] = True
        capex = p["capex_led_egp_per_kw"] * c["kw"]
    elif t == "lighting_controls":
        c = by_id.get(tid)
        if not c or c["type"] != "lighting" or c.get("controls"):
            raise FixError(f"{tid} cannot take lighting controls")
        c["controls"] = True
        capex = p["capex_controls_egp"]
    elif t == "hvac_setpoint":
        c = by_id.get(tid)
        if not c or c["type"] != "hvac":
            raise FixError(f"{tid} is not an HVAC unit")
        new = float(fix.get("setpoint_c", c["setpoint_c"] + 2))
        if new <= c["setpoint_c"]:
            raise FixError("new setpoint must be higher than the current one to save cooling energy")
        c["setpoint_c"] = new
        capex = p["capex_hvac_egp"]
    elif t == "standby_shutdown":
        c = by_id.get(tid)
        if not c or c["type"] != "standby" or c.get("auto_off"):
            raise FixError(f"{tid} has no standby load to switch off")
        c["auto_off"] = True
        capex = p["capex_standby_egp"]
    elif t == "solar_pv":
        kwp = float(fix.get("kwp", 0))
        if kwp <= 0:
            raise FixError("kwp must be positive")
        if "pv" in by_id:
            raise FixError("PV already installed")
        s["components"].append({"id": "pv", "type": "pv", "name": "Rooftop solar", "kwp": kwp})
        capex = p["capex_pv_egp_per_kwp"] * kwp
    else:
        raise FixError(f"unknown fix type {t!r}")
    return s, capex


def check_service(before: dict, after: dict) -> list[str]:
    """Hard constraints: a fix may not cut the service the plant needs. Returns violations."""
    bad = []
    bc = {c["id"]: c for c in before["components"]}
    for c in after["components"]:
        o = bc.get(c["id"])
        if not o:
            continue
        t = c["type"]
        if t == "pump" and c.get("vsd") and c["flow_demand"] < 0.3:
            bad.append(f"{c['id']}: required flow {c['flow_demand']:.2f} is below the 30% minimum safe drive speed")
        if t == "compressor" and c["air_demand"] + c["leak"] > 1.0:
            bad.append(f"{c['id']}: air demand plus leaks exceeds compressor capacity")
        if t == "hvac" and c["setpoint_c"] > 26.0:
            bad.append(f"{c['id']}: setpoint {c['setpoint_c']:.0f} C is above the 26 C comfort/process limit")
        if t in ("pump", "compressor", "lighting", "motors") and c.get("hours") != o.get("hours"):
            bad.append(f"{c['id']}: operating hours changed (production would be cut)")
        if t == "pump" and c["flow_demand"] != o["flow_demand"]:
            bad.append(f"{c['id']}: delivered flow changed")
    return bad


def evaluate(spec: dict, fixes: list[dict], params: dict | None = None) -> dict:
    """Apply fixes in order, verify service constraints and report savings."""
    base_kwh = monthly_kwh(spec, params)
    p = {**PARAMS, **(params or {})}
    cur, capex = spec, 0.0
    for f in fixes:
        cur, cx = apply_fix(cur, f, params)
        capex += cx
    problems = check_service(spec, cur)
    new_kwh = monthly_kwh(cur, params)
    saved = base_kwh - new_kwh
    egp_year = saved * 12 * p["tariff_egp_per_kwh"]
    return {
        "spec": cur,
        "violations": problems,
        "base_kwh_month": round(base_kwh, 1),
        "new_kwh_month": round(new_kwh, 1),
        "saved_kwh_month": round(saved, 1),
        "saved_egp_year": round(egp_year),
        "co2_t_year": round(saved * 12 * p["grid_kgco2_per_kwh"] / 1000.0, 2),
        "capex_egp": round(capex),
        "payback_months": round(capex / (egp_year / 12), 1) if egp_year > 0 and capex > 0 else (0.0 if capex == 0 and egp_year > 0 else None),
        "hourly_before": [round(v, 2) for v in hourly_kw(spec, params)],
        "hourly_after": [round(v, 2) for v in hourly_kw(cur, params)],
    }


def sensitivity(spec: dict, fixes: list[dict]) -> dict:
    """Re-run the plan with waste-related assumptions scaled low/base/high."""
    out = {}
    for name, k in SENSITIVITY.items():
        prm = {"led_factor": 1 - (1 - PARAMS["led_factor"]) * k, "hvac_pct_per_c": PARAMS["hvac_pct_per_c"] * k}
        r = evaluate(spec, fixes, prm)
        out[name] = {"saved_egp_year": r["saved_egp_year"], "saved_kwh_month": r["saved_kwh_month"]}
    return out
