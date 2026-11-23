"""Route-level tests for user management.

These exercise the Flask views through `app.test_client()` with the `Users`
service replaced by an in-memory fake, so they run without MySQL. Authorization
rules (who may change what) are the point of these tests; the real SQL is
covered by `services/users/users_test.py`.

Run from `web/server/app`:

    python -m pytest services/users/app_routes_test.py

`FLASK_SECRET_KEY` only needs to be set, not meaningful.
"""

import os
import sys
from datetime import datetime

import pytest

os.environ.setdefault("FLASK_SECRET_KEY", "test-only-secret")
os.environ.setdefault("MYSQL_ROOT_PASSWORD", "test")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import app as app_module  # noqa: E402
import auth as auth_module  # noqa: E402
from blueprints import users as users_blueprint  # noqa: E402


def make_row(**overrides):
    row = {
        "user_id": 1,
        "first_name": "Jordan",
        "last_name": "Doe",
        "email": "jdoe@example.gov",
        "username": "jdoe",
        "user_role": "ADMIN",
        "user_status": "ACTIVE",
        "created_at": datetime(2026, 1, 2, 3, 4, 5),
        "updated_at": datetime(2026, 1, 2, 3, 4, 5),
    }
    row.update(overrides)
    return row


class FakeUsers:
    """Minimal in-memory stand-in for `services.users.users.Users`."""

    def __init__(self, rows=None):
        self.rows = {row["user_id"]: dict(row) for row in (rows or [])}
        self.passwords = {}
        self.calls = []

    # -- lookups ---------------------------------------------------------
    def get_users(self, include_inactive=False):
        return [
            row
            for row in self.rows.values()
            if include_inactive or row["user_status"] == "ACTIVE"
        ]

    def get_user(self, user_id, include_inactive=False):
        self.calls.append(("get_user", user_id))
        row = self.rows.get(int(user_id))
        if row is None:
            return None
        if not include_inactive and row["user_status"] != "ACTIVE":
            return None
        return dict(row)

    def get_user_by_username(self, username, include_inactive=False):
        for row in self.rows.values():
            if row["username"] == username:
                if not include_inactive and row["user_status"] != "ACTIVE":
                    return None
                return dict(row)
        return None

    def verify_password(self, user_id, password):
        self.calls.append(("verify_password", user_id))
        return self.passwords.get(int(user_id)) == password

    # -- mutations -------------------------------------------------------
    def add_user(self, first_name, last_name, email, username, password, role, status):
        if not self.valid_user(
            first_name, last_name, email, username, password, role, status
        ):
            raise ValueError
        user_id = max(self.rows, default=0) + 1
        now = datetime(2026, 1, 2, 3, 4, 5)
        self.rows[user_id] = {
            "user_id": user_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "username": username,
            "user_role": role,
            "user_status": status,
            "created_at": now,
            "updated_at": now,
        }
        self.passwords[user_id] = password
        return user_id

    @staticmethod
    def valid_user(first_name, last_name, email, username, password, role, status):
        return (
            all(
                isinstance(v, str) and v.strip()
                for v in (first_name, last_name, email, username)
            )
            and password
            and role in ("ADMIN", "ANALYST")
            and status in ("ACTIVE", "INACTIVE")
        )

    def deactivate_user(self, user_id):
        row = self.rows.get(int(user_id))
        if row is None or row["user_status"] != "ACTIVE":
            return False
        row["user_status"] = "INACTIVE"
        return True

    def reactivate_user(self, user_id):
        row = self.rows.get(int(user_id))
        if row is None or row["user_status"] != "INACTIVE":
            return False
        row["user_status"] = "ACTIVE"
        return True

    def update_user(
        self,
        user_id,
        first_name=None,
        last_name=None,
        email=None,
        username=None,
        password=None,
        role=None,
        status=None,
    ):
        row = self.rows.get(int(user_id))
        if row is None:
            return False

        if role is not None and role not in ("ADMIN", "ANALYST"):
            raise ValueError("bad role")
        if status is not None and status not in ("ACTIVE", "INACTIVE"):
            raise ValueError("bad status")

        changes = {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "username": username,
            "user_role": role,
            "user_status": status,
        }
        if all(value is None for value in changes.values()) and password is None:
            raise ValueError("No fields to update")

        for column, value in changes.items():
            if value is not None:
                row[column] = value
        if password:
            self.passwords[int(user_id)] = password
        return True


