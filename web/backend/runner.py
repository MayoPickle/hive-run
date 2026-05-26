from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from schemas import JobStatus, TestConfig, TestResult

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

REPORTS_DIR = Path(os.getenv("REPORT_DIR", str(PROJECT_ROOT / "reports"))).expanduser()
_DEFAULT_PROXY_URL = os.getenv("PROXY_URL", "")

_jobs: dict[str, JobStatus] = {}


def get_job(job_id: str) -> Optional[JobStatus]:
    return _jobs.get(job_id)


def list_jobs() -> list[JobStatus]:
    return sorted(_jobs.values(), key=lambda j: j.started_at, reverse=True)


def _build_args(cfg: TestConfig) -> list[str]:
    def _dur(s: str) -> str:
        """Append 'ms' if the string is a bare number (no unit)."""
        return s + "ms" if s.strip().lstrip("-").isdigit() else s

    args = [
        "--target-url", cfg.target_url,
        "--method", cfg.method,
        "--duration", _dur(cfg.duration),
        "--concurrency", str(cfg.concurrency),
        "--ramp-up", _dur(cfg.ramp_up),
        "--timeout", _dur(cfg.timeout),
        "--qps", str(cfg.qps),
        "--stop-on-error-rate", str(cfg.stop_on_error_rate),
        "--stop-on-timeout-rate", str(cfg.stop_on_timeout_rate),
        "--min-samples-before-stop", str(cfg.min_samples_before_stop),
        "--retry-count", str(cfg.retry_count),
        "--retry-backoff", _dur(cfg.retry_backoff),
    ]

    for key, value in cfg.headers.items():
        args.extend(["--header", f"{key}:{value}"])

    if cfg.body:
        args.extend(["--body", cfg.body])

    if cfg.use_proxy and _DEFAULT_PROXY_URL:
        args.extend(["--proxy", _DEFAULT_PROXY_URL])

    return args


async def start_job(cfg: TestConfig) -> str:
    job_id = uuid.uuid4().hex[:12]
    job = JobStatus(
        job_id=job_id,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    _jobs[job_id] = job
    asyncio.create_task(_run_job(job_id, cfg))
    return job_id


async def _run_job(job_id: str, cfg: TestConfig) -> None:
    job = _jobs[job_id]
    args = _build_args(cfg)
    env = os.environ.copy()
    env["REPORT_DIR"] = str(REPORTS_DIR)

    try:
        proc = await asyncio.create_subprocess_exec(
            "go", "run", "./cmd/loadtest", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(PROJECT_ROOT),
            env=env,
        )

        stdout_bytes, stderr_bytes = await proc.communicate()
        stdout_text = stdout_bytes.decode(errors="replace")
        stderr_text = stderr_bytes.decode(errors="replace")

        job.console_output = stdout_text

        if proc.returncode != 0:
            job.status = "failed"
            job.error = stderr_text or stdout_text
            return

        # Parse the console output for stop info
        if "Safety stop: triggered" in stdout_text:
            job.stopped_early = True
            for line in stdout_text.splitlines():
                if "Safety stop: triggered" in line:
                    job.stop_reason = line.split("Safety stop: triggered")[-1].strip("() \n")

        # Find the newest JSON report in reports/
        result = _load_latest_report()
        if result:
            job.result = result
            job.status = "completed"
        else:
            job.status = "failed"
            job.error = "Report file not found after run"

    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)


def _load_latest_report() -> Optional[TestResult]:
    if not REPORTS_DIR.exists():
        return None

    json_files = sorted(REPORTS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not json_files:
        return None

    try:
        data = json.loads(json_files[0].read_text())
        return TestResult(**data)
    except (json.JSONDecodeError, Exception):
        return None


def load_report_file(filename: str) -> Optional[dict]:
    filepath = REPORTS_DIR / filename
    # Prevent path traversal
    if not filepath.resolve().parent == REPORTS_DIR.resolve():
        return None
    if not filepath.exists():
        return None
    try:
        return json.loads(filepath.read_text())
    except (json.JSONDecodeError, Exception):
        return None
