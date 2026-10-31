import pytest

from wattloop import meta


@pytest.fixture(autouse=True)
def _isolated_ledger(tmp_path, monkeypatch):
    """Tests must not read or write the real daily spend ledger (runs/ledger.json): real spend on the same day would trip the caps under test."""
    monkeypatch.setattr(meta, "LEDGER", tmp_path / "ledger.json")
    monkeypatch.setattr(meta, "_GLOBAL", [])
