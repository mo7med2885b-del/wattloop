"""Synthetic benchmark: how much does the quality of the inputs change the error of the predicted saving?

SYNTHETIC TRUTH, NOT REAL PLANTS. Random plants are drawn, their bill comes from the twin itself, and three input levels are compared
with the true saving of the same fix plan:
  bill_only  : generic first guess, ratings scaled to the bill (what the app does when it must guess)
  typical    : machine list with catalog-typical kW (user picked machines but kept the defaults)
  user_kw    : machine list with the plant's own nameplate kW (+-5% noise)
  user_kw+facts : the same plus the facts a manager knows (HVAC setpoint, lights left on after closing, compressor control type)
Run: python tools/benchmark_inputs.py [first_seed] [count]; also shown in the Evidence panel (seeds 1000-1199, held out from development).
"""
import copy
import random
import statistics
from . import machines, pipeline, twin


def truth_plant(rng: random.Random) -> dict:
    sh = {"start": rng.choice([6, 7, 8]), "days_per_week": rng.choice([5, 6, 7])}
    sh["end"] = sh["start"] + rng.choice([8, 10, 12, 16])
    n = sh["end"] - sh["start"]
    comps = [
        {"id": "pumps", "type": "pump", "name": "Pumps", "count": rng.randint(1, 4), "rated_kw": rng.choice([5.5, 11, 15, 22, 37, 55, 75]), "hours": n, "flow_demand": rng.uniform(0.45, 0.9), "vsd": False, "static_share": rng.uniform(0.2, 0.4)},
        {"id": "air", "type": "compressor", "name": "Compressor", "rated_kw": rng.choice([15, 22, 37, 55, 75, 110]), "hours": n, "air_demand": rng.uniform(0.35, 0.7), "leak": rng.uniform(0.1, 0.3), "control": rng.choice(["modulating", "load_unload"])},
        {"id": "lights", "type": "lighting", "name": "Lighting", "kw": rng.choice([5, 10, 18, 30, 40]), "hours": n, "led": False, "after_hours_h": rng.choice([0, 2, 4, 5]), "legacy": rng.choice(["t8", "t12", "metal_halide"])},
        {"id": "hvac", "type": "hvac", "name": "Cooling", "kw": rng.choice([20, 40, 60, 90, 120]), "hours": min(n, rng.choice([8, 12])), "setpoint_c": rng.choice([20.0, 21.0, 22.0, 23.0])},
        {"id": "belts", "type": "motors", "name": "Motors", "kw": rng.choice([15, 30, 40, 75, 120]), "hours": n, "load_factor": rng.uniform(0.4, 0.8)},
        {"id": "standby", "type": "standby", "name": "Standby", "kw": rng.choice([1, 3, 6, 10])},
    ]
    return {"name": "synthetic", "shift": sh, "components": comps}


def rows_from(truth: dict, mode: str, rng: random.Random) -> list[dict]:
    rows = machines.from_spec(truth)
    for r in rows:
        cat = machines.CATALOG[r["kind"]]
        if mode == "typical":
            r["kw"], r["count"], r["kw_source"] = cat["kw"], 1, "typical"
        else:
            r["kw"] = r["kw"] * rng.uniform(0.95, 1.05)
            if mode == "user_kw":   # nameplate kW only; setpoint, after-hours and control type unknown
                for k in ("setpoint_c", "after_hours_h", "control"):
                    r.pop(k, None)
        r.pop("hours", None) if mode == "typical" else None
    return rows


def plan_for(spec: dict) -> list[dict]:
    """Fixes a verifier would accept: the default plan, filtered one by one by the service constraints."""
    ok = []
    for f in pipeline.default_plan(spec):
        try:
            ev = twin.evaluate(spec, ok + [f])
        except twin.FixError:
            continue
        if not ev["violations"] and twin.evaluate(spec, [f])["saved_kwh_month"] > 0:
            ok.append(f)
    return ok


def estimate(truth: dict, mode: str, rng: random.Random) -> dict:
    bill = twin.monthly_kwh(truth)
    shift = truth["shift"]
    if mode == "bill_only":
        spec = pipeline.generic_spec(shift)
        k = bill / max(1.0, twin.monthly_kwh(spec))
        for c in spec["components"]:
            for f in ("kw", "rated_kw"):
                if f in c:
                    c[f] *= k
    else:
        spec = machines.spec_from_machines(machines.clean(rows_from(truth, mode, rng)), shift)
        machines.tune_utilisation(spec, bill, twin.monthly_kwh)
    return spec


def run(first: int, count: int) -> dict:
    errs = {"bill_only": [], "typical": [], "user_kw": [], "user_kw+facts": []}
    for seed in range(first, first + count):
        rng = random.Random(seed)
        truth = truth_plant(rng)
        for mode in errs:
            est = estimate(copy.deepcopy(truth), {"user_kw+facts": "user_kw_facts"}.get(mode, mode), rng)
            plan = plan_for(est)
            if not plan:
                continue
            true_saving = twin.evaluate(truth, [f for f in plan if f.get("target") in {c["id"] for c in truth["components"]} or f.get("type") == "solar_pv"])["saved_kwh_month"]
            pred = twin.evaluate(est, plan)["saved_kwh_month"]
            if true_saving > 0:
                errs[mode].append(abs(pred - true_saving) / true_saving * 100)
    return {m: {"n": len(v), "median": round(statistics.median(v), 1), "mean": round(statistics.mean(v), 1), "p90": round(sorted(v)[int(0.9 * len(v)) - 1], 1)} for m, v in errs.items() if v}


def run_dollars(first: int, count: int) -> dict:
    """Same synthetic plants, now with a random true electricity price (0.05-0.25 USD/kWh, an assumed range). Compares the error of the predicted DOLLAR saving
    when the app keeps its default price (0.10) with the error when the price printed on an uploaded bill is used. kWh errors do not depend on the price."""
    out = {m: {"default_price": [], "bill_price": []} for m in ("bill_only", "typical", "user_kw", "user_kw+facts")}
    for seed in range(first, first + count):
        rng = random.Random(seed)
        truth = truth_plant(rng)
        price = random.Random(seed + 7).uniform(0.05, 0.25)
        for mode in out:
            est = estimate(copy.deepcopy(truth), {"user_kw+facts": "user_kw_facts"}.get(mode, mode), rng)
            plan = plan_for(est)
            if not plan:
                continue
            true_kwh = twin.evaluate(truth, [f for f in plan if f.get("target") in {c["id"] for c in truth["components"]} or f.get("type") == "solar_pv"], {"tariff_egp_per_kwh": price})["saved_kwh_month"]
            if true_kwh <= 0:
                continue
            true_usd = true_kwh * 12 * price
            for key, p in (("default_price", 0.10), ("bill_price", price)):
                pred = twin.evaluate(est, plan, {"tariff_egp_per_kwh": p})["saved_kwh_month"] * 12 * p
                out[mode][key].append(abs(pred - true_usd) / true_usd * 100)
    return {m: {k: round(statistics.median(v), 1) for k, v in d.items() if v} for m, d in out.items()}
