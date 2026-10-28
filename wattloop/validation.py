"""Reproducible check of the twin's component models against PUBLISHED data points.

This validates component formulas against published measurements. It is NOT a field validation of any plant.
`legacy` reproduces the first version of the constants (the honest, pre-fit result). `current` uses the evidence-adjusted constants in
twin.py, which were fitted on the same points, so its numbers are in-sample and must not be quoted as validation accuracy.
Sources and statuses: docs/research/validation-evidence.md (kept in the private notes).
"""
from __future__ import annotations

from statistics import mean, median

from . import twin

P1_SRC = "Offik (Rockwell) with Flowserve, Plant Services, 30 Jun 2005 (40 hp pump test)"
FLOWS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
THROTTLED = [19.70, 20.95, 22.21, 23.47, 24.73, 25.99]
VFD = {0: [3.20, 5.46, 8.68, 13.06, 18.83, 26.19], 60: [6.35, 8.70, 11.75, 15.58, 20.31, 26.02], 140: [10.44, 12.70, 15.42, 18.61, 22.31, 26.52], 210: [14.08, 16.02, 18.30, 20.90, 23.77, 26.89]}
STATIC_SHARE_FIT = {0: 0.0, 60: 0.31, 140: 0.72, 210: 1.0}   # in-sample fit per curve (one s per measured head)
FULL = 25.99

SOURCES = {
    "P1": "Rockwell/Flowserve pump benchmark, Plant Services 2005", "C1": "Compressed Air Challenge / DOE fact sheet 6 (2026 rev.)", "C2": "Fluid Power World 2018 (expert statement)", "C3": "Fluid Power World 2018 (expert statement)",
    "L1": "DTE Energy Find & Fix case study, 2022 (estimated savings)", "LT1": "PNNL-20404, DOE GATEWAY 2011 (measured lamp watts)", "H1": "Roussac et al., Arch. Sci. Rev. 2011 (33 offices)",
    "H2": "Univ. of Georgia field study 2018 (chilled water)", "H4": "Hoyt, Arens, Zhang, Building & Environment 2015 (SIMULATION)",
}


def _pump(f: float, vsd: bool, s: float = 0.3) -> float:
    return twin.component_power_kw({"type": "pump", "count": 1, "rated_kw": 1.0, "flow_demand": f, "vsd": vsd, "static_share": s}, {**twin.PARAMS})


# ---- first-version formulas, kept so the pre-fit error is reproducible
class legacy:
    pump_const = staticmethod(lambda f: 0.55 + 0.45 * f)
    pump_vsd = staticmethod(lambda f: f ** 3 / 0.95 + 0.02)
    comp = staticmethod(lambda load: 0.25 + 0.75 * load)
    leak_slope = 0.75
    led = 0.5
    hvac = 0.06


def _rows(model: str) -> list[dict]:
    rows: list[dict] = []

    def add(id_, comp, label, pub, mod, note=""):
        rows.append({"id": id_, "component": comp, "label": label, "published": pub, "model": mod, "err_pct": (mod - pub) / pub * 100 if pub else 0.0, "source": SOURCES[id_.split("-")[0]], "note": note})

    cur = model == "current"
    for f, thr in zip(FLOWS, THROTTLED):
        pub = thr / FULL
        mod = _pump(f, False) if cur else legacy.pump_const(f)
        add(f"P1-{int(f * 100)}", "Pump, constant speed", f"{int(f * 100)}% flow, throttled", pub, mod)
    for f, v in zip(FLOWS, VFD[0]):
        pub = v / FULL
        mod = _pump(f, True, 0.0) if cur else legacy.pump_vsd(f)
        add(f"P1-{int(f * 100)}", "Pump, VSD (friction only)", f"{int(f * 100)}% flow, 0 ft static", pub, mod)
    # compressor part-load
    add("C1", "Compressor part-load", "unloaded screw, power at zero flow (published range 15-35%, mid 25%)", 0.25, twin.component_power_kw({"type": "compressor", "rated_kw": 1.0, "air_demand": 0.0, "leak": 0.0, "control": "load_unload"}, {**twin.PARAMS}) if cur else legacy.comp(0.0), "inside the published range")
    add("C2", "Compressor part-load", "modulating screw at 40% flow (published: over 80%, lower bound)", 0.80, twin.component_power_kw({"type": "compressor", "rated_kw": 1.0, "air_demand": 0.4, "leak": 0.0, "control": "modulating"}, {**twin.PARAMS}) if cur else legacy.comp(0.4), "lower bound, so the error is at least this")
    add("C3", "Compressor part-load", "load/unload with a small receiver at 40% flow (published: about 75%)", 0.75, twin.component_power_kw({"type": "compressor", "rated_kw": 1.0, "air_demand": 0.4, "leak": 0.0, "control": "load_unload"}, {**twin.PARAMS}) if cur else legacy.comp(0.4), "known gap: small-receiver load/unload is not modelled")
    # leak repair: 350 hp (281 kW input), 15% leakage, 211 CFM of 1,740 CFM fixed, 8,760 h, estimated 310,000 kWh/yr
    rated, l0, l1 = 281.0, 261 / 1740, 261 / 1740 - 211 / 1740
    if cur:
        a = twin.component_power_kw({"type": "compressor", "rated_kw": rated, "air_demand": 0.5, "leak": l0, "control": "load_unload"}, {**twin.PARAMS})
        b = twin.component_power_kw({"type": "compressor", "rated_kw": rated, "air_demand": 0.5, "leak": l1, "control": "load_unload"}, {**twin.PARAMS})
        saved = (a - b) * 8760
    else:
        saved = rated * legacy.leak_slope * (l0 - l1) * 8760
    add("L1", "Compressor leak repair", "kWh/yr saved by fixing 211 CFM (estimate, 8,760 h assumed)", 310000.0, saved, "published saving is an estimate; one case study")
    # LED vs T8 / T12 (PNNL-20404 measured watts)
    for name, pubs, leg, key in [("T8 28.5 W", [0.649, 0.597, 0.772], 0.5, "t8"), ("T12 38 W", [0.487, 0.447, 0.579], 0.5, "t12")]:
        for i, pub in enumerate(pubs):
            mod = twin.component_power_kw({"type": "lighting", "kw": 1.0, "led": True, "legacy": key}, {**twin.PARAMS}) if cur else leg
            add(f"LT1-{key}-{i}", "Lighting, LED ratio", f"LED product {i + 1} vs {name}", pub, mod)
    # HVAC setpoint (saving fraction for the stated rise)
    for id_, label, pub, dc in [("H1", "+1 C, 33 offices, total HVAC", 0.06, 1.0), ("H2", "+1.39 C, UGA chilled water", 0.19, 1.39), ("H2-b", "+2.5 C, UGA chilled water", 0.40, 2.5), ("H4", "22.2 to 25 C, cooling (simulation)", 0.29, 2.8), ("H4-b", "22.2 to 25 C, total HVAC (simulation)", 0.27, 2.8)]:
        if cur:
            base = twin.component_power_kw({"type": "hvac", "kw": 1.0, "setpoint_c": 22.0}, {**twin.PARAMS})
            new = twin.component_power_kw({"type": "hvac", "kw": 1.0, "setpoint_c": 22.0 + dc}, {**twin.PARAMS})
            mod = 1 - new / base
        else:
            mod = legacy.hvac * dc
        add(id_, "HVAC setpoint saving", label, pub, mod)
    return rows


