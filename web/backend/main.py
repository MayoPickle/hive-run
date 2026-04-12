from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import init_db
from monitor import (
    create_monitor,
    delete_monitor,
    get_monitor,
    get_monitor_history,
    init_monitors,
    list_monitors,
    toggle_monitor,
)
from runner import REPORTS_DIR, get_job, list_jobs, load_report_file, start_job
from scheduler import (
    create_schedule,
    delete_schedule,
    get_schedule,
    list_schedules,
    toggle_schedule,
)
from schemas import HistoryEntry, MonitorConfig, ScheduleConfig, TestConfig


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_db)
    await init_monitors()
    yield


app = FastAPI(title="Hive-Run Dashboard", lifespan=lifespan)

# Allow Vite dev server origin during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ── Test endpoints ──

@app.post("/api/run")
async def run_test(cfg: TestConfig):
    job_id = await start_job(cfg)
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
async def job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/result/{job_id}")
async def job_result(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "running":
        raise HTTPException(status_code=202, detail="Job still running")
    return job


@app.get("/api/history")
async def history():
    if not REPORTS_DIR.exists():
        return []

    entries: list[HistoryEntry] = []
    for f in sorted(REPORTS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = f.stat()
        entry = HistoryEntry(
            filename=f.name,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            size_bytes=stat.st_size,
        )
        try:
            import json
            data = json.loads(f.read_text())
            entry.total_requests = data.get("total_requests", 0)
            entry.success_rate = data.get("success_rate", 0)
            entry.throughput_rps = data.get("throughput_rps", 0)
            entry.avg_latency_ms = (data.get("latency_ms") or {}).get("average", 0)
            entry.duration_seconds = data.get("duration_seconds", 0)
            entry.target_url = data.get("target_url", "")
        except Exception:
            pass
        entries.append(entry)
    return entries


@app.get("/api/report/{filename}")
async def report(filename: str):
    data = load_report_file(filename)
    if data is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return data


# ── Schedule endpoints ──

@app.get("/api/schedules")
async def get_schedules():
    return list_schedules()


@app.post("/api/schedules")
async def create_schedule_endpoint(cfg: ScheduleConfig):
    schedule = create_schedule(cfg)
    return schedule


@app.get("/api/schedules/{schedule_id}")
async def get_schedule_endpoint(schedule_id: str):
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


class ToggleBody(BaseModel):
    enabled: bool


@app.patch("/api/schedules/{schedule_id}")
async def toggle_schedule_endpoint(schedule_id: str, body: ToggleBody):
    schedule = toggle_schedule(schedule_id, body.enabled)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule_endpoint(schedule_id: str):
    if not delete_schedule(schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}


# ── Monitor endpoints ──

@app.post("/api/monitors")
async def create_monitor_endpoint(cfg: MonitorConfig):
    return await create_monitor(cfg)


@app.get("/api/monitors")
async def list_monitors_endpoint():
    return list_monitors()


@app.get("/api/monitors/{monitor_id}")
async def get_monitor_endpoint(monitor_id: str):
    m = get_monitor(monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.get("/api/monitors/{monitor_id}/history")
async def monitor_history_endpoint(monitor_id: str, limit: int = Query(default=100, ge=1, le=1000)):
    if not get_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found")
    return await get_monitor_history(monitor_id, limit)


class MonitorToggleBody(BaseModel):
    enabled: bool


@app.patch("/api/monitors/{monitor_id}")
async def toggle_monitor_endpoint(monitor_id: str, body: MonitorToggleBody):
    m = await toggle_monitor(monitor_id, body.enabled)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.delete("/api/monitors/{monitor_id}")
async def delete_monitor_endpoint(monitor_id: str):
    if not await delete_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found")
    return {"ok": True}


# Serve frontend — must be last so API routes take priority
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
