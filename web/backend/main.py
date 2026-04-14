from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from auth import (
    SESSION_COOKIE_NAME,
    change_password,
    create_user_account,
    ensure_bootstrap_admin,
    ensure_proxy_access,
    list_user_summaries,
    login_user,
    logout_user,
    require_admin,
    require_current_user,
    require_operator,
    reset_user_password,
    update_user_account,
)
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
from schemas import (
    ChangePasswordRequest,
    CreateUserRequest,
    CurrentUser,
    HistoryEntry,
    LoginRequest,
    MonitorConfig,
    ResetPasswordRequest,
    ScheduleConfig,
    TestConfig,
    UpdateUserRequest,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_db)
    await asyncio.to_thread(ensure_bootstrap_admin)
    await init_monitors()
    yield


app = FastAPI(title="Hive-Run Dashboard", lifespan=lifespan)

# Allow Vite dev server origin during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ── Test endpoints ──

@app.post("/api/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    return login_user(response, body.username, body.password)


@app.post("/api/auth/logout")
async def auth_logout(
    response: Response,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    current_user: CurrentUser = Depends(require_current_user),
):
    logout_user(response, session_id)
    return {"ok": True, "user_id": current_user.id}


@app.get("/api/auth/me")
async def auth_me(current_user: CurrentUser = Depends(require_current_user)):
    return current_user


@app.post("/api/auth/change-password")
async def auth_change_password(
    body: ChangePasswordRequest,
    current_user: CurrentUser = Depends(require_current_user),
):
    return change_password(current_user, body.current_password, body.new_password)


@app.get("/api/users")
async def get_users(current_user: CurrentUser = Depends(require_admin)):
    return list_user_summaries()


@app.post("/api/users")
async def create_user_endpoint(
    body: CreateUserRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    return create_user_account(body)


@app.patch("/api/users/{user_id}")
async def update_user_endpoint(
    user_id: str,
    body: UpdateUserRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    return update_user_account(user_id, body)


@app.post("/api/users/{user_id}/reset-password")
async def reset_user_password_endpoint(
    user_id: str,
    body: ResetPasswordRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    return reset_user_password(user_id, body.new_password)


@app.post("/api/run")
async def run_test(cfg: TestConfig, current_user: CurrentUser = Depends(require_operator)):
    ensure_proxy_access(current_user, cfg.use_proxy)
    job_id = await start_job(cfg)
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
async def job_status(job_id: str, current_user: CurrentUser = Depends(require_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/result/{job_id}")
async def job_result(job_id: str, current_user: CurrentUser = Depends(require_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "running":
        raise HTTPException(status_code=202, detail="Job still running")
    return job


@app.get("/api/history")
async def history(current_user: CurrentUser = Depends(require_current_user)):
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
async def report(filename: str, current_user: CurrentUser = Depends(require_current_user)):
    data = load_report_file(filename)
    if data is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return data


# ── Schedule endpoints ──

@app.get("/api/schedules")
async def get_schedules(current_user: CurrentUser = Depends(require_current_user)):
    return list_schedules()


@app.post("/api/schedules")
async def create_schedule_endpoint(
    cfg: ScheduleConfig,
    current_user: CurrentUser = Depends(require_operator),
):
    ensure_proxy_access(current_user, cfg.test_config.use_proxy)
    schedule = create_schedule(cfg)
    return schedule


@app.get("/api/schedules/{schedule_id}")
async def get_schedule_endpoint(
    schedule_id: str,
    current_user: CurrentUser = Depends(require_current_user),
):
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


class ToggleBody(BaseModel):
    enabled: bool


@app.patch("/api/schedules/{schedule_id}")
async def toggle_schedule_endpoint(
    schedule_id: str,
    body: ToggleBody,
    current_user: CurrentUser = Depends(require_operator),
):
    schedule = toggle_schedule(schedule_id, body.enabled)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule_endpoint(
    schedule_id: str,
    current_user: CurrentUser = Depends(require_operator),
):
    if not delete_schedule(schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}


# ── Monitor endpoints ──

@app.post("/api/monitors")
async def create_monitor_endpoint(
    cfg: MonitorConfig,
    current_user: CurrentUser = Depends(require_operator),
):
    return await create_monitor(cfg)


@app.get("/api/monitors")
async def list_monitors_endpoint(current_user: CurrentUser = Depends(require_current_user)):
    return list_monitors()


@app.get("/api/monitors/{monitor_id}")
async def get_monitor_endpoint(
    monitor_id: str,
    current_user: CurrentUser = Depends(require_current_user),
):
    m = get_monitor(monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.get("/api/monitors/{monitor_id}/history")
async def monitor_history_endpoint(
    monitor_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: CurrentUser = Depends(require_current_user),
):
    if not get_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found")
    return await get_monitor_history(monitor_id, limit)


class MonitorToggleBody(BaseModel):
    enabled: bool


@app.patch("/api/monitors/{monitor_id}")
async def toggle_monitor_endpoint(
    monitor_id: str,
    body: MonitorToggleBody,
    current_user: CurrentUser = Depends(require_operator),
):
    m = await toggle_monitor(monitor_id, body.enabled)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.delete("/api/monitors/{monitor_id}")
async def delete_monitor_endpoint(
    monitor_id: str,
    current_user: CurrentUser = Depends(require_operator),
):
    if not await delete_monitor(monitor_id):
        raise HTTPException(status_code=404, detail="Monitor not found")
    return {"ok": True}


# Serve frontend — must be last so API routes take priority
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
