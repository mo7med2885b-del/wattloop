"""The published validation numbers must be reproducible from code."""
from wattloop import twin, validation


def test_pre_fit_error_matches_the_documented_figures():
    r = validation.run()["legacy"]
    assert r["n"] == 27
    assert 13.0 <= r["median_abs_err_pct"] <= 14.2          # documented: 13.6
    assert 16.5 <= r["mean_abs_err_pct"] <= 18.5            # documented: about 17.5
    assert 61.0 <= r["worst_abs_err_pct"] <= 63.5           # documented: 62.5 (HVAC)


def test_current_model_keeps_physical_behaviour():
    p = twin.PARAMS
    pump = lambda f, vsd, s=0.3: twin.component_power_kw({"type": "pump", "count": 1, "rated_kw": 1.0, "flow_demand": f, "vsd": vsd, "static_share": s}, p)
    assert pump(0.5, True, 0.0) < pump(0.5, False)           # a drive always beats throttling at part flow when there is no static head
    assert pump(0.5, True, 1.0) > pump(0.5, True, 0.0)       # static head reduces the drive's advantage
    assert abs(pump(1.0, False) - 1.0) < 0.01                # full flow = rated power
    comp = lambda d, c: twin.component_power_kw({"type": "compressor", "rated_kw": 1.0, "air_demand": d, "leak": 0.0, "control": c}, p)
    assert comp(0.4, "modulating") > comp(0.4, "load_unload")  # modulating wastes more at part load
