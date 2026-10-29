"""Meta Model API client (Muse Spark chat + vision, SAM 3.1) with a hard budget guard."""
from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "runs" / "ledger.json"
_lock = threading.Lock()


def env(key: str, default: str = "") -> str:
    if key in os.environ:
        return os.environ[key]
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return default


PRICES = {"muse-spark-1.3": (1.25, 4.25), "muse-spark-1.2": (1.25, 4.25), "muse-spark-1.1": (1.25, 4.25), "muse-wonder-1.0": (4.00, 20.00),
          "muse-spark-1.3-contributor": (0.10, 0.20), "muse-spark-1.2-contributor": (0.10, 0.20)}  # official price list, 2026-10-28; contributor = inputs used to train Meta models  # USD per 1M tokens in/out (docs/research/meta-models.md)
PRICE_IN, PRICE_OUT = PRICES["muse-spark-1.3"]
SAM_USD = 0.0025  # $2.50 per 1,000 images (docs/research/meta-models.md)


_GLOBAL: list[float] = []


class BudgetExceeded(RuntimeError):
    pass


class Budget:
    """Per-run call cap, per-run time limit, per-minute caps (run and global), daily call and USD caps, kill switch and cancel. Never weaken."""

    def __init__(self, max_calls: int | None = None, cancel: "threading.Event | None" = None, seconds: float | None = None):
        self.max_calls = max_calls or int(env("MAX_MODEL_CALLS_PER_RUN", "40"))
        self.calls = 0
        self.usd = 0.0
        self.stamps: list[float] = []
        self.cancel = cancel                      # set by the Cancel button: no further model call may start
        self.deadline = time.time() + (seconds or float(env("MAX_RUN_SECONDS", "300")))  # hard wall-clock limit per run

    def _day(self) -> dict:
        today = time.strftime("%Y-%m-%d")
        try:
            d = json.loads(LEDGER.read_text())
        except Exception:  # noqa: BLE001
            d = {}
        return d if d.get("day") == today else {"day": today, "usd": 0.0, "calls": 0}

    def check(self):
        with _lock:
            if env("KILL_SWITCH") == "1":
                raise BudgetExceeded("kill switch is on")
            if self.cancel is not None and self.cancel.is_set():
                raise BudgetExceeded("cancelled")
            now = time.time()
            if now > self.deadline:
                raise BudgetExceeded("run time limit reached")
            _GLOBAL[:] = [t for t in _GLOBAL if now - t < 60]   # shared by every run, check and chat in this process
            if len(_GLOBAL) >= int(env("MAX_MODEL_CALLS_PER_MINUTE", "60")):
                raise BudgetExceeded("global per-minute call cap reached")
            self.stamps = [t for t in self.stamps if now - t < 60]
            if self.calls >= self.max_calls:
                raise BudgetExceeded(f"run call cap {self.max_calls} reached")
            if len(self.stamps) >= 40:
                raise BudgetExceeded("per-minute call cap reached")
            day = self._day()
            if day["usd"] >= float(env("MAX_SPEND_USD_PER_DAY", "3.00")):
                raise BudgetExceeded("daily spend cap reached")
            if day.get("calls", 0) >= int(env("MAX_MODEL_CALLS_PER_DAY", "600")):
                raise BudgetExceeded("daily call cap reached")
            self.calls += 1
            self.stamps.append(now)
            _GLOBAL.append(now)

    def record(self, usd: float):
        with _lock:
            self.usd += usd
            d = self._day()
            d["usd"] = round(d["usd"] + usd, 6)
            d["calls"] += 1
            LEDGER.parent.mkdir(exist_ok=True)
            LEDGER.write_text(json.dumps(d))


def available() -> bool:
    return bool(env("META_API_KEY") and env("META_BASE_URL")) and env("FORCE_DEMO_MODE") != "1"


def parse_json(text: str) -> dict | None:
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    cand = m.group(1) if m else None
    if cand is None:
        i, j = text.find("{"), text.rfind("}")
        cand = text[i:j + 1] if i >= 0 and j > i else None
    try:
        return json.loads(cand) if cand else None
    except Exception:  # noqa: BLE001
        return None


def chat(budget: Budget, system: str, user: str, *, image: bytes | None = None, effort: str = "low",
         max_tokens: int = 4000, timeout: int = 120, model: str | None = None, images: list[bytes] | None = None) -> dict:
    """One Muse Spark call. Returns {text, json, model, ms, usd, tokens_in, tokens_out}. Raises on failure."""
    budget.check()
    model = model or env("META_MODEL", "muse-spark-1.3")
    content: list | str = user
    pics = ([image] if image else []) + list(images or [])
    if pics:
        content = [{"type": "text", "text": user}] + [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(p).decode()}} for p in pics]
    body = {"model": model, "reasoning_effort": effort, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
    t0 = time.time()
    r = httpx.post(env("META_BASE_URL").rstrip("/") + "/chat/completions", json=body, timeout=timeout,
                   headers={"Authorization": "Bearer " + env("META_API_KEY")})
    r.raise_for_status()
    j = r.json()
    text = (j["choices"][0]["message"].get("content") or "").strip()
    u = j.get("usage", {})
    pin, pout = PRICES.get(model, PRICES["muse-spark-1.3"])
    usd = u.get("prompt_tokens", 0) * pin / 1e6 + u.get("completion_tokens", 0) * pout / 1e6
    budget.record(usd)
    return {"text": text, "json": parse_json(text), "model": model, "ms": int((time.time() - t0) * 1000), "usd": usd,
            "tokens_in": u.get("prompt_tokens", 0), "tokens_out": u.get("completion_tokens", 0)}


_BOX = re.compile(r"<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>")


def sam_boxes(budget: Budget, png: bytes, phrase: str) -> list[list[float]]:
    """SAM 3.1 via the Responses API; boxes on a 0-1000 grid. Empty list on failure (no overlay then)."""
    try:
        budget.check()
        r = httpx.post(env("META_BASE_URL").rstrip("/") + "/responses", headers={"Authorization": "Bearer " + env("META_API_KEY")},
                       timeout=120, json={"model": "sam-3.1", "input": [{"role": "user", "content": [
                           {"type": "input_text", "text": phrase},
                           {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(png).decode()}]}]})
        r.raise_for_status()
        txt = "".join(c.get("text", "") for o in r.json().get("output", []) for c in o.get("content", []))
        budget.record(SAM_USD)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for x1, y1, x2, y2, w, h in _BOX.findall(txt):
        w, h = int(w), int(h)
        out.append([int(x1) / w * 1000, int(y1) / h * 1000, int(x2) / w * 1000, int(y2) / h * 1000])
    return out
