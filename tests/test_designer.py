"""Scene Designer: the model may propose anything; only validated geometry reaches the renderer."""
from wattloop import demo, designer


def spec():
    return {"shift": {"start": 6, "end": 22, "days_per_week": 6}, "components": [dict(c) for c in demo.TRUTH["components"]]}


def test_layout_is_clamped_and_machines_do_not_overlap():
    s = spec()
    raw = {"layout": [{"id": "pumps", "x": 99, "z": -99, "scale": 5}, {"id": "air", "x": 99, "z": -99, "scale": 0.1}, {"id": "belts", "x": -2, "z": 2}, {"id": "ghost", "x": 0, "z": 0}]}
    d = designer.validate_design(raw, s)
    for cid, v in d["layout"].items():
        assert designer.X_RANGE[0] <= v["x"] <= designer.X_RANGE[1] and designer.Z_RANGE[0] - 0.01 <= v["z"] <= designer.Z_RANGE[1] + 0.01
        assert 0.8 <= v["scale"] <= 1.3
    assert "ghost" not in d["layout"]
    comps = {c["id"]: c for c in s["components"]}
    ids = list(d["layout"])
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ax1, az1, ax2, az2 = designer._box(comps[a], d["layout"][a])
            bx1, bz1, bx2, bz2 = designer._box(comps[b], d["layout"][b])
            assert not (min(ax2, bx2) - max(ax1, bx1) > 0.5 and min(az2, bz2) - max(az1, bz1) > 0.5), (a, b)


def test_hvac_stays_on_the_wall():
    s = spec()
    d = designer.validate_design({"layout": [{"id": "hvac", "x": 3, "z": 5, "scale": 1}]}, s)
    assert d["layout"]["hvac"]["z"] == designer.DEFAULT_POS["hvac"][1]


def test_bad_extras_are_dropped_and_capped():
    s = spec()
    extras = [{"role": "rack", "shape": "box", "size": [1, 1, 1], "pos": [0, 1, 0]}] * 30 + [{"role": "evil", "shape": "box", "size": [1, 1, 1], "pos": [0, 0, 0]}, {"role": "rack", "shape": "sphere", "size": [1], "pos": [0, 0, 0]},
                                                                                           {"role": "rack", "shape": "box", "size": "huge", "pos": [0, 0, 0]}, {"role": "tank", "shape": "cylinder", "size": [50, 99], "pos": [99, 99, 99], "color": "neon"}]
    d = designer.validate_design({"extras": extras}, s)
    assert len(d["extras"]) <= designer.MAX_EXTRAS
    assert all(e["shape"] in ("box", "cylinder") and e["role"] in designer.ROLES and e["color"] in designer.COLORS for e in d["extras"])
    assert all(abs(e["pos"][0]) <= 15.5 and 0 < e["pos"][1] <= 6 and abs(e["pos"][2]) <= 9.5 for e in d["extras"])


def test_fallback_layout_follows_the_sam_boxes():
    s = spec()
    boxes = [{"phrase": "air compressor", "box": [800, 500, 1000, 800]}, {"phrase": "water pump", "box": [100, 600, 300, 800]}]
    fb = designer.layout_from_boxes(s, boxes)
    assert fb["air"]["x"] > fb["pumps"]["x"]               # compressor is right of the pumps in the photo
    d = designer.validate_design({}, s, fb)                 # no model output: the deterministic layout is used
    assert d["layout"]["air"]["x"] > d["layout"]["pumps"]["x"]
    designer.apply_design(s, d)
    assert "design" in next(c for c in s["components"] if c["id"] == "air")