def summary(rows: list[dict]) -> dict:
    ae = [abs(r["err_pct"]) for r in rows]
    by: dict[str, list[float]] = {}
    for r in rows:
        by.setdefault(r["component"], []).append(abs(r["err_pct"]))
    return {"n": len(rows), "median_abs_err_pct": round(median(ae), 1), "mean_abs_err_pct": round(mean(ae), 1), "worst_abs_err_pct": round(max(ae), 1),
            "by_component": {k: {"n": len(v), "median_abs_err_pct": round(median(v), 1)} for k, v in by.items()}}


PROVENANCE = [
    ("Pump, constant speed", "0.516 + 0.484 f", "Linear fit to the Rockwell/Flowserve 40 hp pump test (Plant Services 2005)", "VERIFIED (1 test)"),
    ("Pump, variable speed", "f (s + (1-s) f^2), s = static head share (default 0.3)", "Physics (power = flow x head) checked on the same test; s is a plant input", "PARTIAL"),
    ("Compressor part-load", "modulating 0.70 + 0.30 load; load/unload 0.25 + 0.75 load", "CAC/DOE fact sheet 6 (2026); Fluid Power World 2018; Atlas Copco", "PARTIAL"),
    ("Leak saving slope", "1.0 (power saved ~ flow saved)", "DTE case study (n=1) with an Iowa DNR cross-check", "PARTIAL (weak)"),
    ("LED power ratio", "T8 0.65, T12 0.49, metal halide 0.32", "PNNL-20404 (2011), measured lamp watts; HID from rated watts only", "PARTIAL"),
    ("HVAC setpoint", "6 %/degC, band 4.5 to 10", "Roussac et al. 2011 (33 offices); other studies 8 to 16 %/degC", "PARTIAL (conservative end)"),
    ("Electricity tariff", "2.05 EGP/kWh (high voltage)", "Arab Finance, May 2026; medium/low-voltage industry unverified", "PARTIAL"),
    ("Grid emission factor", "0.55 kgCO2/kWh", "UNFCCC IFI harmonized dataset (2019)", "PARTIAL (old)"),
    ("Solar yield", "5.0 kWh per kWp per day", "EU JRC PVGIS, Cairo 1,827 kWh/kWp/yr", "VERIFIED"),
    ("Capex (drives, leak repair, LED, controls, PV)", "placeholder values", "No Egyptian source found", "UNVERIFIED"),
    ("Standby / off-hours loads", "user input", "No measured share found", "UNVERIFIED"),
]
LIMITS = ["Component models are checked against published data from the US and Europe, not against a real Egyptian plant.",
          "27 comparisons come from 8 independent sources; one pump test supplies 12 of them.",
          "The pre-fit median error is the honest figure. The current constants were fitted on the same points, so their error is in-sample.",
          "Small-receiver load/unload compressors, variable-speed compressors, fans, chillers and heat recovery are not modelled.",
          "Savings are screening estimates. An engineer verifies them on site."]


def run() -> dict:
    leg, cur = _rows("legacy"), _rows("current")
    return {"legacy": {"rows": leg, **summary(leg)}, "current": {"rows": cur, **summary(cur)},
            "independent_sources": 8, "provenance": [dict(zip(("item", "value", "basis", "status"), p)) for p in PROVENANCE], "limits": LIMITS, "note": "Component models vs published data only. Not a field validation. 'current' constants were fitted on the same points (in-sample)."}


if __name__ == "__main__":
    r = run()
    for k in ("legacy", "current"):
        s = r[k]
        print(k, "n", s["n"], "median", s["median_abs_err_pct"], "mean", s["mean_abs_err_pct"], "worst", s["worst_abs_err_pct"])
        for c, v in s["by_component"].items():
            print("   ", c, v)
