"""Deterministic energy twin: physics-lite component models, a fix catalog and a verifier.

Everything here is plain code. Models only propose parameters; this module computes.
Defaults tagged ASSUMPTION are editable placeholders, not measured Egyptian figures.
"""
from __future__ import annotations

import copy

DAYS_PER_MONTH = 4.33  # weeks per month

# Scenario parameter sets for sensitivity (low / base / high savings).
PARAMS = {
    "tariff_egp_per_kwh": 0.10,       # USD per kWh (key name kept): about the US industrial average, EIA 9.64 cents/kWh in Aug 2026 (preliminary); editable, set your local price
    "grid_kgco2_per_kwh": 0.45,       # kg CO2 per kWh: UNVERIFIED illustrative world-average style value; set your grid factor
    "pv_kwh_per_kwp_day": 5.0,        # PVGIS Cairo 1,827 kWh/kWp/yr (docs/research/egypt-energy.md)
    "led_scale": 1.0,                 # multiplies the LED power ratios below (sensitivity only)
    "hvac_pct_per_c": 0.06,           # 6% per degC: Roussac et al. 2011, 33 offices (conservative end; other studies 8-16%)
    "leak_slope": 1.0,                # power saved is about proportional to leak flow removed (DTE case study, n=1, weak)
    "static_share_default": 0.3,      # share of pump head that does not fall with speed; a plant input, 0.3 is a placeholder
    "static_shift": 0.0,              # sensitivity only
    "capex_vsd_egp_per_kw": 150.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_leak_egp": 3000.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_led_egp_per_kw": 120.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_controls_egp": 1500.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_standby_egp": 500.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_pv_egp_per_kwp": 900.0,   # USD placeholder (UNVERIFIED), replace with supplier quotes
    "capex_hvac_egp": 0.0,
}
# LED power as a share of the old lamp, by baseline: PNNL-20404 (2011) T8 median of 0.649/0.597/0.772, T12 0.49; metal halide from rated watts only (PARTIAL)
LED_BY_LEGACY = {"t8": 0.65, "t12": 0.49, "metal_halide": 0.32}
PV_MAX_SHARE = 0.30   # ASSUMPTION: solar may not cover more than 30% of the plant's monthly energy (no roof data, no export credit)
COMPRESSOR_CURVES = {"modulating": (0.70, 0.30), "load_unload": (0.25, 0.75)}  # power share at zero / extra at full load (CAC fact sheet 6; Fluid Power World 2018)
# sensitivity sets: low / base / high savings. HVAC band 4.5% / 6% / 10% per degC; LED +-; pump static share +-0.2; leak slope 0.75 / 1 / 1
SENSITIVITY = {"low": {"hvac_pct_per_c": 0.045, "led_scale": 1.15, "static_shift": 0.2, "leak_slope": 0.75},
               "base": {},
               "high": {"hvac_pct_per_c": 0.10, "led_scale": 0.9, "static_shift": -0.2, "leak_slope": 1.0}}


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
        if c.get("vsd"):   # power = flow x head; the static part of the head does not fall with speed (Rockwell/Flowserve test, Plant Services 2005)
            s = min(1.0, max(0.0, c.get("static_share", params["static_share_default"]) + params["static_shift"]))
            frac = f * (s + (1 - s) * f * f)
        else:
            frac = 0.516 + 0.484 * f   # linear fit to the same test; throttled constant speed
        return c["count"] * c["rated_kw"] * frac
    if t == "compressor":
        c0, c1 = COMPRESSOR_CURVES.get(c.get("control", "modulating"), COMPRESSOR_CURVES["modulating"])
        base = c0 + c1 * min(1.0, c["air_demand"])
        return min(c["rated_kw"], c["rated_kw"] * (base + params["leak_slope"] * c["leak"]))
    if t == "lighting":
        ratio = LED_BY_LEGACY.get(c.get("legacy", "t8"), 0.65) * params["led_scale"]
        return c["kw"] * (ratio if c.get("led") else 1.0)
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
        t = c["type"]
        if not o and t != "pv":
            continue
        if t == "pump" and c.get("vsd") and c["flow_demand"] < 0.3:
            bad.append(f"{c['id']}: required flow {c['flow_demand']:.2f} is below the 30% minimum safe drive speed")
        if t == "compressor" and c["air_demand"] + c["leak"] > 1.0:
            bad.append(f"{c['id']}: air demand plus leaks exceeds compressor capacity")
        if t == "compressor" and c["leak"] < 0.03:
            bad.append(f"{c['id']}: a leak share below 3% is not achievable in practice (ASSUMPTION floor)")
        if t == "pv":
            share = c["kwp"] * PARAMS["pv_kwh_per_kwp_day"] * before["shift"]["days_per_week"] * DAYS_PER_MONTH / max(1.0, monthly_kwh(before))
            if share > PV_MAX_SHARE:
                bad.append(f"{c['id']}: {c['kwp']:.0f} kWp would cover {share:.0%} of the plant's energy; solar is capped at {PV_MAX_SHARE:.0%} (ASSUMPTION: roof area and export rules unknown)")
            day = [v for h, v in enumerate(hourly_kw(before)) if 8 <= h < 16 and v > 0]
            peak = c["kwp"] * PARAMS["pv_kwh_per_kwp_day"] / 12.0
            if day and peak > 0.8 * min(day):
                bad.append(f"{c['id']}: {c['kwp']:.0f} kWp is oversized, its peak {peak:.0f} kW exceeds 80% of the lowest daytime load (no export credit assumed)")
        if t == "hvac" and c["setpoint_c"] > 26.0:
            bad.append(f"{c['id']}: setpoint {c['setpoint_c']:.0f} C is above the 26 C comfort/process limit")
        if o and t in ("pump", "compressor", "lighting", "motors") and c.get("hours") != o.get("hours"):
            bad.append(f"{c['id']}: operating hours changed (production would be cut)")
        if o and t == "pump" and c["flow_demand"] != o["flow_demand"]:
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
        "parts_before": _parts(spec, params),
        "parts_after": _parts(cur, params),
    }


