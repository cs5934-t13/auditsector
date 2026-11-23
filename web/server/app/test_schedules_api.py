"""Tests for `GET /schedules` and `DELETE /schedules/<id>`.

The database is stubbed: a fake cursor answers the three query shapes the
endpoints issue. The tests cover serialization, the support flag, the
administrator-only delete, the not-found case, and the in-use conflict that
protects existing reports.
"""

import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from app import app
from services.audits.support import is_supported, spider_for_url


def _schedule_row(**overrides):
    row = {
        "schedule_id": 7,
        "source_link": "https://www.seattle.gov/city-auditor/reports",
        "scan_frequency": "WEEKLY",
        "scan_status": "ACTIVE",
        "last_run_at": datetime(2026, 9, 30, 14, 25),
        "last_run_status": "SUCCESS",
        "next_run_at": datetime(2026, 10, 7, 14, 25),
        "created_at": datetime(2026, 9, 1, 9, 0),
        "created_by": 1,
        "created_by_username": "ferguszo",
        "report_count": 12,
    }
    row.update(overrides)
    return row


class FakeCursor:
    """Answers the endpoint queries in order, recording every statement."""

    def __init__(self, *, exists=True, report_count=0, rows=None):
        self.exists = exists
        self.report_count = report_count
        self.rows = rows if rows is not None else []
        self.statements = []
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        normalized = " ".join(sql.split())
        self.statements.append(normalized)
        self.executed.append((normalized, params))

    def fetchall(self):
        return self.rows

    def fetchone(self):
        normalized = self.statements[-1]
        if normalized.startswith("SELECT 1 FROM schedules"):
            return {"1": 1} if self.exists else None
        if "COUNT(*) AS total" in normalized:
            return {"total": self.report_count}
        if normalized.startswith("SELECT"):
            return {"user_id": 1, "user_role": "ADMIN", "user_status": "ACTIVE"}
        return None


def _connection(cursor):
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn


class SupportHelperTests(unittest.TestCase):
    """The web tier's allow-list must agree with the scheduler's."""

    def test_accepts_seattle_and_portland(self):
        self.assertEqual(
            spider_for_url("https://www.seattle.gov/city-auditor/reports"),
            "seattle_wa",
        )
        self.assertEqual(
            spider_for_url("https://www.seattle.gov/city-auditor/reports/"),
            "seattle_wa",
        )
        self.assertEqual(
            spider_for_url("https://efiles.portlandoregon.gov/record/123"),
            "portland_or",
        )

    def test_rejects_other_urls(self):
        for url in (
            "https://www.portland.gov/auditor/reports",
            "https://www.seattle.gov/city-auditor/reports1",
            "https://efiles.portlandoregon.gov/records",
            "ftp://www.seattle.gov/city-auditor/reports",
            "",
            None,
            "not a url",
        ):
            with self.subTest(url=url):
                self.assertIsNone(spider_for_url(url))
                self.assertFalse(is_supported(url))


class ListSchedulesTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _sign_in(self):
        with self.client.session_transaction() as session:
            session["username"] = "analyst"

    def test_requires_authentication(self):
        response = self.client.get("/schedules")
        self.assertEqual(response.status_code, 401)

    def test_returns_schedules_with_derived_fields(self):
        self._sign_in()
        cursor = FakeCursor(rows=[_schedule_row()])

        with patch("db.get_db_connection", return_value=_connection(cursor)):
            response = self.client.get("/schedules")

        self.assertEqual(response.status_code, 200)
        item = response.get_json()["data"][0]
        self.assertEqual(item["schedule_id"], 7)
        self.assertEqual(item["scan_status"], "ACTIVE")
        self.assertTrue(item["is_supported"])
        self.assertEqual(item["report_count"], 12)
        self.assertEqual(item["created_by_username"], "ferguszo")
        self.assertEqual(item["last_run_at"], "2026-09-30T14:25:00")
        self.assertEqual(item["next_run_at"], "2026-10-07T14:25:00")

    def test_flags_an_unsupported_source(self):
        self._sign_in()
        cursor = FakeCursor(
            rows=[_schedule_row(source_link="https://example.gov/reports")]
        )

        with patch("db.get_db_connection", return_value=_connection(cursor)):
            response = self.client.get("/schedules")

        self.assertFalse(response.get_json()["data"][0]["is_supported"])

    def test_unsupported_schedule_keeps_its_parked_status(self):
        self._sign_in()
        cursor = FakeCursor(
            rows=[
                _schedule_row(
                    scan_status="UNSUPPORTED",
                    last_run_status="ERROR",
                    source_link="https://example.gov/reports",
                )
            ]
        )

        with patch("db.get_db_connection", return_value=_connection(cursor)):
            item = self.client.get("/schedules").get_json()["data"][0]

        self.assertEqual(item["scan_status"], "UNSUPPORTED")
        self.assertFalse(item["is_supported"])


class DeleteScheduleTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _sign_in(self, role="ADMIN"):
        with self.client.session_transaction() as session:
            session["username"] = "ferguszo"
            session["role"] = role
        return role

    def test_requires_authentication(self):
        response = self.client.delete("/schedules/7")
        self.assertEqual(response.status_code, 401)

    def test_rejects_non_admin(self):
        self._sign_in("ANALYST")
        cursor = FakeCursor()

        with patch("db.get_db_connection", return_value=_connection(cursor)), \
                patch("auth.current_role",
                      return_value={"user_id": 2, "user_role": "ANALYST",
                                    "user_status": "ACTIVE"}):
            response = self.client.delete("/schedules/7")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["error"]["code"], "FORBIDDEN")
        self.assertFalse(any("DELETE FROM schedules" in s for s in cursor.statements))

    def test_deletes_an_unused_schedule(self):
        self._sign_in()
        cursor = FakeCursor(exists=True, report_count=0)

        with patch("db.get_db_connection", return_value=_connection(cursor)), \
                patch("auth.current_role",
                      return_value={"user_id": 1, "user_role": "ADMIN",
                                    "user_status": "ACTIVE"}):
            response = self.client.delete("/schedules/7")

        self.assertEqual(response.status_code, 204)
        self.assertTrue(any("DELETE FROM schedules" in s for s in cursor.statements))

    def test_unknown_schedule_is_404(self):
        self._sign_in()
        cursor = FakeCursor(exists=False)

        with patch("db.get_db_connection", return_value=_connection(cursor)), \
                patch("auth.current_role",
                      return_value={"user_id": 1, "user_role": "ADMIN",
                                    "user_status": "ACTIVE"}):
            response = self.client.delete("/schedules/99")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"]["code"], "SCHEDULE_NOT_FOUND")

    def test_schedule_with_reports_is_a_conflict(self):
        """`audit_headers.schedule_id` is ON DELETE RESTRICT; say so, don't crash."""
        self._sign_in()
        cursor = FakeCursor(exists=True, report_count=5)

        with patch("db.get_db_connection", return_value=_connection(cursor)), \
                patch("auth.current_role",
                      return_value={"user_id": 1, "user_role": "ADMIN",
                                    "user_status": "ACTIVE"}):
            response = self.client.delete("/schedules/7")

        self.assertEqual(response.status_code, 409)
        body = response.get_json()["error"]
        self.assertEqual(body["code"], "SCHEDULE_IN_USE")
        self.assertIn("5 report", body["message"])
        self.assertFalse(any("DELETE FROM schedules" in s for s in cursor.statements))


if __name__ == "__main__":
    unittest.main()
