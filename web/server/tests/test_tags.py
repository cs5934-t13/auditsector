"""AW-89 route/service checks; real MySQL cases use AW-26's owned test pod."""
import os
import unittest
from unittest.mock import MagicMock, patch
import uuid

import pymysql
import app as backend
from services.tags.tags import Tags


class CreateTagRouteTests(unittest.TestCase):
    def setUp(self):
        backend.app.config.update(TESTING=True)
        self.client = backend.app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "aw89_fixture"
        self.service = MagicMock()
        self.service.add_tag.return_value = {"tag_id": 11, "name": "Procurement"}
        self.patch = patch.object(backend, "Tags", return_value=self.service)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_create_trims_and_returns_the_saved_record(self):
        response = self.client.post("/tag", json={"name": "  Procurement  "})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json, {"data": {"tag_id": 11, "name": "Procurement"}})
        self.service.add_tag.assert_called_once_with("Procurement")

    def test_authentication_is_checked_before_input_and_no_write(self):
        anonymous = backend.app.test_client()
        for body in ({"name": "Test"}, {}, None):
            with self.subTest(body=body):
                response = anonymous.post("/tag", json=body)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json, {"status": "failed", "reason": "authentication required"})
        self.service.add_tag.assert_not_called()

    def test_invalid_names_do_not_call_storage(self):
        for body in ({}, [], "tag", {"name": None}, {"name": 12}, {"name": True},
                     {"name": []}, {"name": {}}, {"name": ""}, {"name": "   "}, {"name": "x" * 101}):
            with self.subTest(body=body):
                response = self.client.post("/tag", json=body)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["error"]["code"], "INVALID_TAG")
        self.service.add_tag.assert_not_called()

    def test_malformed_json_or_form_body_does_not_write(self):
        for content, content_type in (("{broken", "application/json"), ("name=Test", "application/x-www-form-urlencoded")):
            with self.subTest(content_type=content_type):
                response = self.client.post("/tag", data=content, content_type=content_type)
                self.assertEqual(response.status_code, 400)
        self.service.add_tag.assert_not_called()

    def test_accepts_the_column_length_boundary(self):
        self.client.post("/tag", json={"name": "x" * 100})
        self.service.add_tag.assert_called_once_with("x" * 100)

    def test_duplicate_is_a_conflict(self):
        self.service.add_tag.side_effect = pymysql.IntegrityError(1062, "private SQL details")
        response = self.client.post("/tag", json={"name": "Procurement"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["error"]["code"], "TAG_EXISTS")
        self.assertNotIn("private", response.get_data(as_text=True))

    def test_other_database_errors_are_generic(self):
        for error in (pymysql.IntegrityError(1048, "private details"), pymysql.OperationalError("private details")):
            with self.subTest(error=type(error).__name__):
                self.service.add_tag.side_effect = error
                response = self.client.post("/tag", json={"name": "Procurement"})
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json, {"error": {"code": "INTERNAL_SERVER_ERROR", "message": "Unable to create tag"}})

    def test_existing_get_route_is_preserved(self):
        self.service.get_tags.return_value = [{"tag_id": 1, "name": "Inventory"}]
        self.assertEqual(self.client.get("/tag").json, [{"tag_id": 1, "name": "Inventory"}])
        self.service.add_tag.assert_not_called()


class TagStorageTests(unittest.TestCase):
    def test_insert_uses_parameters_and_commits(self):
        conn, cur = MagicMock(), MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        cur.lastrowid = 17
        with patch.object(Tags, "get_db_connection", return_value=conn):
            name = "O'Reilly"
            self.assertEqual(Tags().add_tag(name), {"tag_id": 17, "name": name})
        cur.execute.assert_called_once_with("INSERT INTO tags (name) VALUES (%s)", (name,))
        conn.commit.assert_called_once()

    def test_insert_failure_does_not_commit(self):
        conn, cur = MagicMock(), MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cur
        cur.execute.side_effect = pymysql.IntegrityError(1062, "duplicate")
        with patch.object(Tags, "get_db_connection", return_value=conn):
            with self.assertRaises(pymysql.IntegrityError):
                Tags().add_tag("Existing")
        conn.commit.assert_not_called()


@unittest.skipUnless(os.environ.get("AW26_RUN_ID"), "Real MySQL requires AW-26's disposable test pod")
class TagMySQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The marker is created by the isolated runner, never by these tests.
        with Tags().get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT run_id FROM aw26_test_guard")
            if list(cur.fetchall()) != [{"run_id": os.environ["AW26_RUN_ID"]}]:
                raise RuntimeError("Refusing to use a database not owned by this test run")

    def setUp(self):
        self.names = []
        self.addCleanup(self.cleanup_tags)
        self.client = backend.app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "aw89_fixture"

    def cleanup_tags(self):
        with Tags().get_db_connection() as conn, conn.cursor() as cur:
            for name in self.names:
                cur.execute("DELETE FROM tags WHERE name = %s", (name,))
            conn.commit()

    def name(self):
        value = "AW89 " + uuid.uuid4().hex
        self.names.append(value)
        return value

    def test_create_is_committed_and_listed(self):
        name = self.name()
        response = self.client.post("/tag", json={"name": name})
        self.assertEqual(response.status_code, 201)
        row = response.json["data"]
        with Tags().get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT tag_id, name FROM tags WHERE tag_id = %s", (row["tag_id"],))
            self.assertEqual(cur.fetchone(), row)
        self.assertIn(row, [{"tag_id": r["tag_id"], "name": r["name"]} for r in self.client.get("/tag").json])

    def test_database_prevents_duplicate_and_case_equivalent_name(self):
        name = self.name()
        self.assertEqual(self.client.post("/tag", json={"name": name}).status_code, 201)
        for duplicate in (name, name.lower()):
            self.assertEqual(self.client.post("/tag", json={"name": duplicate}).status_code, 409)
        with Tags().get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM tags WHERE name = %s", (name,))
            self.assertEqual(cur.fetchone()["n"], 1)

    def test_unauthenticated_and_invalid_requests_insert_nothing(self):
        name = self.name()
        self.assertEqual(backend.app.test_client().post("/tag", json={"name": name}).status_code, 401)
        self.assertEqual(self.client.post("/tag", json={"name": ""}).status_code, 400)
        with Tags().get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM tags WHERE name = %s", (name,))
            self.assertEqual(cur.fetchone()["n"], 0)


if __name__ == "__main__":
    unittest.main()
