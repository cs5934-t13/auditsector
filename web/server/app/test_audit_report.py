
import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime

from app import app


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

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = mock_audit
        mock_cursor.fetchall.return_value = mock_tags

        mock_connection = MagicMock()
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("app.get_db_connection", return_value=mock_connection):
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

    def test_audit_not_found(self):

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None

        mock_connection = MagicMock()
        mock_connection.__enter__.return_value = mock_connection
        mock_connection.cursor.return_value.__enter__.return_value = mock_cursor

        with patch("app.get_db_connection", return_value=mock_connection):
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
