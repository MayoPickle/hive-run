from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from schemas import ScheduleConfig, ScheduleStatus, TestConfig


_schedules: dict[str, ScheduleStatus] = {}
_schedule_tasks: dict[str, asyncio.Task] = {}


def list_schedules() -> list[ScheduleStatus]:
    return sorted(_schedules.values(), key=lambda s: s.created_at, reverse=True)


def get_schedule(schedule_id: str) -> Optional[ScheduleStatus]:
    return _schedules.get(schedule_id)


def create_schedule(cfg: ScheduleConfig) -> ScheduleStatus:
    schedule_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc)
    schedule = ScheduleStatus(
        schedule_id=schedule_id,
        name=cfg.name,
        interval_seconds=cfg.interval_seconds,
        test_config=cfg.test_config,
        enabled=True,
        created_at=now,
        run_count=0,
        last_run_at=None,
        next_run_at=now,
        last_status="",
    )
    _schedules[schedule_id] = schedule
    _start_schedule_loop(schedule_id)
    return schedule


def toggle_schedule(schedule_id: str, enabled: bool) -> Optional[ScheduleStatus]:
    schedule = _schedules.get(schedule_id)
    if not schedule:
        return None
    schedule.enabled = enabled
    if enabled:
        _start_schedule_loop(schedule_id)
    else:
        _stop_schedule_loop(schedule_id)
        schedule.next_run_at = None
    return schedule


def delete_schedule(schedule_id: str) -> bool:
    _stop_schedule_loop(schedule_id)
    return _schedules.pop(schedule_id, None) is not None


def _start_schedule_loop(schedule_id: str) -> None:
    _stop_schedule_loop(schedule_id)
    task = asyncio.create_task(_schedule_loop(schedule_id))
    _schedule_tasks[schedule_id] = task


def _stop_schedule_loop(schedule_id: str) -> None:
    task = _schedule_tasks.pop(schedule_id, None)
    if task and not task.done():
        task.cancel()


async def _schedule_loop(schedule_id: str) -> None:
    # Import here to avoid circular dependency
    from runner import start_job, get_job

    schedule = _schedules.get(schedule_id)
    if not schedule:
        return

    try:
        while True:
            if not schedule.enabled:
                return

            # Update next_run_at
            now = datetime.now(timezone.utc)
            schedule.next_run_at = now

            # Run the test
            try:
                job_id = await start_job(schedule.test_config)
                schedule.last_run_at = datetime.now(timezone.utc)
                schedule.run_count += 1
                schedule.last_job_id = job_id
                schedule.last_status = "running"

                # Wait for the job to complete
                while True:
                    await asyncio.sleep(2)
                    job = get_job(job_id)
                    if not job or job.status != "running":
                        break

                if job:
                    schedule.last_status = job.status
                else:
                    schedule.last_status = "unknown"

            except Exception as exc:
                schedule.last_status = f"error: {exc}"

            # Sleep until next run
            await asyncio.sleep(schedule.interval_seconds)

    except asyncio.CancelledError:
        return
