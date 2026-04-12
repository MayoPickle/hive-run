"""Uptime monitor: async probe loops + state management."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from database import (
    delete_monitor_from_db,
    get_last_probe,
    get_probe_history,
    get_uptime_pct,
    load_all_monitors,
    save_monitor,
    save_probe_result,
    update_monitor_enabled,
)
from schemas import MonitorConfig, MonitorStatus, ProbeResult

_monitors: dict[str, MonitorStatus] = {}
_monitor_tasks: dict[str, asyncio.Task] = {}


# ── Lifecycle ─────────────────────────────────────────────────────────────────

async def init_monitors() -> None:
    """Load persisted monitors from DB, restore last known state, and restart their probe loops."""
    rows = await asyncio.to_thread(load_all_monitors)
    for row in rows:
        status = _row_to_status(row)
        _monitors[status.monitor_id] = status

    # Restore last known probe state and uptime stats concurrently
    async def _restore(s: MonitorStatus) -> None:
        last = await asyncio.to_thread(get_last_probe, s.monitor_id)
        if last:
            s.current_status = "up" if last["is_up"] else "down"
            s.last_checked_at = last["checked_at"]
            s.last_latency_ms = last.get("latency_ms")
        await refresh_uptime(s.monitor_id)

    if _monitors:
        await asyncio.gather(*[_restore(s) for s in _monitors.values()])

    for mid, status in _monitors.items():
        if status.enabled:
            _start_loop(mid)


# ── Public API ────────────────────────────────────────────────────────────────

def list_monitors() -> list[MonitorStatus]:
    return sorted(_monitors.values(), key=lambda m: m.created_at, reverse=True)


def get_monitor(monitor_id: str) -> Optional[MonitorStatus]:
    return _monitors.get(monitor_id)


async def create_monitor(cfg: MonitorConfig) -> MonitorStatus:
    monitor_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()
    status = MonitorStatus(
        monitor_id=monitor_id,
        name=cfg.name,
        url=cfg.url,
        interval_seconds=cfg.interval_seconds,
        timeout_ms=cfg.timeout_ms,
        enabled=True,
        created_at=now,
    )
    _monitors[monitor_id] = status
    await asyncio.to_thread(save_monitor, {
        "id": monitor_id,
        "name": cfg.name,
        "url": cfg.url,
        "interval_seconds": cfg.interval_seconds,
        "timeout_ms": cfg.timeout_ms,
        "enabled": 1,
        "created_at": now,
    })
    _start_loop(monitor_id)
    return status


async def toggle_monitor(monitor_id: str, enabled: bool) -> Optional[MonitorStatus]:
    status = _monitors.get(monitor_id)
    if not status:
        return None
    status.enabled = enabled
    await asyncio.to_thread(update_monitor_enabled, monitor_id, enabled)
    if enabled:
        _start_loop(monitor_id)
    else:
        _stop_loop(monitor_id)
    return status


async def delete_monitor(monitor_id: str) -> bool:
    _stop_loop(monitor_id)
    _monitors.pop(monitor_id, None)
    return await asyncio.to_thread(delete_monitor_from_db, monitor_id)


async def get_monitor_history(monitor_id: str, limit: int = 100) -> list[ProbeResult]:
    rows = await asyncio.to_thread(get_probe_history, monitor_id, limit)
    return [
        ProbeResult(
            id=r["id"],
            monitor_id=r["monitor_id"],
            checked_at=r["checked_at"],
            is_up=bool(r["is_up"]),
            status_code=r.get("status_code"),
            latency_ms=r.get("latency_ms"),
            error_type=r.get("error_type"),
        )
        for r in rows
    ]


async def refresh_uptime(monitor_id: str) -> None:
    """Fetch uptime percentages from DB and update in-memory status."""
    status = _monitors.get(monitor_id)
    if not status:
        return
    now = datetime.now(timezone.utc)
    since_24h = (now - timedelta(hours=24)).isoformat()
    since_7d  = (now - timedelta(days=7)).isoformat()
    since_30d = (now - timedelta(days=30)).isoformat()

    status.uptime_24h, status.uptime_7d, status.uptime_30d = await asyncio.gather(
        asyncio.to_thread(get_uptime_pct, monitor_id, since_24h),
        asyncio.to_thread(get_uptime_pct, monitor_id, since_7d),
        asyncio.to_thread(get_uptime_pct, monitor_id, since_30d),
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _row_to_status(row: dict) -> MonitorStatus:
    return MonitorStatus(
        monitor_id=row["id"],
        name=row["name"],
        url=row["url"],
        interval_seconds=row["interval_seconds"],
        timeout_ms=row["timeout_ms"],
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
    )


def _start_loop(monitor_id: str) -> None:
    _stop_loop(monitor_id)
    task = asyncio.create_task(_probe_loop(monitor_id))
    _monitor_tasks[monitor_id] = task


def _stop_loop(monitor_id: str) -> None:
    task = _monitor_tasks.pop(monitor_id, None)
    if task and not task.done():
        task.cancel()


async def _probe_loop(monitor_id: str) -> None:
    """Run probe checks on a fixed interval until cancelled."""
    while True:
        status = _monitors.get(monitor_id)
        if not status:
            return

        await asyncio.sleep(status.interval_seconds)

        # Re-fetch in case it was deleted while sleeping
        status = _monitors.get(monitor_id)
        if not status or not status.enabled:
            return

        await _do_probe(status)


async def _do_probe(status: MonitorStatus) -> None:
    """Perform a single HTTP probe and persist the result."""
    timeout_secs = status.timeout_ms / 1000.0
    checked_at = datetime.now(timezone.utc).isoformat()
    is_up = False
    status_code = None
    latency_ms = None
    error_type = None

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_secs),
            follow_redirects=True,
        ) as client:
            start = asyncio.get_event_loop().time()
            resp = await client.request("GET", status.url)
            elapsed = asyncio.get_event_loop().time() - start
            status_code = resp.status_code
            latency_ms = round(elapsed * 1000, 2)
            is_up = 200 <= status_code < 400
    except httpx.TimeoutException:
        error_type = "timeout"
    except httpx.ConnectError:
        error_type = "connection_error"
    except Exception as exc:
        error_type = type(exc).__name__

    # Persist to DB
    await asyncio.to_thread(save_probe_result, {
        "monitor_id": status.monitor_id,
        "checked_at": checked_at,
        "is_up": 1 if is_up else 0,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "error_type": error_type,
    })

    # Update in-memory state
    status.current_status = "up" if is_up else "down"
    status.last_checked_at = checked_at
    status.last_latency_ms = latency_ms

    # Refresh uptime stats after each probe
    await refresh_uptime(status.monitor_id)
