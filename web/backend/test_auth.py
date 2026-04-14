from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

from fastapi.testclient import TestClient

warnings.simplefilter("ignore", ResourceWarning)

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

MODULE_NAMES = [
    "main",
    "auth",
    "database",
    "monitor",
    "runner",
    "scheduler",
    "schemas",
]


def load_main_module(db_path: Path, bootstrap_username: str | None = "admin", bootstrap_password: str | None = "AdminPass123!") :
    os.environ["HIVE_RUN_DB_PATH"] = str(db_path)
    if bootstrap_username is None:
        os.environ.pop("AUTH_BOOTSTRAP_ADMIN_USERNAME", None)
    else:
        os.environ["AUTH_BOOTSTRAP_ADMIN_USERNAME"] = bootstrap_username

    if bootstrap_password is None:
        os.environ.pop("AUTH_BOOTSTRAP_ADMIN_PASSWORD", None)
    else:
        os.environ["AUTH_BOOTSTRAP_ADMIN_PASSWORD"] = bootstrap_password

    os.environ["AUTH_SESSION_TTL_HOURS"] = "24"
    os.environ["AUTH_COOKIE_NAME"] = "hive_run_session"

    for name in MODULE_NAMES:
        sys.modules.pop(name, None)

    module = importlib.import_module("main")
    return importlib.reload(module)


class AuthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "hive-run-test.db"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def new_client(self) -> TestClient:
        module = load_main_module(self.db_path)
        return TestClient(module.app)

    def login(self, client: TestClient, username: str, password: str, expected_status: int = 200):
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, expected_status, response.text)
        return response

    def create_user(
        self,
        client: TestClient,
        username: str,
        password: str,
        role: str = "viewer",
        can_use_proxy: bool = False,
        is_active: bool = True,
    ) -> dict:
        response = client.post(
            "/api/users",
            json={
                "username": username,
                "display_name": username.title(),
                "password": password,
                "role": role,
                "can_use_proxy": can_use_proxy,
                "is_active": is_active,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_bootstrap_admin_created_once(self):
        with self.new_client() as client:
            self.login(client, "admin", "AdminPass123!")
            me = client.get("/api/auth/me")
            self.assertEqual(me.status_code, 200, me.text)
            self.assertEqual(me.json()["role"], "admin")

        with self.new_client() as client:
            self.login(client, "admin", "AdminPass123!")
            users = client.get("/api/users")
            self.assertEqual(users.status_code, 200, users.text)
            self.assertEqual(len(users.json()), 1)
            self.assertEqual(users.json()[0]["username"], "admin")

    def test_missing_bootstrap_admin_configuration_fails_startup(self):
        module = load_main_module(self.db_path, bootstrap_username=None, bootstrap_password=None)
        with self.assertRaises(RuntimeError):
            with TestClient(module.app):
                pass

    def test_viewer_is_read_only(self):
        with self.new_client() as admin_client:
            self.login(admin_client, "admin", "AdminPass123!")
            self.create_user(admin_client, "viewer1", "ViewerPass123!", role="viewer")

        with self.new_client() as viewer_client:
            self.login(viewer_client, "viewer1", "ViewerPass123!")
            history = viewer_client.get("/api/history")
            self.assertEqual(history.status_code, 200, history.text)

            create_monitor = viewer_client.post(
                "/api/monitors",
                json={"name": "Test Monitor", "url": "https://example.com", "interval_seconds": 60, "timeout_ms": 5000},
            )
            self.assertEqual(create_monitor.status_code, 403, create_monitor.text)

    def test_operator_can_manage_monitors_but_cannot_use_proxy(self):
        with self.new_client() as admin_client:
            self.login(admin_client, "admin", "AdminPass123!")
            self.create_user(admin_client, "operator1", "OperatorPass123!", role="operator")

        with self.new_client() as operator_client:
            self.login(operator_client, "operator1", "OperatorPass123!")

            create_monitor = operator_client.post(
                "/api/monitors",
                json={"name": "Service API", "url": "https://example.com", "interval_seconds": 60, "timeout_ms": 5000},
            )
            self.assertEqual(create_monitor.status_code, 200, create_monitor.text)

            proxy_run = operator_client.post(
                "/api/run",
                json={"target_url": "https://example.com", "use_proxy": True},
            )
            self.assertEqual(proxy_run.status_code, 403, proxy_run.text)

            proxy_schedule = operator_client.post(
                "/api/schedules",
                json={
                    "name": "Proxy Check",
                    "interval_seconds": 300,
                    "test_config": {"target_url": "https://example.com", "use_proxy": True},
                },
            )
            self.assertEqual(proxy_schedule.status_code, 403, proxy_schedule.text)

    def test_admin_can_reset_password_and_invalidate_existing_sessions(self):
        with self.new_client() as admin_client:
            self.login(admin_client, "admin", "AdminPass123!")
            user = self.create_user(admin_client, "analyst1", "AnalystPass123!", role="viewer")

        with self.new_client() as user_client, self.new_client() as admin_client:
            self.login(user_client, "analyst1", "AnalystPass123!")
            self.login(admin_client, "admin", "AdminPass123!")

            reset = admin_client.post(
                f"/api/users/{user['id']}/reset-password",
                json={"new_password": "NewAnalystPass456!"},
            )
            self.assertEqual(reset.status_code, 200, reset.text)

            stale_session = user_client.get("/api/history")
            self.assertEqual(stale_session.status_code, 401, stale_session.text)

            old_login = user_client.post(
                "/api/auth/login",
                json={"username": "analyst1", "password": "AnalystPass123!"},
            )
            self.assertEqual(old_login.status_code, 401, old_login.text)

            self.login(user_client, "analyst1", "NewAnalystPass456!")

    def test_cannot_disable_or_demote_last_active_admin(self):
        with self.new_client() as client:
            self.login(client, "admin", "AdminPass123!")

            demote = client.patch(
                "/api/users/me-does-not-exist",
                json={"role": "viewer"},
            )
            self.assertEqual(demote.status_code, 404, demote.text)

            users = client.get("/api/users")
            self.assertEqual(users.status_code, 200, users.text)
            admin_user = users.json()[0]

            demote = client.patch(
                f"/api/users/{admin_user['id']}",
                json={"role": "viewer"},
            )
            self.assertEqual(demote.status_code, 400, demote.text)

            disable = client.patch(
                f"/api/users/{admin_user['id']}",
                json={"is_active": False},
            )
            self.assertEqual(disable.status_code, 400, disable.text)


if __name__ == "__main__":
    unittest.main()
