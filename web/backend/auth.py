from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, Response, status

from database import (
    cleanup_expired_sessions,
    count_active_admins,
    count_users,
    create_session,
    create_user,
    delete_session,
    delete_sessions_for_user,
    get_session,
    get_user_by_id,
    get_user_by_username,
    list_users,
    update_session_last_seen,
    update_user,
)
from schemas import (
    CreateUserRequest,
    CurrentUser,
    UpdateUserRequest,
    UserSummary,
)

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 600_000
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
SESSION_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "hive_run_session")
SESSION_TTL_HOURS = max(1, int(os.getenv("AUTH_SESSION_TTL_HOURS", "24")))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().isoformat()


def normalize_username(username: str) -> str:
    normalized = username.strip().lower()
    if not USERNAME_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3-64 characters and use letters, numbers, dots, dashes, or underscores",
        )
    return normalized


def validate_password(password: str) -> str:
    cleaned = password.strip()
    if len(cleaned) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )
    return cleaned


def validate_display_name(display_name: str) -> str:
    cleaned = display_name.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Display name cannot be empty",
        )
    return cleaned


def _encode_bytes(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _decode_bytes(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${_encode_bytes(salt)}${_encode_bytes(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iterations_text, salt_text, digest_text = password_hash.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        iterations = int(iterations_text)
        salt = _decode_bytes(salt_text)
        expected = _decode_bytes(digest_text)
    except (TypeError, ValueError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def to_current_user(row: dict) -> CurrentUser:
    return CurrentUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=row["role"],
        can_use_proxy=bool(row["can_use_proxy"]),
        is_active=bool(row["is_active"]),
        last_login_at=row.get("last_login_at"),
    )


def to_user_summary(row: dict) -> UserSummary:
    return UserSummary(
        **to_current_user(row).model_dump(),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        max_age=SESSION_TTL_HOURS * 3600,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def ensure_bootstrap_admin() -> None:
    if count_users() > 0:
        return

    username = os.getenv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "").strip()
    password = os.getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "")
    if not username or not password:
        raise RuntimeError(
            "No users exist. Set AUTH_BOOTSTRAP_ADMIN_USERNAME and AUTH_BOOTSTRAP_ADMIN_PASSWORD before starting the server."
        )

    normalized_username = normalize_username(username)
    validated_password = validate_password(password)
    now_iso = utcnow_iso()
    create_user(
        {
            "id": uuid.uuid4().hex,
            "username": normalized_username,
            "display_name": normalized_username,
            "password_hash": hash_password(validated_password),
            "role": "admin",
            "can_use_proxy": 1,
            "is_active": 1,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_login_at": None,
        }
    )


def _create_session_for_user(user_id: str) -> str:
    session_id = secrets.token_urlsafe(32)
    now = utcnow()
    create_session(
        {
            "id": session_id,
            "user_id": user_id,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=SESSION_TTL_HOURS)).isoformat(),
            "last_seen_at": now.isoformat(),
        }
    )
    return session_id


def login_user(response: Response, username: str, password: str) -> CurrentUser:
    try:
        normalized_username = normalize_username(username)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        ) from None

    row = get_user_by_username(normalized_username)
    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not bool(row["is_active"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    now_iso = utcnow_iso()
    update_user(row["id"], {"last_login_at": now_iso})
    row = get_user_by_id(row["id"]) or row

    session_id = _create_session_for_user(row["id"])
    _set_session_cookie(response, session_id)
    return to_current_user(row)


def logout_user(response: Response, session_id: str | None) -> None:
    if session_id:
        delete_session(session_id)
    clear_session_cookie(response)


def _load_authenticated_user(session_id: str) -> CurrentUser:
    now_iso = utcnow_iso()
    cleanup_expired_sessions(now_iso)

    session = get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if session["expires_at"] <= now_iso:
        delete_session(session_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    row = get_user_by_id(session["user_id"])
    if not row or not bool(row["is_active"]):
        delete_session(session_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    update_session_last_seen(session_id, now_iso)
    return to_current_user(row)


def require_current_user(session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> CurrentUser:
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return _load_authenticated_user(session_id)


def require_operator(current_user: CurrentUser = Depends(require_current_user)) -> CurrentUser:
    if current_user.role not in {"operator", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator or admin access is required",
        )
    return current_user


def require_admin(current_user: CurrentUser = Depends(require_current_user)) -> CurrentUser:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access is required",
        )
    return current_user


def ensure_proxy_access(current_user: CurrentUser, use_proxy: bool) -> None:
    if use_proxy and not current_user.can_use_proxy:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Proxy access is not allowed for this account",
        )


def list_user_summaries() -> list[UserSummary]:
    return [to_user_summary(row) for row in list_users()]


def create_user_account(payload: CreateUserRequest) -> UserSummary:
    now_iso = utcnow_iso()
    username = normalize_username(payload.username)
    password = validate_password(payload.password)

    record = {
        "id": uuid.uuid4().hex,
        "username": username,
        "display_name": validate_display_name(payload.display_name),
        "password_hash": hash_password(password),
        "role": payload.role,
        "can_use_proxy": 1 if payload.can_use_proxy else 0,
        "is_active": 1 if payload.is_active else 0,
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_login_at": None,
    }
    try:
        create_user(record)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        ) from exc
    return to_user_summary(record)


def _assert_not_last_admin(target_row: dict, requested_role: str, requested_active: bool) -> None:
    if target_row["role"] != "admin" or not bool(target_row["is_active"]):
        return
    if requested_role == "admin" and requested_active:
        return
    if count_active_admins() <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one active admin must remain",
        )


def update_user_account(user_id: str, payload: UpdateUserRequest) -> UserSummary:
    row = get_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    requested_role = payload.role or row["role"]
    requested_active = payload.is_active if payload.is_active is not None else bool(row["is_active"])
    _assert_not_last_admin(row, requested_role, requested_active)

    updates: dict[str, object] = {"updated_at": utcnow_iso()}
    if payload.display_name is not None:
        updates["display_name"] = validate_display_name(payload.display_name)
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.can_use_proxy is not None:
        updates["can_use_proxy"] = 1 if payload.can_use_proxy else 0
    if payload.is_active is not None:
        updates["is_active"] = 1 if payload.is_active else 0

    if not update_user(user_id, updates):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.is_active is False:
        delete_sessions_for_user(user_id)

    updated = get_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return to_user_summary(updated)


def reset_user_password(user_id: str, new_password: str) -> UserSummary:
    row = get_user_by_id(user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    updates = {
        "password_hash": hash_password(validate_password(new_password)),
        "updated_at": utcnow_iso(),
    }
    update_user(user_id, updates)
    delete_sessions_for_user(user_id)

    updated = get_user_by_id(user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return to_user_summary(updated)


def change_password(current_user: CurrentUser, current_password: str, new_password: str) -> CurrentUser:
    row = get_user_by_id(current_user.id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(current_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    update_user(
        current_user.id,
        {
            "password_hash": hash_password(validate_password(new_password)),
            "updated_at": utcnow_iso(),
        },
    )

    updated = get_user_by_id(current_user.id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return to_current_user(updated)