ADMIN = make_row(user_id=1, username="admin", user_role="ADMIN")
ANALYST = make_row(
    user_id=2, username="analyst", user_role="ANALYST", email="analyst@example.gov"
)


@pytest.fixture
def client(monkeypatch):
    fake = FakeUsers([ADMIN, ANALYST])
    fake.passwords = {1: "admin-pw", 2: "analyst-pw"}
    # The views read `Users` from the blueprint module, not from `app`.
    monkeypatch.setattr(users_blueprint, "Users", lambda *a, **kw: fake)

    def fake_current_role(username):
        """The real `current_role` queries MySQL; read the fake instead.

        It returns the same three keys the views rely on (`user_id`,
        `user_role`, `user_status`), so the authorization paths under test run
        unchanged.
        """
        row = fake.get_user_by_username(username, include_inactive=True)
        if row is None:
            return None
        return {
            "user_id": row["user_id"],
            "user_role": row["user_role"],
            "user_status": row["user_status"],
        }

    # `current_role` is imported by name into the blueprint and the auth
    # guards, so every reader must be patched.
    monkeypatch.setattr(users_blueprint, "current_role", fake_current_role)
    monkeypatch.setattr(auth_module, "current_role", fake_current_role)

    application = app_module.app
    application.config.update(TESTING=True)
    with application.test_client() as test_client:
        test_client.fake = fake
        yield test_client


def sign_in(test_client, username, user_id, role):
    """Seeds the session the way `/login` would, without hitting the database."""
    with test_client.session_transaction() as session:
        session["username"] = username
        session["role"] = role
        session["user_id"] = user_id


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


def test_anonymous_cannot_list_users(client):
    assert client.get("/user").status_code == 401


def test_analyst_cannot_list_users(client):
    sign_in(client, "analyst", 2, "ANALYST")
    assert client.get("/user").status_code == 403


