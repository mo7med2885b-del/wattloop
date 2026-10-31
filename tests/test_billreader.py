import io
import zipfile

import pytest

from wattloop import billreader, meta


def docx(text_lines):
    body = "".join(f"<w:p><w:r><w:t>{t}</w:t></w:r></w:p>" for t in text_lines)
    xml = f'<?xml version="1.0"?><w:document xmlns:w="x"><w:body>{body}</w:body></w:document>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


def xlsx(rows):
    shared = "".join(f"<si><t>{v}</t></si>" for r in rows for v in r if isinstance(v, str))
    idx, cells = 0, ""
    for ri, r in enumerate(rows, 1):
        cs = ""
        for ci, v in enumerate(r):
            ref = "AB"[ci] + str(ri)
            if isinstance(v, str):
                cs += f'<c r="{ref}" t="s"><v>{idx}</v></c>'
                idx += 1
            else:
                cs += f'<c r="{ref}"><v>{v}</v></c>'
        cells += f'<row r="{ri}">{cs}</row>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/sharedStrings.xml", f"<sst>{shared}</sst>")
        z.writestr("xl/worksheets/sheet1.xml", f"<worksheet><sheetData>{cells}</sheetData></worksheet>")
    return buf.getvalue()


def pdf(text):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"]
    stream = f"BT /F1 14 Tf 20 100 Td ({text}) Tj ET"
    objs += [f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF"
    return out.encode("latin-1")


def test_docx_xlsx_csv_text_extraction():
    assert "76,000 kWh" in billreader.extract("bill.docx", docx(["Account 123", "Consumption 76,000 kWh"]))["text"]
    t = billreader.extract("usage.xlsx", xlsx([["Month", "kWh"], ["Oct", 76000]]))["text"]
    assert "Oct" in t and "76000" in t
    assert "52000" in billreader.extract("b.csv", b"month,kwh\nSep,52000\n")["text"]
    assert billreader.extract("b.txt", "Total 61 500 kWh".encode())["kind"] == "text"


def test_pdf_text_is_read():
    ex = billreader.extract("bill.pdf", pdf("Energy consumed 48,250 kWh"))
    assert ex["kind"] == "pdf" and "48,250" in ex["text"]


def test_bad_files_are_refused_with_a_clear_message():
    for name, data in (("x.exe", b"MZ"), ("empty.pdf", b""), ("big.txt", b"a" * (billreader.MAX_BYTES + 1)), ("fake.docx", b"not a zip"), ("bad.pdf", b"not a pdf")):
        with pytest.raises(billreader.BillError):
            billreader.extract(name, data)


def test_number_checks_tolerate_separators():
    assert billreader.appears_in_text(76000, "Total 76,000.50 kWh") and billreader.appears_in_text(76000, "76.000 kWh") and billreader.appears_in_text(76000, "76 000 kWh")
    assert not billreader.appears_in_text(76000, "Total 7,600 kWh")


def test_pattern_fallback_without_a_key(monkeypatch):
    monkeypatch.setattr(meta, "available", lambda: False)
    r = billreader.read_bill(meta.Budget(max_calls=1), "bill.txt", b"Meter 77\nConsumption: 61,500 kWh\nPrice 0.11")
    assert r["ok"] and r["method"] == "pattern" and r["suggested_kwh"] == 61500 and r["needs_check"]
    r2 = billreader.read_bill(meta.Budget(max_calls=1), "bill.txt", b"nothing useful here")
    assert not r2["ok"] and r2["reason"]


def fake_chat(answer):
    return lambda budget, system, user, **kw: {"json": answer, "text": "", "model": "x", "usd": 0.0, "ms": 1, "tokens_in": 1, "tokens_out": 1}


def test_ai_answer_is_validated_and_checked_against_the_text(monkeypatch):
    monkeypatch.setattr(meta, "available", lambda: True)
    ans = {"is_electricity_bill": True, "monthly_kwh": 76000, "months": [{"label": "Oct", "kwh": 76000}, {"label": "bad", "kwh": -5}], "currency": "usd", "price_per_kwh": 0.11, "confidence": 0.95, "evidence": "76,000 kWh", "peak_kw": 400}
    monkeypatch.setattr(meta, "chat", fake_chat(ans))
    r = billreader.read_bill(meta.Budget(max_calls=1), "b.txt", b"Energy 76,000 kWh")
    assert r["ok"] and r["suggested_kwh"] == 76000 and r["verified_in_text"] is True and r["price_usd_per_kwh"] == 0.11 and len(r["months"]) == 1 and not r["needs_check"]
    # a number that is not in the document is flagged and its confidence capped (a hallucination guard)
    ans["monthly_kwh"] = 99999
    r = billreader.read_bill(meta.Budget(max_calls=1), "b.txt", b"Energy 76,000 kWh")
    assert r["verified_in_text"] is False and r["needs_check"] and r["confidence"] <= 0.5
    # absurd values and non-USD prices are not applied
    ans.update(monthly_kwh=5e12, months=[], currency="EGP")
    assert not billreader.read_bill(meta.Budget(max_calls=1), "b.txt", b"x 1").get("ok")
    ans.update(monthly_kwh=1000, currency="EGP", price_per_kwh=2.0)
    r = billreader.read_bill(meta.Budget(max_calls=1), "b.txt", b"Energy 1,000 kWh")
    assert r["ok"] and r["price_usd_per_kwh"] is None and r["price_per_kwh"] == 2.0


def test_not_a_bill_is_refused(monkeypatch):
    monkeypatch.setattr(meta, "available", lambda: True)
    monkeypatch.setattr(meta, "chat", fake_chat({"is_electricity_bill": False}))
    r = billreader.read_bill(meta.Budget(max_calls=1), "b.txt", b"A recipe for soup")
    assert not r["ok"] and "does not look like" in r["reason"]


def test_run_price_flows_into_the_money_numbers():
    from wattloop import twin
    spec = {"name": "t", "shift": {"start": 6, "end": 22, "days_per_week": 6}, "components": [{"id": "air", "type": "compressor", "name": "c", "rated_kw": 55.0, "hours": 16, "air_demand": 0.5, "leak": 0.25, "control": "modulating"}]}
    plan = [{"type": "repair_leaks", "target": "air", "target_leak": 0.05}]
    a, b = twin.evaluate(spec, plan, {"tariff_egp_per_kwh": 0.10}), twin.evaluate(spec, plan, {"tariff_egp_per_kwh": 0.20})
    assert b["saved_egp_year"] == pytest.approx(2 * a["saved_egp_year"], rel=0.01)
    assert twin.sensitivity(spec, plan, {"tariff_egp_per_kwh": 0.20})["base"]["saved_egp_year"] == b["saved_egp_year"]


def test_price_from_the_bill_makes_the_dollar_estimate_much_better():
    from wattloop import benchmark
    r = benchmark.run_dollars(1000, 40)
    for mode, v in r.items():
        assert v["bill_price"] < v["default_price"], mode
