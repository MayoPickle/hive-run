"""SQLite persistence layer for uptime monitors."""
from __future__ import annotations

from contextlib import contextmanager
import os
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(os.getenv("HIVE_RUN_DB_PATH", Path(__file__).resolve().parent / "monitors.db"))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def _managed_connection():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _managed_connection() as conn:
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
                display_name    TEXT NOT NULL,
                password_hash   TEXT NOT NULL,
                role            TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
                can_use_proxy   INTEGER NOT NULL DEFAULT 0,
                is_active       INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                last_login_at   TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id              TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at      TEXT NOT NULL,
                expires_at      TEXT NOT NULL,
                last_seen_at    TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_sessions_user
            ON user_sessions (user_id)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry
            ON user_sessions (expires_at)
        """)
        conn.commit()


# ── Monitor CRUD ──────────────────────────────────────────────────────────────

def save_monitor(m: dict[str, Any]) -> None:
    with _managed_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO monitors
                (id, name, url, interval_seconds, timeout_ms, enabled, created_at)
            VALUES (:id, :name, :url, :interval_seconds, :timeout_ms, :enabled, :created_at)
        """, m)
        conn.commit()


def update_monitor_enabled(monitor_id: str, enabled: bool) -> None:
    with _managed_connection() as conn:
        conn.execute(
            "UPDATE monitors SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, monitor_id),
        )
        conn.commit()


def load_all_monitors() -> list[dict[str, Any]]:
    with _managed_connection() as conn:
        rows = conn.execute("SELECT * FROM monitors ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


def delete_monitor_from_db(monitor_id: str) -> bool:
    with _managed_connection() as conn:
        cur = conn.execute("DELETE FROM monitors WHERE id = ?", (monitor_id,))
        conn.commit()
        return cur.rowcount > 0


# ── Probe results ─────────────────────────────────────────────────────────────

def save_probe_result(r: dict[str, Any]) -> None:
    with _managed_connection() as conn:
        conn.execute("""
            INSERT INTO probe_results
                (monitor_id, checked_at, is_up, status_code, latency_ms, error_type)
            VALUES (:monitor_id, :checked_at, :is_up, :status_code, :latency_ms, :error_type)
        """, r)
        conn.commit()


def get_probe_history(monitor_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with _managed_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM probe_results
            WHERE monitor_id = ?
            ORDER BY checked_at DESC
            LIMIT ?
        """, (monitor_id, limit)).fetchall()
        return [dict(r) for r in rows]


def get_last_probe(monitor_id: str) -> dict[str, Any] | None:
    with _managed_connection() as conn:
        row = conn.execute("""
            SELECT * FROM probe_results
            WHERE monitor_id = ?
            ORDER BY checked_at DESC LIMIT 1
        """, (monitor_id,)).fetchone()
        return dict(row) if row else None


def get_uptime_pct(monitor_id: str, since_iso: str) -> float | None:
    """Return uptime percentage [0.0–100.0] since the given ISO timestamp, or None if no data."""
    with _managed_connection() as conn:
        row = conn.execute("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) AS up_count
            FROM probe_results
            WHERE monitor_id = ? AND checked_at >= ?
        """, (monitor_id, since_iso)).fetchone()
        if not row or row["total"] == 0:
            return None
        return round(row["up_count"] / row["total"] * 100, 2)


# ── Users ─────────────────────────────────────────────────────────────────────

def count_users() -> int:
    with _managed_connection() as conn:
        row = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        return int(row["count"]) if row else 0


def count_active_admins() -> int:
    with _managed_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1"
        ).fetchone()
        return int(row["count"]) if row else 0


def create_user(user: dict[str, Any]) -> None:
    with _managed_connection() as conn:
        conn.execute("""
            INSERT INTO users (
                id,
                username,
                display_name,
                password_hash,
                role,
                can_use_proxy,
                is_active,
                created_at,
                updated_at,
                last_login_at
            ) VALUES (
                :id,
                :username,
                :display_name,
                :password_hash,
                :role,
                :can_use_proxy,
                :is_active,
                :created_at,
                :updated_at,
                :last_login_at
            )
        """, user)
        conn.commit()


def list_users() -> list[dict[str, Any]]:
    with _managed_connection() as conn:
        rows = conn.execute("""
            SELECT *
            FROM users
            ORDER BY created_at ASC
        """).fetchall()
        return [dict(r) for r in rows]


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with _managed_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with _managed_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
        return dict(row) if row else None


def update_user(user_id: str, fields: dict[str, Any]) -> bool:
    if not fields:
        return False

    assignments = ", ".join(f"{key} = :{key}" for key in fields)
    params = dict(fields)
    params["user_id"] = user_id

    with _managed_connection() as conn:
        cur = conn.execute(
            f"UPDATE users SET {assignments} WHERE id = :user_id",
            params,
        )
        conn.commit()
        return cur.rowcount > 0


def create_session(session: dict[str, Any]) -> None:
    with _managed_connection() as conn:
        conn.execute("""
            INSERT INTO user_sessions (
                id,
                user_id,
                created_at,
                expires_at,
                last_seen_at
            ) VALUES (
                :id,
                :user_id,
                :created_at,
                :expires_at,
                :last_seen_at
            )
        """, session)
        conn.commit()


def get_session(session_id: str) -> dict[str, Any] | None:
    with _managed_connection() as conn:
        row = conn.execute(
            "SELECT * FROM user_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return dict(row) if row else None


def update_session_last_seen(session_id: str, last_seen_at: str) -> None:
    with _managed_connection() as conn:
        conn.execute(
            "UPDATE user_sessions SET last_seen_at = ? WHERE id = ?",
            (last_seen_at, session_id),
        )
        conn.commit()


def delete_session(session_id: str) -> bool:
    with _managed_connection() as conn:
        cur = conn.execute("DELETE FROM user_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return cur.rowcount > 0


def delete_sessions_for_user(user_id: str) -> None:
    with _managed_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.commit()


def cleanup_expired_sessions(now_iso: str) -> None:
    with _managed_connection() as conn:
        conn.execute("DELETE FROM user_sessions WHERE expires_at <= ?", (now_iso,))
        conn.commit()
