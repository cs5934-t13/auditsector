
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime

from app import app


def _connection(schema_rows, audit, tags):
    """Builds a mocked connection that answers the endpoint's three queries.

    `fetchall` is shared by the schema probe and the tag query, so it returns
    the schema rows first and the tag rows second; `fetchone` returns the audit.
    """
    cursor = MagicMock()
    cursor.fetchone.return_value = audit
    cursor.fetchall.side_effect = [schema_rows, tags]

    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor
    return connection


MODERN_SCHEMA = [
    {"TABLE_NAME": "audit_headers", "COLUMN_NAME": "muni"},
    {"TABLE_NAME": "audit_headers", "COLUMN_NAME": "audit_url"},
    {"TABLE_NAME": "tags", "COLUMN_NAME": "description"},
]

# A database that never ran data/migrations/scheduler_fetcher.py.
LEGACY_SCHEMA = []


class TestAuditReportEndpoint(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_get_audit_report(self):

        mock_audit = {
            "audit_id": "test-audit-123",
            "schedule_id": 1,
            "title": "Emergency Communications Audit",
            "muni": "Portland",
            "audit_url": "https://example.gov/report.pdf",
            "audit_date": datetime(2026, 9, 15),
            "risk_level": "INFO",
            "run_status": "COMPLETED",
            "summary": "The audit identified staffing and training challenges.",
            "created_at": datetime(2026, 9, 30),
        }

        mock_tags = [
            {
                "tag_id": 6,
                "name": "Human Resources",
                "description": None,
            }
        ]

        mock_connection = _connection(MODERN_SCHEMA, mock_audit, mock_tags)

        with patch("db.get_db_connection", return_value=mock_connection):
            with self.client.session_transaction() as session:
                session["username"] = "testuser"

            response = self.client.get("/audits/test-audit-123")

        self.assertEqual(response.status_code, 200)

        data = response.get_json()["data"]

        self.assertEqual(data["audit_id"], "test-audit-123")
        self.assertEqual(
            data["summary"],
            "The audit identified staffing and training challenges.",
        )
        self.assertEqual(data["tags"][0]["name"], "Human Resources")

    def test_get_audit_report_on_a_pre_migration_database(self):
        """`muni` and `audit_url` are optional, so a legacy row still renders."""

        legacy_audit = {
            "audit_id": 1,
            "schedule_id": 2,
            "title": "Legacy Audit",
            "audit_date": datetime(2026, 9, 10),
            "risk_level": "HIGH",
            "run_status": "COMPLETED",
            "summary": "Legacy summary.",
            "created_at": datetime(2026, 9, 30, 10),
        }
        legacy_tags = [{"tag_id": 2, "name": "Fixed Assets"}]

        mock_connection = _connection(LEGACY_SCHEMA, legacy_audit, legacy_tags)

        with patch("db.get_db_connection", return_value=mock_connection):
            with self.client.session_transaction() as session:
                session["username"] = "testuser"

            response = self.client.get("/audits/1")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual(data["audit_id"], "1")
        # Absent columns come back as empty strings, not a KeyError/500.
        self.assertEqual(data["municipality"], "")
        self.assertEqual(data["audit_url"], "")
        # Missing `description` is normalized so the response shape is stable.
        self.assertIsNone(data["tags"][0]["description"])

    def test_audit_not_found(self):

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.fetchall.return_value = []

        mock_connection = MagicMock()
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("db.get_db_connection", return_value=mock_connection):
            with self.client.session_transaction() as session:
                session["username"] = "testuser"

            response = self.client.get("/audits/nonexistent")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json()["error"]["code"],
            "AUDIT_NOT_FOUND",
        )


if __name__ == "__main__":
    unittest.main()
