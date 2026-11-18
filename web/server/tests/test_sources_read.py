"""AW-97 read-back, ownership, and database regression checks."""

import os
import secrets
import unittest
import uuid
from unittest.mock import MagicMock, patch
import pymysql
import app as backend


class SourcesReadRouteTests(unittest.TestCase):
    def setUp(self):
        backend.app.config.update(TESTING=True)
        self.client = backend.app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "owner"
        self.connection = MagicMock()
        self.connection.__enter__.return_value = self.connection
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.return_value = {"user_id": 7}
        self.cursor.fetchall.return_value = ()
        self.db = patch.object(backend, "get_db_connection", return_value=self.connection)
        self.db_mock = self.db.start()
        self.addCleanup(self.db.stop)

    def test_anonymous_request_never_queries_the_database(self):
        response = backend.app.test_client().get("/sources?user=owner")
        self.assertEqual(response.status_code, 401)
        self.db_mock.assert_not_called()

    def test_other_username_is_rejected_before_querying(self):
        response = self.client.get("/sources?user=someone-else")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json["error"]["code"], "USER_MISMATCH")
        self.db_mock.assert_not_called()

    def test_empty_tuple_is_a_successful_empty_array(self):
        response = self.client.get("/sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"data": []})

    def test_matching_or_empty_legacy_user_is_accepted(self):
        for value in ["owner", ""]:
            with self.subTest(value=value):
                self.assertEqual(self.client.get("/sources", query_string={"user": value}).status_code, 200)

    def test_stored_frequencies_and_response_fields_are_preserved(self):
        rows = [{"schedule_id": i, "created_by": 7,
                 "source_link": "https://example.invalid/" + str(i), "scan_frequency": frequency}
                for i, frequency in enumerate(["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "ARCHIVE"], 1)]
        self.cursor.fetchall.return_value = rows
        response = self.client.get("/sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"data": rows})
        query, params = self.cursor.execute.call_args.args
        self.assertIn("WHERE created_by = %s", query)
        self.assertIn("ORDER BY schedule_id", query)
        self.assertEqual(params, (7,))
        self.connection.commit.assert_not_called()

    def test_session_username_is_bound_as_data(self):
        name = "owner' OR 1=1 --"
        with self.client.session_transaction() as session:session["username"] = name
        self.client.get("/sources")
        query, params = self.cursor.execute.call_args_list[0].args
        self.assertEqual(params, (name,))
        self.assertNotIn(name, query)

    def test_deleted_user_is_rejected_without_listing_sources(self):
        self.cursor.fetchone.return_value = None
        response = self.client.get("/sources")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["error"]["code"], "INVALID_USER")
        self.assertEqual(self.cursor.execute.call_count, 1)

    def test_connection_and_query_failures_are_generic(self):
        expected = {"error": {"code": "INTERNAL_SERVER_ERROR", "message": "Unable to retrieve sources"}}
        with patch.object(backend, "get_db_connection", side_effect=pymysql.OperationalError(2003, "private detail")):
            response = self.client.get("/sources")
            self.assertEqual(response.status_code, 500)
            self.assertEqual(response.json, expected)
        self.cursor.fetchall.side_effect = pymysql.OperationalError(2013, "private detail")
        response = self.client.get("/sources")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json, expected)


@unittest.skipUnless(os.environ.get("AW26_RUN_ID"), "requires AW-26's owned disposable MySQL runner")
class SourcesReadMySQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from argon2 import PasswordHasher
        from test_sources import assert_owned_database
        assert_owned_database()
        cls.password = secrets.token_urlsafe(24)
        cls.password_hash = PasswordHasher().hash(cls.password)

    def setUp(self):
        from test_sources import assert_owned_database, insert_user
        assert_owned_database()
        self.ids = []
        self.addCleanup(self.cleanup)
        self.username = "aw97_" + uuid.uuid4().hex[:16]
        self.ids.append(insert_user(self.username, self.password_hash))
        self.other = "aw97_" + uuid.uuid4().hex[:16]
        self.ids.append(insert_user(self.other, self.password_hash))
        self.client = backend.app.test_client()
        self.assertEqual(self.client.post("/login", json={"username": self.username, "password": self.password}).status_code, 200)

    def cleanup(self):
        from test_sources import assert_owned_database, query
        assert_owned_database()
        for user_id in self.ids:
            query("DELETE FROM schedules WHERE created_by=%s", (user_id,))
            query("DELETE FROM users WHERE user_id=%s", (user_id,))

    def test_post_then_get_returns_committed_frequency_only_to_its_owner(self):
        from test_sources import query
        expected = []
        for frequency in ["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "monthly"]:
            response = self.client.post("/sources", query_string={"source": "https://example.invalid/aw97-" + uuid.uuid4().hex, "frequency": frequency})
            self.assertEqual(response.status_code, 201)
            expected.extend(response.json["data"])
        # A second owner has a schedule that must never appear in this owner's GET.
        query("INSERT INTO schedules(created_by,source_link,scan_frequency) VALUES (%s,%s,'DAILY')", (self.ids[1], "https://example.invalid/other-" + uuid.uuid4().hex))
        before = query("SELECT * FROM schedules ORDER BY schedule_id")
        response = self.client.get("/sources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"data": expected})
        self.assertEqual(query("SELECT * FROM schedules ORDER BY schedule_id"), before)
        second = backend.app.test_client()
        self.assertEqual(second.post("/login", json={"username": self.other, "password": self.password}).status_code, 200)
        rows = second.get("/sources").json["data"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["created_by"], self.ids[1])

    def test_empty_sources_and_logout_cookie(self):
        self.assertEqual(self.client.get("/sources").json, {"data": []})
        self.client.post("/logout")
        self.assertEqual(self.client.get("/sources").status_code, 401)


if __name__ == "__main__":
    unittest.main()
