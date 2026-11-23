"""POST /sources integration checks against an owned, disposable MySQL instance."""

import os
from pathlib import Path
import re
import secrets
import sys
import unittest
from unittest.mock import patch
import uuid

from argon2 import PasswordHasher
import pymysql

sys.path.insert(0, "/app")
import app as backend


def run_id():
    value = os.environ.get("AW26_RUN_ID", "")
    if not re.fullmatch(r"[0-9a-f]{32}", value):
        raise RuntimeError("Use run_sources_integration.py; do not run against the web pod.")
    return value


def query(sql, params=()):
    with backend.get_db_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = list(cur.fetchall())
        conn.commit()
        return rows


def assert_owned_database():
    rows = query("SELECT run_id FROM aw26_test_guard")
    if rows != [{"run_id": run_id()}]:
        raise RuntimeError("Refusing to use a database without this run's test marker.")


def initialize_database():
    token = run_id()
    if query("SHOW TABLES"):
        raise RuntimeError("Test initialization requires a fresh, empty database.")
    with backend.get_db_connection() as conn, conn.cursor() as cur:
        for name in ("init_users.sql", "init_schedules.sql", "init_audits.sql", "init_settings.sql"):
            for statement in (Path("/aw26/sql") / name).read_text().split(";"):
                if statement.strip():
                    cur.execute(statement)
        cur.execute("CREATE TABLE aw26_test_guard (run_id CHAR(32) PRIMARY KEY)")
        cur.execute("INSERT INTO aw26_test_guard VALUES (%s)", (token,))
        conn.commit()


