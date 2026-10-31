from wattloop import designer, parts

SPEC = {"components": [{"id": "pump_1", "type": "pump", "name": "Pumps"}, {"id": "air", "type": "compressor", "name": "Compressor"}, {"id": "l", "type": "lighting", "name": "Lights"}]}


def raw(n=12, **kw):
    p = {"shape": "box", "pos": [0, 1, 0], "size": [1, 1, 1], "color": "#3b6fb6"}
    p.update(kw)
    return {"machines": [{"id": "pump_1", "parts": [dict(p) for _ in range(n)]}]}


def test_valid_machine_is_kept_and_unknown_ids_dropped():
    r = raw()
    r["machines"].append({"id": "ghost", "parts": [{"shape": "box", "pos": [0, 0, 0], "size": [1, 1, 1], "color": "#ffffff"}] * 12})
    out = parts.validate_parts(r, SPEC)
    assert list(out) == ["pump_1"] and len(out["pump_1"]) == 12


def test_positions_sizes_and_colours_are_clamped():
    out = parts.validate_parts(raw(pos=[99, -5, 99], size=[500, 500, 500], color="red"), SPEC)["pump_1"][0]
    hx, hz, hy = parts.SLOT["pump"]
    assert abs(out["pos"][0]) <= hx and 0 <= out["pos"][1] <= hy and abs(out["pos"][2]) <= hz
    assert out["size"][0] <= 2 * hx and out["color"] == "#8b96a3"


def test_bad_shapes_and_too_few_parts_fall_back():
    assert parts.validate_parts(raw(shape="mesh"), SPEC) == {}
    assert parts.validate_parts(raw(n=5), SPEC) == {}
    assert parts.validate_parts({"machines": "nonsense"}, SPEC) == {}


def test_limits_on_parts_and_spin_parts():
    out = parts.validate_parts(raw(n=80, anim="spin_y"), SPEC)["pump_1"]
    assert len(out) <= parts.MAX_PARTS and sum(1 for p in out if p.get("anim")) <= 3


def test_relayout_keeps_the_parts():
    spec = {"components": [{"id": "pump_1", "type": "pump", "design": {"x": 0, "z": 0, "scale": 1, "parts": [{"shape": "box"}]}}]}
    designer.apply_design(spec, {"layout": {"pump_1": {"x": 2.0, "z": 3.0, "scale": 1.2}}, "extras": []})
    assert spec["components"][0]["design"]["x"] == 2.0 and spec["components"][0]["design"]["parts"]


def test_props_are_validated_inside_their_footprint():
    spec = {"components": [], "extras": [{"role": "machine_block", "shape": "box", "size": [5.0, 5, 4.0], "pos": [-11.0, 2.5, -1.0], "repeat": {"n": 1}}, {"role": "duct", "shape": "box", "size": [6, 0.8, 1.0], "pos": [0, 6, 0]}]}
    part = {"shape": "box", "pos": [50, 1, 50], "size": [40, 3, 40], "color": "#aa3322"}
    out = parts.validate_parts({"props": [{"id": "prop_0", "parts": [dict(part) for _ in range(12)]}, {"id": "prop_1", "parts": [dict(part) for _ in range(12)]}]}, spec)
    assert list(out) == ["prop_0"]                       # ducts are not eligible
    assert all(abs(p["pos"][0]) <= 3.1 and abs(p["pos"][2]) <= 2.3 for p in out["prop_0"])
    n = parts.apply_parts(spec, out)
    assert n == 1 and spec["extras"][0]["parts"]
