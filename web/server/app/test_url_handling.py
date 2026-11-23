"""Guards two URL-routing decisions that are easy to regress.

1. A trailing slash is insignificant. Flask matches paths exactly by default, so
   `/api/tags/` was a 404 while `/api/tags` worked — which punished hand-typed
   URLs and curl while the browser client happened to omit the slash.
2. The legacy `GET /tag` and `GET /tag/<id>` endpoints are gone. They returned
   raw `tags` rows with no counts, had no callers, and overlapped `/tags`.

These use a mocked connection so no database is required.
"""

import unittest
from unittest.mock import patch, MagicMock

from app import app


def _connection(rows):
    """Minimal connection answering the tag index's column probe and rows."""
    cursor = MagicMock()
    cursor.fetchall.side_effect = [
        [
            {"COLUMN_NAME": "tag_id"},
            {"COLUMN_NAME": "name"},
            {"COLUMN_NAME": "description"},
            {"COLUMN_NAME": "boundary"},
        ],
        rows,
    ]
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn


class TestTrailingSlash(unittest.TestCase):
    """A trailing slash must not change the response."""

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "testuser"

    def test_tag_index_accepts_a_trailing_slash(self):
        """`/tags` and `/tags/` return the same tag list."""
        rows = [{"tag_id": 1, "name": "Inventory", "report_count": 0,
                 "description": "Stock and supplies.", "boundary": "Not capital."}]

        for path in ("/tags", "/tags/"):
            with self.subTest(path=path):
                with patch("db.get_db_connection", side_effect=lambda: _connection(rows)):
                    response = self.client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.get_json()["data"][0]["name"], "Inventory")

    @staticmethod
    def _tag_audits_connection():
        """Fresh connection per request: each call consumes its own mocks."""
        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            # column probe
            [{"COLUMN_NAME": "tag_id"}, {"COLUMN_NAME": "name"},
             {"COLUMN_NAME": "description"}, {"COLUMN_NAME": "boundary"}],
            # tag table for resolution
            [{"tag_id": 1, "name": "Inventory", "description": "D", "boundary": "B"}],
            # tag names for the (empty) page
            [],
        ]
        cursor.fetchone.side_effect = [
            {"boundary": "B"},        # boundary lookup
            {"total_items": 0},       # COUNT(*)
        ]
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn

    def test_tag_audits_accepts_a_trailing_slash(self):
        """The reported bug: `/api/tags/<tag>/audits/` returned 404."""
        for path in ("/tags/inventory/audits", "/tags/inventory/audits/"):
            with self.subTest(path=path):
                with patch("db.get_db_connection",
                           side_effect=self._tag_audits_connection):
                    response = self.client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.get_json()["tag"]["name"], "Inventory")

    def test_requires_a_session_regardless_of_slash(self):
        """Slash tolerance must not bypass authentication."""
        self.client.post("/logout")
        for path in ("/tags", "/tags/"):
            self.assertEqual(self.client.get(path).status_code, 401, path)


class TestLegacyTagEndpointsRemoved(unittest.TestCase):
    """`/tag` and `/tag/<id>` were raw-row duplicates of `/tags`."""

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "testuser"

    def test_routes_are_not_registered(self):
        rules = {rule.rule for rule in app.url_map.iter_rules()}
        self.assertNotIn("/tag", rules)
        self.assertNotIn("/tag/<tag_id>", rules)

    def test_requests_are_not_served_by_a_tag_handler(self):
        """The URL now hits the SPA/404 path, not a tag payload."""
        for path in ("/tag", "/tag/2"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertNotEqual(response.status_code, 200, path)
                self.assertIsNone(
                    response.get_json(silent=True),
                    f"{path} should not return a JSON tag payload",
                )


if __name__ == "__main__":
    unittest.main()