def insert_user(username, password_hash):
    with backend.get_db_connection() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO users (first_name, last_name, email, username, password_hash)
            VALUES ('AW26', 'Fixture', %s, %s, %s)
        """, (username + "@example.invalid", username, password_hash))
        user_id = cur.lastrowid
        conn.commit()
        return user_id


def create_browser_user():
    assert_owned_database()
    insert_user("aw26_browser", PasswordHasher().hash(os.environ["AW26_BROWSER_PASSWORD"]))
    print("Created temporary browser user aw26_browser (ANALYST).")


class SourcesIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert_owned_database()
        backend.app.config.update(TESTING=True)
        cls.password = secrets.token_urlsafe(24)
        cls.password_hash = PasswordHasher().hash(cls.password)

    def setUp(self):
        self.user_ids = []
        self.addCleanup(self.cleanup_records)
        self.username = "aw26_" + uuid.uuid4().hex[:16]
        self.user_ids.append(insert_user(self.username, self.password_hash))
        self.other_username = "aw26_" + uuid.uuid4().hex[:16]
        self.user_ids.append(insert_user(self.other_username, self.password_hash))
        self.client = backend.app.test_client()
        # Exercise the real login endpoint and cookie instead of injecting a session.
        response = self.client.post("/login", json={
            "username": self.username, "password": self.password,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "approved")

    def cleanup_records(self):
        assert_owned_database()
        for user_id in self.user_ids:
            query("DELETE FROM schedules WHERE created_by = %s", (user_id,))
            query("DELETE FROM users WHERE user_id = %s", (user_id,))
            self.assertEqual(query("SELECT user_id FROM users WHERE user_id = %s", (user_id,)), [])

    def source(self):
        return "https://example.invalid/aw26-" + uuid.uuid4().hex

    def schedules(self):
        # A new connection proves the route committed, rather than reading its transaction.
        return query("SELECT schedule_id, created_by, source_link, scan_frequency FROM schedules ORDER BY schedule_id")

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.json["error"]["code"], code)

    def assert_saved(self, response, source, frequency):
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.json), {"data"})
        self.assertEqual(len(response.json["data"]), 1)
        row = response.json["data"][0]
        self.assertEqual(set(row), {"schedule_id", "created_by", "source_link", "scan_frequency"})
        self.assertIsInstance(row["schedule_id"], int)
        self.assertGreater(row["schedule_id"], 0)
        self.assertEqual(row["created_by"], self.user_ids[0])
        self.assertEqual(row["source_link"], source)
        self.assertEqual(row["scan_frequency"], frequency)
        self.assertEqual(query("""
            SELECT schedule_id, created_by, source_link, scan_frequency
            FROM schedules WHERE schedule_id = %s
        """, (row["schedule_id"],)), [row])

    def test_default_weekly_save_is_committed_under_session_owner(self):
        source = self.source() + "?year=2026&tag=IT#reports"
        response = self.client.post("/sources", query_string={"source": source}, json={
            "username": self.other_username, "created_by": self.user_ids[1],
        })
        self.assert_saved(response, source, "WEEKLY")

    def test_supported_frequencies_are_normalized_and_persisted(self):
        for frequency in ("HOURLY", "DAILY", "WEEKLY", "MONTHLY", "monthly", "DaIlY"):
            with self.subTest(frequency=frequency):
                source = self.source()
                response = self.client.post("/sources", query_string={
                    "source": source, "frequency": frequency,
                })
                self.assert_saved(response, source, frequency.upper())

    def test_matching_or_empty_deprecated_user_is_accepted(self):
        for user in (self.username, ""):
            with self.subTest(user="matching" if user else "empty"):
                source = self.source()
                self.assert_saved(self.client.post("/sources", query_string={
                    "source": source, "user": user,
                }), source, "WEEKLY")

    def test_conflicting_user_is_rejected_without_writing(self):
        before = self.schedules()
        response = self.client.post("/sources", query_string={
            "source": self.source(), "user": self.other_username,
        })
        self.assert_error(response, 403, "USER_MISMATCH")
        self.assertEqual(self.schedules(), before)

    def test_username_headers_and_query_cannot_authenticate(self):
        anonymous = backend.app.test_client()
        before = self.schedules()
        for extra in ({}, {"user": self.username}, {"source": "invalid", "frequency": "invalid"}):
            with self.subTest(extra=extra):
                response = anonymous.post("/sources", query_string={"source": self.source(), **extra},
                    headers={"X-Forwarded-User": self.username}, json={"username": self.username})
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json, {"status": "failed", "reason": "authentication required"})
                self.assertEqual(self.schedules(), before)

    def test_invalid_session_cookie_is_rejected_without_writing(self):
        anonymous = backend.app.test_client()
        anonymous.set_cookie("session", "aw26-invalid-cookie")
        before = self.schedules()
        self.assertEqual(anonymous.post("/sources", query_string={"source": self.source()}).status_code, 401)
        self.assertEqual(self.schedules(), before)

    def test_invalid_sources_are_rejected_without_writing(self):
        for source, code in ((None, "MISSING_SOURCE"), ("", "MISSING_SOURCE"),
            ("example.com", "INVALID_SOURCE"), ("https://", "INVALID_SOURCE"),
            ("ftp://example.com", "INVALID_SOURCE"), ("javascript:alert(1)", "INVALID_SOURCE")):
            with self.subTest(source=source):
                before = self.schedules()
                args = {} if source is None else {"source": source}
                self.assert_error(self.client.post("/sources", query_string=args), 400, code)
                self.assertEqual(self.schedules(), before)

    def test_invalid_frequencies_are_rejected_without_writing(self):
        for frequency in ("", "ARCHIVE", "YEARLY", " weekly "):
            with self.subTest(frequency=frequency):
                before = self.schedules()
                response = self.client.post("/sources", query_string={
                    "source": self.source(), "frequency": frequency,
                })
                self.assert_error(response, 400, "INVALID_FREQUENCY")
                self.assertEqual(self.schedules(), before)

    def test_deleted_session_user_is_rejected_without_writing(self):
        query("DELETE FROM users WHERE user_id = %s", (self.user_ids[0],))
        before = self.schedules()
        response = self.client.post("/sources", query_string={"source": self.source()})
        self.assert_error(response, 400, "INVALID_USER")
        self.assertEqual(self.schedules(), before)

    def test_logout_cookie_no_longer_authenticates(self):
        self.assertEqual(self.client.post("/logout").status_code, 200)
        before = self.schedules()
        self.assertEqual(self.client.post("/sources", query_string={"source": self.source()}).status_code, 401)
        self.assertEqual(self.schedules(), before)

    def test_database_connection_failure_is_generic_and_does_not_write(self):
        before = self.schedules()
        with patch.object(backend, "get_db_connection", side_effect=pymysql.OperationalError("AW26 private fault")):
            response = self.client.post("/sources", query_string={"source": self.source()})
        self.assertEqual(response.json, {"error": {"code": "INTERNAL_SERVER_ERROR",
            "message": "Unable to connect to or update the database."}})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private fault", response.get_data(as_text=True))
        self.assertEqual(self.schedules(), before)

    def test_failed_commit_does_not_leave_a_schedule(self):
        before = self.schedules()
        conn = backend.get_db_connection()
        with patch.object(backend, "get_db_connection", return_value=conn), patch.object(
            conn, "commit", side_effect=pymysql.OperationalError("AW26 controlled commit failure"),
        ):
            response = self.client.post("/sources", query_string={"source": self.source()})
        self.assert_error(response, 500, "INTERNAL_SERVER_ERROR")
        self.assertEqual(self.schedules(), before)

    def test_duplicate_does_not_create_or_modify_a_schedule(self):
        # Verify data integrity without making the undocumented duplicate status a contract.
        source = self.source()
        self.assert_saved(self.client.post("/sources", query_string={"source": source}), source, "WEEKLY")
        before = self.schedules()
        response = self.client.post("/sources", query_string={"source": source, "frequency": "MONTHLY"})
        self.assertGreaterEqual(response.status_code, 400)
        self.assertLess(response.status_code, 600)
        self.assertEqual(self.schedules(), before)


if __name__ == "__main__":
    unittest.main()
