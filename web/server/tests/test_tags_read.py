"""Keep empty tag queries serializable as JSON arrays for the live UI."""
import unittest
from unittest.mock import MagicMock, patch

import app as backend
from services.tags.tags import Tags


class TagReadTests(unittest.TestCase):
    def setUp(self):
        backend.app.config.update(TESTING=True)
        self.client = backend.app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "aw91_fixture"
        conn, cur = MagicMock(), MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        self.cur = cur
        self.patch = patch.object(Tags, "get_db_connection", return_value=conn)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_empty_catalog_is_a_successful_json_array(self):
        self.cur.fetchall.return_value = ()
        response = self.client.get("/tag")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, [])

    def test_known_tag_with_no_reports_is_a_successful_array(self):
        self.cur.fetchall.return_value = ()
        response = self.client.get("/tag/1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, [])

    def test_existing_records_are_preserved(self):
        rows = [{"tag_id": 1, "name": "Inventory"}]
        self.cur.fetchall.return_value = rows
        self.assertEqual(self.client.get("/tag").json, rows)

    def test_no_session_does_not_query_storage(self):
        self.assertEqual(backend.app.test_client().get("/tag").status_code, 401)
        self.cur.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
