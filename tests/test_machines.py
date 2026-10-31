from wattloop import machines, pipeline, twin

SHIFT = {"start": 6, "end": 22, "days_per_week": 6}


def rows():
    return machines.clean([
        {"kind": "pump", "count": 2, "kw": 15, "kw_source": "user"},
        {"kind": "compressor", "kw": 55, "kw_source": "user"},
        {"kind": "hvac", "kw": 60, "kw_source": "user", "setpoint_c": 21},
        {"kind": "bogus", "kw": 5}, {"kind": "motor", "kw": -3}])


def test_clean_drops_bad_rows():
    assert [r["kind"] for r in rows()] == ["pump", "compressor", "hvac"]


def test_user_ratings_stay_locked_and_match_bill():
    spec = machines.spec_from_machines(rows(), SHIFT)
    bill = twin.monthly_kwh(spec) * 1.2
    machines.tune_utilisation(spec, bill, twin.monthly_kwh)
    assert next(c for c in spec["components"] if c["type"] == "pump")["rated_kw"] == 15
    assert abs(twin.monthly_kwh(spec) - bill) / bill < 0.05
    assert machines.basis(spec) == "user"


def test_bill_larger_than_machines_adds_labelled_unlisted_block():
    spec = machines.spec_from_machines(rows(), SHIFT)
    bill = twin.monthly_kwh(spec) * 3
    extra = machines.tune_utilisation(spec, bill, twin.monthly_kwh)
    assert extra > 0 and any(c["id"] == "unlisted" for c in spec["components"])


def test_solar_cap_rejects_oversized_array():
    spec = machines.spec_from_machines(rows(), SHIFT)
    ev = twin.evaluate(spec, [{"type": "solar_pv", "kwp": 5000}])
    assert any("capped" in v or "oversized" in v for v in ev["violations"])


def test_solar_split_sums():
    spec = machines.spec_from_machines(rows(), SHIFT)
    plan = [{"type": "vsd_pump", "target": "pump1"}, {"type": "solar_pv", "kwp": 20}]
    s = twin.solar_split(spec, plan)
    full = twin.evaluate(spec, plan)
    assert abs(s["saved_kwh_month_no_solar"] + s["solar_kwh_month"] - full["saved_kwh_month"]) < 0.2


def test_confidence_is_lower_when_ratings_are_guessed():
    ev = {"saved_egp_year": 1000}
    sens = {"low": {"saved_egp_year": 900}, "high": {"saved_egp_year": 1100}}
    crit = {"challenges": []}
    assert pipeline.arbiter(0, ev, sens, crit, 0, "user")["confidence_score"] > pipeline.arbiter(0, ev, sens, crit, 0, "guessed")["confidence_score"]


def test_input_benchmark_better_inputs_smaller_error():
    from wattloop import benchmark
    r = benchmark.run(1000, 40)
    assert r["user_kw+facts"]["median"] < r["user_kw"]["median"] < r["bill_only"]["median"]


def test_variable_speed_compressor_model_and_fix():
    from wattloop import twin, validation
    spec = {"name": "t", "shift": {"start": 6, "end": 22, "days_per_week": 6}, "components": [{"id": "air", "type": "compressor", "name": "c", "rated_kw": 55.0, "hours": 16, "air_demand": 0.5, "leak": 0.1, "control": "modulating"}]}
    r = twin.evaluate(spec, [{"type": "vsd_compressor", "target": "air"}])
    assert r["saved_kwh_month"] > 0 and not r["violations"] and r["capex_egp"] == 11000
    try:
        twin.evaluate(r["spec"], [{"type": "vsd_compressor", "target": "air"}])
        assert False
    except twin.FixError:
        pass
    h = validation.holdout()           # held-out measured points of a CAGI data sheet: not used to set the constants
    assert h and h["n"] == 4 and h["worst_abs_err_pct"] < 5
