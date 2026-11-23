import unittest
from datetime import datetime
from unittest.mock import patch, MagicMock

from app import app
from services.tags.tags import slugify


class TestTagSlug(unittest.TestCase):
    """`_slugify` must match `tagSlug()` in the client exactly."""

    def test_matches_the_client_rules(self):
        cases = {
            "Information Technology": "information-technology",
            "  Capital Projects!  ": "capital-projects",
            "Sécurité & Privacy": "securite-privacy",
            "Regulatory   Compliance": "regulatory-compliance",
            "Payroll and Benefits": "payroll-and-benefits",
            "Accounts Payable and Vendors": "accounts-payable-and-vendors",
        }
        for raw, expected in cases.items():
            self.assertEqual(slugify(raw), expected, raw)

    def test_rejects_empty_results(self):
        self.assertEqual(slugify("   "), "")
        self.assertEqual(slugify("---"), "")
        self.assertEqual(slugify("!!!"), "")


def _audit_row(audit_id=1, title="Report"):
    return {
        "audit_id": audit_id,
        "title": title,
        "audit_date": datetime(2026, 9, 15),
        "created_at": datetime(2026, 9, 30, 14, 25),
        "risk_level": "MEDIUM",
    }


class TestTagsIndexEndpoint(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _sign_in(self):
        with self.client.session_transaction() as session:
            session["username"] = "testuser"

    #: Columns `_tag_columns` reports. Tests that omit `boundary` exercise the
    #: pre-migration database shape.
    SCHEMA = [
        {"COLUMN_NAME": "tag_id"},
        {"COLUMN_NAME": "name"},
        {"COLUMN_NAME": "description"},
    ]

    def _connection(self, rows, schema=None):
        """Answers the index's two queries: the column probe, then the rows."""
        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            self.SCHEMA if schema is None else schema,
            rows,
        ]
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn

    def test_lists_tags_with_counts(self):
        """Rows come back in the database's (alphabetical) order, unshaped.

        The service must not re-sort: the SQL orders by name, so a second sort
        in Python would mask a broken query. This asserts the passthrough.
        """
        self._sign_in()
        rows = [
            {"tag_id": 2, "name": "Fixed Assets", "report_count": 3},
            {"tag_id": 1, "name": "Inventory", "report_count": 0},
        ]

        with patch("db.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get("/tags")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["data"],
            [
                {"tag_id": 2, "name": "Fixed Assets", "report_count": 3,
                 "description": None, "boundary": None},
                {"tag_id": 1, "name": "Inventory", "report_count": 0,
                 "description": None, "boundary": None},
            ],
        )

    def test_index_query_orders_by_name(self):
        """The index is alphabetical for the reader, not insertion-ordered.

        Asserts the SQL itself, because a mock cannot: the ordering lives in
        the ORDER BY clause, not in Python.
        """
        self._sign_in()
        captured = []

        def connection():
            conn = self._connection([])
            cur = conn.cursor.return_value.__enter__.return_value
            cur.execute.side_effect = lambda sql, *a, **kw: captured.append(sql)
            return conn

        with patch("db.get_db_connection", side_effect=connection):
            self.client.get("/tags")

        index_sql = next(sql for sql in captured if "COUNT(DISTINCT" in sql)
        # Collapse whitespace so the assertion is about the clause, not layout.
        normalized = " ".join(index_sql.split())
        self.assertIn("ORDER BY t.name, t.tag_id", normalized)
        self.assertNotIn("ORDER BY t.tag_id", normalized.replace(
            "ORDER BY t.name, t.tag_id", ""))

    def test_treats_a_null_count_as_zero(self):
        self._sign_in()
        rows = [{"tag_id": 1, "name": "Inventory", "report_count": None}]

        with patch("db.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get("/tags")

        self.assertEqual(response.get_json()["data"][0]["report_count"], 0)

    def test_requires_a_session(self):
        self.assertEqual(self.client.get("/tags").status_code, 401)

    def test_database_failure_returns_500(self):
        import pymysql

        self._sign_in()
        with patch("db.get_db_connection", side_effect=pymysql.MySQLError("boom")):
            response = self.client.get("/tags")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["error"]["code"], "INTERNAL_SERVER_ERROR")

    def test_returns_the_tagging_rule(self):
        """description and boundary are the two halves of the tagging rule."""
        self._sign_in()
        rows = [
            {
                "tag_id": 2,
                "name": "Fixed Assets",
                "report_count": 1,
                "description": "Acquisition, records, maintenance or disposal.",
                "boundary": "Non-capital equipment alone does not qualify.",
            }
        ]

        with patch("db.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get("/tags")

        tag = response.get_json()["data"][0]
        self.assertEqual(tag["description"], "Acquisition, records, maintenance or disposal.")
        self.assertEqual(tag["boundary"], "Non-capital equipment alone does not qualify.")

    def test_works_on_a_database_without_the_boundary_column(self):
        """A pre-migration database still returns the index, boundary null."""
        self._sign_in()
        rows = [
            {"tag_id": 1, "name": "Inventory", "report_count": 0,
             "description": "Counts and custody."},
        ]
        schema = [
            {"COLUMN_NAME": "tag_id"},
            {"COLUMN_NAME": "name"},
            {"COLUMN_NAME": "description"},
        ]

        with patch("db.get_db_connection",
                   return_value=self._connection(rows, schema=schema)):
            response = self.client.get("/tags")

        self.assertEqual(response.status_code, 200)
        tag = response.get_json()["data"][0]
        self.assertEqual(tag["description"], "Counts and custody.")
        self.assertIsNone(tag["boundary"])


class TestTagAuditsEndpoint(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _sign_in(self):
        with self.client.session_transaction() as session:
            session["username"] = "testuser"

    #: The tag table as a latest-schema database reports it.
    SCHEMA = [
        {"COLUMN_NAME": "tag_id"},
        {"COLUMN_NAME": "name"},
        {"COLUMN_NAME": "description"},
        {"COLUMN_NAME": "boundary"},
    ]

    def _connection(self, tag, total, rows, tags_rows=None, schema=None):
        """Answers the endpoint's queries in the order the handler issues them.

        1. `_tag_columns`   -> `fetchall` (column probe)
        2. `_resolve_tag`   -> `fetchall` (the tag table)
        3. `boundary`       -> `fetchone` (only when the column exists)
        4. COUNT(*)         -> `fetchone`
        5. page rows        -> `fetchall`
        6. tag names        -> `fetchall`

        The two `fetchone` results depend on whether the tag resolved: an
        unknown tag stops at step 2, so no boundary or count is read.
        """
        schema = self.SCHEMA if schema is None else schema
        has_boundary = any(c["COLUMN_NAME"] == "boundary" for c in schema)
        has_description = any(c["COLUMN_NAME"] == "description" for c in schema)

        cursor = MagicMock()

        if tag is None:
            cursor.fetchall.side_effect = [schema, []]
            cursor.fetchone.return_value = None
        else:
            # `_resolve_tag` selects description only when the column exists;
            # normalize the fixture so the handler's row lookup always works.
            candidate = dict(tag)
            candidate.setdefault("description", None)
            candidate.setdefault("boundary", None)
            fetchall = [schema, [candidate]]
            if rows:
                fetchall.extend([rows, tags_rows or []])
            cursor.fetchall.side_effect = fetchall

            boundary_row = {"boundary": candidate["boundary"]} if has_boundary else None
            cursor.fetchone.side_effect = (
                [boundary_row, {"total_items": total}]
                if has_boundary
                else [{"total_items": total}]
            )

            # Keep the flag readable in the returned cursor's context.
            cursor._has_description = has_description  # noqa: SLF001

        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn, cursor

    def test_returns_rows_and_pagination(self):
        self._sign_in()
        conn, _ = self._connection(
            {"tag_id": 9, "name": "Information Technology"},
            2,
            [_audit_row(1, "A"), _audit_row(2, "B")],
            [
                {"audit_id": 1, "name": "Fixed Assets"},
                {"audit_id": 1, "name": "Information Technology"},
            ],
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/information-technology/audits")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()

        # The tagging rule travels with the tag so the page can show it.
        self.assertEqual(
            body["tag"],
            {
                "tag_id": 9,
                "name": "Information Technology",
                "description": None,
                "boundary": None,
            },
        )
        self.assertEqual(body["pagination"],
                         {"page": 1, "limit": 20, "total_items": 2, "total_pages": 1})
        self.assertEqual([row["title"] for row in body["data"]], ["A", "B"])
        # Tags are attached per audit, ordered by name.
        self.assertEqual(body["data"][0]["tags"],
                         ["Fixed Assets", "Information Technology"])
        self.assertEqual(body["data"][1]["tags"], [])
        self.assertEqual(body["data"][0]["audit_date"], "2026-09-15T00:00:00")

    def test_accepts_the_display_name_as_well_as_the_slug(self):
        self._sign_in()
        conn, _ = self._connection(
            {"tag_id": 9, "name": "Information Technology"}, 0, []
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/Information%20Technology/audits")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["tag"]["name"], "Information Technology")

    def test_unknown_tag_is_404(self):
        self._sign_in()
        conn, _ = self._connection(None, 0, [])

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/does-not-exist/audits")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"]["code"], "TAG_NOT_FOUND")

    def test_unused_tag_returns_an_empty_page(self):
        self._sign_in()
        conn, cursor = self._connection(
            {"tag_id": 1, "name": "Inventory"}, 0, []
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/inventory/audits")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["data"], [])
        self.assertEqual(body["pagination"]["total_pages"], 0)
        # Only the column probe and the tag lookup run; no page or tag-name
        # query is issued when there is nothing to fetch.
        self.assertEqual(cursor.fetchall.call_count, 2)

    def test_page_beyond_the_end_returns_empty_data_with_real_totals(self):
        self._sign_in()
        conn, _ = self._connection(
            {"tag_id": 9, "name": "Information Technology"}, 2, []
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/information-technology/audits?page=5")

        body = response.get_json()
        self.assertEqual(body["data"], [])
        self.assertEqual(body["pagination"]["total_items"], 2)
        self.assertEqual(body["pagination"]["total_pages"], 1)

    def test_invalid_pagination_returns_400(self):
        self._sign_in()
        for query in ("?page=0", "?limit=0", "?limit=101", "?page=abc"):
            response = self.client.get(f"/tags/information-technology/audits{query}")
            self.assertEqual(response.status_code, 400, query)

    def test_requires_a_session(self):
        self.assertEqual(
            self.client.get("/tags/information-technology/audits").status_code, 401
        )

    def test_database_failure_returns_500(self):
        import pymysql

        self._sign_in()
        with patch("db.get_db_connection", side_effect=pymysql.MySQLError("boom")):
            response = self.client.get("/tags/information-technology/audits")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["error"]["code"], "INTERNAL_SERVER_ERROR")

    def test_includes_the_tagging_rule_for_the_resolved_tag(self):
        self._sign_in()
        conn, _ = self._connection(
            {
                "tag_id": 2,
                "name": "Fixed Assets",
                "description": "Acquisition, records, maintenance or disposal.",
                "boundary": "Non-capital equipment alone does not qualify.",
            },
            0,
            [],
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/fixed-assets/audits")

        tag = response.get_json()["tag"]
        self.assertEqual(tag["name"], "Fixed Assets")
        self.assertEqual(tag["description"], "Acquisition, records, maintenance or disposal.")
        self.assertEqual(tag["boundary"], "Non-capital equipment alone does not qualify.")

    def test_resolves_a_tag_on_a_database_without_the_boundary_column(self):
        """The newer column is optional, so resolution still works without it."""
        self._sign_in()
        schema = [
            {"COLUMN_NAME": "tag_id"},
            {"COLUMN_NAME": "name"},
            {"COLUMN_NAME": "description"},
        ]
        conn, _ = self._connection(
            {"tag_id": 9, "name": "Information Technology"},
            0,
            [],
            schema=schema,
        )

        with patch("db.get_db_connection", return_value=conn):
            response = self.client.get("/tags/information-technology/audits")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["tag"]["boundary"])


if __name__ == "__main__":
    unittest.main()
