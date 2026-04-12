"""SQLite persistence layer for uptime monitors."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "monitors.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS monitors (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                url             TEXT NOT NULL,
                interval_seconds INTEGER NOT NULL,
                timeout_ms      INTEGER NOT NULL DEFAULT 5000,
                enabled         INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS probe_results (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                monitor_id  TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
                checked_at  TEXT NOT NULL,
                is_up       INTEGER NOT NULL,
                status_code INTEGER,
                latency_ms  REAL,
                error_type  TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_probe_monitor_time
            ON probe_results (monitor_id, checked_at)
        """)
        conn.commit()


# ── Monitor CRUD ──────────────────────────────────────────────────────────────

def save_monitor(m: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO monitors
                (id, name, url, interval_seconds, timeout_ms, enabled, created_at)
            VALUES (:id, :name, :url, :interval_seconds, :timeout_ms, :enabled, :created_at)
        """, m)
        conn.commit()


def update_monitor_enabled(monitor_id: str, enabled: bool) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE monitors SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, monitor_id),
        )
        conn.commit()


def load_all_monitors() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM monitors ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


def delete_monitor_from_db(monitor_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM monitors WHERE id = ?", (monitor_id,))
        conn.commit()
        return cur.rowcount > 0


# ── Probe results ─────────────────────────────────────────────────────────────

def save_probe_result(r: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute("""
            INSERT INTO probe_results
                (monitor_id, checked_at, is_up, status_code, latency_ms, error_type)
            VALUES (:monitor_id, :checked_at, :is_up, :status_code, :latency_ms, :error_type)
        """, r)
        conn.commit()


def get_probe_history(monitor_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute("""
            SELECT * FROM probe_results
            WHERE monitor_id = ?
            ORDER BY checked_at DESC
            LIMIT ?
        """, (monitor_id, limit)).fetchall()
        return [dict(r) for r in rows]


def get_last_probe(monitor_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute("""
            SELECT * FROM probe_results
            WHERE monitor_id = ?
            ORDER BY checked_at DESC LIMIT 1
        """, (monitor_id,)).fetchone()
        return dict(row) if row else None


def get_uptime_pct(monitor_id: str, since_iso: str) -> float | None:
    """Return uptime percentage [0.0–100.0] since the given ISO timestamp, or None if no data."""
    with _connect() as conn:
        row = conn.execute("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) AS up_count
            FROM probe_results
            WHERE monitor_id = ? AND checked_at >= ?
        """, (monitor_id, since_iso)).fetchone()
        if not row or row["total"] == 0:
            return None
        return round(row["up_count"] / row["total"] * 100, 2)