def _parts(spec: dict, params: dict | None) -> dict:
    _, parts = hourly_kw(spec, params, split=True)
    return {k: [round(v, 1) for v in vals] for k, vals in parts.items()}


def sensitivity(spec: dict, fixes: list[dict]) -> dict:
    """Re-run the plan with the evidence-based low / base / high assumption sets."""
    out = {}
    for name, prm in SENSITIVITY.items():
        r = evaluate(spec, fixes, prm)
        out[name] = {"saved_egp_year": r["saved_egp_year"], "saved_kwh_month": r["saved_kwh_month"]}
    return out


def solar_split(spec: dict, plan: list[dict]) -> dict:
    """Show the solar share of the saving apart from the efficiency fixes (solar is generation, not waste removal)."""
    full = evaluate(spec, plan)
    rest = evaluate(spec, [f for f in plan if f.get("type") != "solar_pv"])
    return {"saved_kwh_month_no_solar": rest["saved_kwh_month"], "saved_egp_year_no_solar": rest["saved_egp_year"],
            "solar_kwh_month": round(full["saved_kwh_month"] - rest["saved_kwh_month"], 1), "solar_egp_year": full["saved_egp_year"] - rest["saved_egp_year"]}


def plan_detail(spec: dict, plan: list[dict]) -> list[dict]:
    """Each fix evaluated on its own (savings overlap when fixes are combined, so the total is lower than the sum)."""
    out = []
    for f in plan:
        try:
            r = evaluate(spec, [f])
            out.append({"fix": f, "saved_kwh_month": r["saved_kwh_month"], "saved_egp_year": r["saved_egp_year"], "capex_egp": r["capex_egp"], "payback_months": r["payback_months"]})
        except FixError:
            continue
    return out
