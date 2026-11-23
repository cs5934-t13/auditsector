"""Tests for rejecting unsupported sources at creation.

`POST /sources` refuses a URL no spider can collect. That is what lets the UI stop
evaluating the allow-list: a stored schedule is scannable by construction.
"""

import unittest
from unittest.mock import MagicMock, patch

from app import app


def _connection():
    """A connection whose `users` lookup succeeds and whose insert is recorded."""
    cursor = MagicMock()
    cursor.fetchone.return_value = {"user_id": 1}
    cursor.lastrowid = 42
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


class AddSourceTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "analyst"

    def test_rejects_an_unsupported_source(self):
        conn, cursor = _connection()

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.post(
                "/sources",
                query_string={"source": "https://example.gov/audits"},
            )

        self.assertEqual(response.status_code, 400)
        body = response.get_json()["error"]
        self.assertEqual(body["code"], "UNSUPPORTED_SOURCE")
        # The message must tell the caller what *is* accepted.
        self.assertIn("seattle.gov", body["message"])
        self.assertIn("Supported sources", body["message"])
        # Nothing is written for a rejected source.
        self.assertFalse(
            any("INSERT INTO schedules" in str(call) for call in cursor.execute.call_args_list)
        )

    def test_rejects_a_malformed_url_before_checking_support(self):
        conn, _ = _connection()

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.post(
                "/sources",
                query_string={"source": "not a url"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_SOURCE")

    def test_accepts_a_supported_source(self):
        conn, _ = _connection()

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.post(
                "/sources",
                query_string={
                    "source": "https://www.seattle.gov/city-auditor/reports",
                    "frequency": "WEEKLY",
                },
            )

        self.assertEqual(response.status_code, 201)
        item = response.get_json()["data"][0]
        self.assertEqual(item["schedule_id"], 42)
        # Reports which scanner will collect it, so the client need not re-derive.
        self.assertEqual(item["spider"], "seattle_wa")

    def test_accepts_every_registered_source(self):
        """A regression here means a spider the worker supports is unusable."""
        from supported_sources import SUPPORTED_SOURCES, example_url

        for source in SUPPORTED_SOURCES:
            with self.subTest(spider=source["spider"]):
                conn, _ = _connection()
                with patch("db.get_db_connection", return_value=conn):
                    response = self.client.post(
                        "/sources",
                        query_string={"source": example_url(source)},
                    )
                self.assertEqual(response.status_code, 201)
                self.assertEqual(
                    response.get_json()["data"][0]["spider"], source["spider"]
                )

    def test_rejects_an_unsupported_frequency(self):
        conn, _ = _connection()

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.post(
                "/sources",
                query_string={
                    "source": "https://www.seattle.gov/city-auditor/reports",
                    "frequency": "SOMETIMES",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_FREQUENCY")


if __name__ == "__main__":
    unittest.main()
