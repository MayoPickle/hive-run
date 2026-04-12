from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TestConfig(BaseModel):
    target_url: str
    method: str = "GET"
    duration: str = "30s"
    concurrency: int = 10
    ramp_up: str = "5s"
    timeout: str = "3000"
    qps: int = 0
    headers: dict[str, str] = Field(default_factory=dict)
    body: str = ""
    use_proxy: bool = False
    stop_on_error_rate: float = 0.50
    stop_on_timeout_rate: float = 0.30
    min_samples_before_stop: int = 20
    retry_count: int = 0
    retry_backoff: str = "200"


class LatencySummary(BaseModel):
    average: float = 0
    min: float = 0
    p50: float = 0
    p95: float = 0
    p99: float = 0
    max: float = 0


class TestResult(BaseModel):
    target_url: str = ""
    started_at: str = ""
    finished_at: str = ""
    duration_seconds: float = 0
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    timeout_count: int = 0
    success_rate: float = 0
    throughput_rps: float = 0
    latency_ms: LatencySummary = Field(default_factory=LatencySummary)
    status_codes: dict[str, int] = Field(default_factory=dict)
    error_types: dict[str, int] = Field(default_factory=dict)


class JobStatus(BaseModel):
    job_id: str
    status: str  # "running" | "completed" | "failed"
    started_at: datetime
    console_output: str = ""
    stopped_early: bool = False
    stop_reason: str = ""
    result: Optional[TestResult] = None
    error: str = ""


class HistoryEntry(BaseModel):
    filename: str
    created_at: str
    size_bytes: int
    # summary fields parsed from the report JSON
    target_url: str = ""
    total_requests: int = 0
    success_rate: float = 0
    throughput_rps: float = 0
    avg_latency_ms: float = 0
    duration_seconds: float = 0


class ScheduleConfig(BaseModel):
    name: str = "Untitled Schedule"
    interval_seconds: int = 3600
    test_config: TestConfig


# ── Uptime Monitor schemas ────────────────────────────────────────────────────

class MonitorConfig(BaseModel):
    name: str = "Untitled Monitor"
    url: str
    interval_seconds: int = 60
    timeout_ms: int = 5000


class ProbeResult(BaseModel):
    id: Optional[int] = None
    monitor_id: str
    checked_at: str
    is_up: bool
    status_code: Optional[int] = None
    latency_ms: Optional[float] = None
    error_type: Optional[str] = None


class MonitorStatus(BaseModel):
    monitor_id: str
    name: str
    url: str
    interval_seconds: int
    timeout_ms: int
    enabled: bool
    created_at: str
    current_status: str = "pending"   # "up" | "down" | "pending"
    last_checked_at: Optional[str] = None
    last_latency_ms: Optional[float] = None
    uptime_24h: Optional[float] = None
    uptime_7d: Optional[float] = None
    uptime_30d: Optional[float] = None


class ScheduleStatus(BaseModel):
    schedule_id: str
    name: str
    interval_seconds: int
    test_config: TestConfig
    enabled: bool = True
    created_at: datetime
    run_count: int = 0
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    last_job_id: str = ""
    last_status: str = ""