def test_admin_can_list_users(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.get("/user")

    assert response.status_code == 200
    body = response.get_json()
    assert [row["username"] for row in body["data"]] == ["admin", "analyst"]
    assert "password_hash" not in body["data"][0]


def test_admin_can_request_archived_users(client):
    sign_in(client, "admin", 1, "ADMIN")
    client.fake.rows[2]["user_status"] = "INACTIVE"

    assert len(client.get("/user").get_json()["data"]) == 1
    assert len(client.get("/user?include_inactive=true").get_json()["data"]) == 2


def test_analyst_cannot_add_users(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.post(
        "/user",
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": "new@example.gov",
            "username": "newperson",
            "password": "secret",
            "user_role": "ANALYST",
            "user_status": "ACTIVE",
        },
    )

    assert response.status_code == 403


def test_analyst_cannot_archive_users(client):
    sign_in(client, "analyst", 2, "ANALYST")
    assert client.delete("/user/1").status_code == 403


def test_analyst_cannot_edit_somebody_else(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/user/1", json={"first_name": "Hacked"})
    assert response.status_code == 403


def test_analyst_cannot_promote_themselves(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/user/2", json={"user_role": "ADMIN"})

    assert response.status_code == 403
    assert client.fake.rows[2]["user_role"] == "ANALYST"


def test_analyst_cannot_reactivate_themselves(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/user/2", json={"user_status": "ACTIVE"})
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Admin workflows
# ---------------------------------------------------------------------------


def test_admin_adds_a_user(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.post(
        "/user",
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": "new@example.gov",
            "username": "newperson",
            "password": "secret",
            "user_role": "ANALYST",
            "user_status": "ACTIVE",
        },
    )

    assert response.status_code == 201
    body = response.get_json()["data"]
    assert body["username"] == "newperson"
    assert body["user_status"] == "ACTIVE"
    assert "password_hash" not in body


def test_admin_add_accepts_short_role_and_status_names(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.post(
        "/user",
        json={
            "first_name": "Short",
            "last_name": "Names",
            "email": "short@example.gov",
            "username": "shortnames",
            "password": "secret",
            "role": "ADMIN",
            "status": "ACTIVE",
        },
    )

    assert response.status_code == 201
    assert response.get_json()["data"]["user_role"] == "ADMIN"


def test_admin_add_rejects_missing_fields(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.post("/user", json={"first_name": "Only", "last_name": "This"})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "INVALID_USER"


def test_admin_edits_a_user_without_changing_the_id(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put(
        "/user/2",
        json={"first_name": "Renamed", "user_role": "ADMIN", "user_status": "ACTIVE"},
    )

    assert response.status_code == 200
    body = response.get_json()["data"]
    assert body["user_id"] == 2
    assert body["first_name"] == "Renamed"
    assert body["user_role"] == "ADMIN"


def test_admin_cannot_send_user_id_in_the_body(client):
    """`user_id` is ignored: identity comes from the URL only."""
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/2", json={"user_id": 99, "first_name": "StillTwo"})

    assert response.status_code == 200
    assert response.get_json()["data"]["user_id"] == 2


def test_admin_resetting_somebody_elses_password_needs_no_current_password(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/2", json={"password": "reset-by-admin"})

    assert response.status_code == 200
    assert client.fake.passwords[2] == "reset-by-admin"


def test_admin_cannot_demote_themselves(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/1", json={"user_role": "ANALYST"})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "INVALID_USER"
    assert client.fake.rows[1]["user_role"] == "ADMIN"


def test_admin_cannot_demote_themselves_via_the_role_alias(client):
    """The short `role` spelling must not bypass the self-demote guard."""
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/1", json={"role": "ANALYST"})

    assert response.status_code == 422
    assert client.fake.rows[1]["user_role"] == "ADMIN"


def test_admin_can_demote_a_different_admin(client):
    """The guard is about the caller's own account, not about ADMIN rows."""
    sign_in(client, "admin", 1, "ADMIN")
    client.fake.rows[2]["user_role"] = "ADMIN"

    response = client.put("/user/2", json={"user_role": "ANALYST"})

    assert response.status_code == 200
    assert client.fake.rows[2]["user_role"] == "ANALYST"


def test_admin_keeps_their_role_on_an_unrelated_edit(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put(
        "/user/1",
        json={"user_role": "ADMIN", "first_name": "Jordan"},
    )

    assert response.status_code == 200
    assert client.fake.rows[1]["user_role"] == "ADMIN"
    assert client.fake.rows[1]["first_name"] == "Jordan"


def test_admin_cannot_archive_themselves(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.delete("/user/1")

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "INVALID_USER"
    assert client.fake.rows[1]["user_status"] == "ACTIVE"


def test_admin_cannot_deactivate_themselves_via_put(client):
    """`PUT` with `user_status` is the other way to self-archive."""
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/1", json={"user_status": "INACTIVE"})

    assert response.status_code == 422
    assert client.fake.rows[1]["user_status"] == "ACTIVE"


def test_admin_cannot_deactivate_themselves_via_the_status_alias(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/user/1", json={"status": "INACTIVE"})

    assert response.status_code == 422
    assert client.fake.rows[1]["user_status"] == "ACTIVE"


def test_admin_cannot_deactivate_themselves_via_the_profile_endpoint(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/profile", json={"user_status": "INACTIVE"})

    # `/profile` shares the same implementation, so the self-guard applies here
    # too rather than only on `/user/<id>`.
    assert response.status_code == 422
    assert client.fake.rows[1]["user_status"] == "ACTIVE"


def test_admin_cannot_demote_themselves_via_the_profile_endpoint(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.put("/profile", json={"user_role": "ANALYST"})

    assert response.status_code == 422
    assert client.fake.rows[1]["user_role"] == "ADMIN"


def test_admin_can_archive_a_different_admin(client):
    sign_in(client, "admin", 1, "ADMIN")
    client.fake.rows[2]["user_role"] = "ADMIN"

    response = client.delete("/user/2")

    assert response.status_code == 200
    assert client.fake.rows[2]["user_status"] == "INACTIVE"


def test_archive_keeps_the_row(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.delete("/user/2")

    assert response.status_code == 200
    assert response.get_json()["data"]["user_status"] == "INACTIVE"
    # The account still exists, just archived.
    assert 2 in client.fake.rows
    assert client.fake.rows[2]["user_status"] == "INACTIVE"


def test_archiving_an_unknown_user_is_a_404(client):
    sign_in(client, "admin", 1, "ADMIN")
    response = client.delete("/user/999")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "USER_NOT_FOUND"


def test_admin_restores_an_archived_user(client):
    sign_in(client, "admin", 1, "ADMIN")
    client.fake.rows[2]["user_status"] = "INACTIVE"

    response = client.post("/user/2/restore")

    assert response.status_code == 200
    assert response.get_json()["data"]["user_status"] == "ACTIVE"


def test_restoring_an_active_user_is_a_404(client):
    sign_in(client, "admin", 1, "ADMIN")
    assert client.post("/user/2/restore").status_code == 404


# ---------------------------------------------------------------------------
# Self service
# ---------------------------------------------------------------------------


def test_analyst_reads_their_own_profile(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.get("/profile")

    assert response.status_code == 200
    body = response.get_json()["data"]
    assert body["user_id"] == 2
    assert body["username"] == "analyst"
    assert "password_hash" not in body


def test_analyst_reader_of_somebody_else_is_forbidden(client):
    sign_in(client, "analyst", 2, "ANALYST")
    assert client.get("/user/1").status_code == 403


def test_analyst_updates_their_own_details(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put(
        "/profile",
        json={"first_name": "NewFirst", "email": "new-analyst@example.gov"},
    )

    assert response.status_code == 200
    body = response.get_json()["data"]
    assert body["first_name"] == "NewFirst"
    assert body["user_id"] == 2


def test_password_change_requires_the_current_password(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/profile", json={"password": "brand-new"})

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "CURRENT_PASSWORD_REQUIRED"
    assert client.fake.passwords[2] == "analyst-pw"


def test_password_change_rejects_a_wrong_current_password(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put(
        "/profile",
        json={"password": "brand-new", "current_password": "not-my-password"},
    )

    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
    assert client.fake.passwords[2] == "analyst-pw"


def test_password_change_succeeds_with_the_right_current_password(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put(
        "/profile",
        json={"password": "brand-new", "current_password": "analyst-pw"},
    )

    assert response.status_code == 200
    assert client.fake.passwords[2] == "brand-new"


def test_profile_rejects_role_changes(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/profile", json={"user_role": "ADMIN"})

    assert response.status_code == 403
    assert client.fake.rows[2]["user_role"] == "ANALYST"


def test_username_change_keeps_the_session_usable(client):
    sign_in(client, "analyst", 2, "ANALYST")
    response = client.put("/profile", json={"username": "renamed"})

    assert response.status_code == 200

    with client.session_transaction() as session:
        assert session["username"] == "renamed"


def test_anonymous_cannot_touch_the_profile(client):
    assert client.get("/profile").status_code == 401
    assert client.put("/profile", json={"first_name": "X"}).status_code == 401


def test_deactivated_admin_loses_access_immediately(client):
    sign_in(client, "admin", 1, "ADMIN")
    # A deactivated account is rejected by the live role lookup, not the
    # session snapshot taken at login.
    client.fake.rows[1]["user_status"] = "INACTIVE"

    assert client.get("/user").status_code == 401
