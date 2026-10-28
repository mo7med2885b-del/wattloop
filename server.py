"""WattLoop server: FastAPI. Run: uvicorn server:app --port 8010"""
from __future__ import annotations

import base64
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from wattloop import demo, meta, pipeline, scene

app = FastAPI(title="WattLoop")
RUNS: dict[str, pipeline.Run] = {}
STATIC = Path(__file__).parent / "static"


class RunReq(BaseModel):
    description: str | None = None
    bill_kwh: float | None = None
    image_b64: str | None = None
    use_demo: bool = True


class Decision(BaseModel):
    action: str  # approve | modify | reject
    note: str = ""


@app.get("/api/demo/image")
def demo_image():
    return Response(scene.demo_png(), media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/api/demo/case")
def demo_case():
    c = demo.case()
    return {"description": c["description"], "bill_kwh": c["bill_kwh"], "shift": {"start": 6, "end": 22, "days_per_week": 6}, "meta_live": meta.available()}


@app.get("/api/demo/preview")
def preview():
    from wattloop import twin
    shift = {"start": 6, "end": 22, "days_per_week": 6}
    spec = pipeline.generic_spec(shift)
    return {"spec": spec, "hourly": [round(v, 1) for v in twin.hourly_kw(spec)]}


@app.post("/api/run")
def start(req: RunReq):
    if req.use_demo or not req.description:
        c = demo.case()
        case = {"description": c["description"], "bill_kwh": c["bill_kwh"], "name": demo.TRUTH["name"]}
        image = scene.demo_png() if not req.image_b64 else base64.b64decode(req.image_b64)
    else:
        if not req.bill_kwh or req.bill_kwh <= 0:
            raise HTTPException(400, "bill_kwh is required")
        case = {"description": req.description[:2000], "bill_kwh": req.bill_kwh, "name": "Your facility"}
        image = base64.b64decode(req.image_b64) if req.image_b64 else None
    case["shift"] = {"start": 6, "end": 22, "days_per_week": 6}
    run = pipeline.Run(case, image)
    RUNS[run.id] = run
    threading.Thread(target=pipeline.execute, args=(run,), daemon=True).start()
    return {"run_id": run.id, "live": meta.available()}


@app.get("/api/run/{rid}")
def poll(rid: str, since: int = 0):
    run = RUNS.get(rid)
    if not run:
        raise HTTPException(404)
    return {"events": run.since(since), "next": since + len(run.since(since)), "decision": run.decision}


@app.post("/api/run/{rid}/decision")
def decide(rid: str, d: Decision):
    run = RUNS.get(rid)
    if not run or not run.result:
        raise HTTPException(409, "no result to review yet")
    if d.action not in ("approve", "modify", "reject"):
        raise HTTPException(400)
    run.decision = {"action": d.action, "note": d.note[:300]}
    run.emit("decision", **run.decision)
    return run.decision


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/static", StaticFiles(directory=STATIC), name="static")
