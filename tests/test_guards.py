"""Guards against runaway Meta API use: caps, time limit, cancel, bounded loops, concurrency. No real API calls are made."""
import threading
import time

import pytest

from wattloop import demo, meta, pipeline


def make_run():
    c = demo.case()
    c.update(shift={"start": 6, "end": 22, "days_per_week": 6}, name="t", trusted_image=True)
    return pipeline.Run(c, b"fake-image")


def fake_chat_factory(counter, delay=0.0):
    def fake(budget, system, user, **kw):
        budget.check()
        counter.append(1)
        time.sleep(delay)
        return {"text": "no json", "json": None, "model": "fake", "ms": 1, "usd": 0.0, "tokens_in": 0, "tokens_out": 0}
    return fake


def test_per_run_call_cap():
    b = meta.Budget(max_calls=3)
    for _ in range(3):
        b.check()
    with pytest.raises(meta.BudgetExceeded):
        b.check()


def test_cancel_blocks_next_call():
    ev = threading.Event()
    b = meta.Budget(cancel=ev)
    b.check()
    ev.set()
    with pytest.raises(meta.BudgetExceeded, match="cancelled"):
        b.check()


def test_run_time_limit():
    b = meta.Budget(seconds=0.01)
    time.sleep(0.05)
    with pytest.raises(meta.BudgetExceeded, match="time limit"):
        b.check()


def test_global_per_minute_cap(monkeypatch):
    monkeypatch.setenv("MAX_MODEL_CALLS_PER_MINUTE", "3")
    meta._GLOBAL.clear()
    for _ in range(3):
        meta.Budget().check()
    with pytest.raises(meta.BudgetExceeded, match="global"):
        meta.Budget().check()
    meta._GLOBAL.clear()


def test_kill_switch(monkeypatch):
    monkeypatch.setenv("KILL_SWITCH", "1")
    with pytest.raises(meta.BudgetExceeded, match="kill"):
        meta.Budget().check()


def test_full_run_is_bounded_even_when_models_return_garbage(monkeypatch):
    calls = []
    monkeypatch.setattr(meta, "available", lambda: True)
    monkeypatch.setattr(meta, "chat", fake_chat_factory(calls))
    monkeypatch.setattr(meta, "sam_boxes", lambda *a, **k: [])
    meta._GLOBAL.clear()
    run = make_run()
    pipeline.execute(run)
    assert run.finished
    assert run.events[-1]["type"] == "done"
    assert len(calls) <= 20, f"too many model calls: {len(calls)}"
    meta._GLOBAL.clear()


def test_cancel_stops_run_and_drops_later_events(monkeypatch):
    calls = []
    monkeypatch.setattr(meta, "available", lambda: True)
    monkeypatch.setattr(meta, "chat", fake_chat_factory(calls, delay=0.3))
    monkeypatch.setattr(meta, "sam_boxes", lambda *a, **k: [])
    meta._GLOBAL.clear()
    run = make_run()
    t = threading.Thread(target=pipeline.execute, args=(run,))
    t.start()
    time.sleep(0.5)
    pipeline.cancel_run(run)
    n_events = len(run.events)
    assert run.events[-2]["type"] == "cancelled" and run.events[-1]["type"] == "done"
    t.join(timeout=5)
    assert not t.is_alive(), "worker thread did not exit after cancel"
    assert len(run.events) == n_events, "events leaked after cancel"
    n_calls = len(calls)
    time.sleep(0.5)
    assert len(calls) == n_calls, "model calls continued after cancel"
    meta._GLOBAL.clear()


def test_server_allows_only_two_active_runs(monkeypatch):
    from fastapi.testclient import TestClient

    import server
    monkeypatch.setattr(pipeline, "execute", lambda run: time.sleep(1.5))
    server.RUNS.clear()
    c = TestClient(server.app)
    assert c.post("/api/run", json={"gallery_id": "demo"}).status_code == 200
    assert c.post("/api/run", json={"gallery_id": "demo"}).status_code == 200
    assert c.post("/api/run", json={"gallery_id": "demo"}).status_code == 429
    time.sleep(1.7)
