"""Tests for ordering tag audit reports.

Sorting happens in SQL because the tag page paginates on the server: sorting the
20 rows a page happens to hold would look like a bug. These cover the whitelist
(the only place a column name reaches SQL) and the endpoint's parameter handling.
"""

import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from app import app
from services.tags.tags import DEFAULT_SORT, order_clause


class OrderClauseTests(unittest.TestCase):
    """`order_clause` is the guard between a query string and the SQL."""

    def test_default_ordering(self):
        sql, sort, order = order_clause()
        self.assertEqual((sort, order), DEFAULT_SORT)
        self.assertIn("a.audit_date DESC", sql)

    def test_each_sortable_column(self):
        for column in ("title", "audit_date", "created_at", "risk_level"):
            with self.subTest(column=column):
                sql, sort, order = order_clause(column, "asc")
                self.assertEqual((sort, order), (column, "asc"))
                self.assertIn("ASC", sql)

    def test_risk_sorts_by_severity_not_alphabetically(self):
        """`HIGH` must rank above `LOW`, which alphabetical order would invert."""
        sql, _, _ = order_clause("risk_level", "asc")
        self.assertIn("FIELD(a.risk_level", sql)
        # The enum order, not `ORDER BY a.risk_level`.
        self.assertNotIn("a.risk_level ASC", sql)

    def test_always_breaks_ties_for_stable_pages(self):
        sql, _, _ = order_clause("title", "asc")
        self.assertIn("a.audit_id ASC", sql)

    def test_rejects_an_unknown_column(self):
        """A mistyped column falls back rather than reaching SQL."""
        sql, sort, order = order_clause("password_hash", "asc")
        self.assertEqual((sort, order), DEFAULT_SORT)
        self.assertNotIn("password_hash", sql)

    def test_rejects_injection_in_either_parameter(self):
        for sort, order in (
            ("title; DROP TABLE audit_headers", "asc"),
            ("title", "asc; DROP TABLE audit_headers"),
            ("a.title", "desc"),
        ):
            with self.subTest(sort=sort, order=order):
                sql, applied_sort, applied_order = order_clause(sort, order)
                self.assertIn(applied_sort, ("title", "audit_date"))
                self.assertIn(applied_order, ("asc", "desc"))
                self.assertNotIn("DROP", sql)

    def test_direction_is_case_insensitive(self):
        _, _, order = order_clause("title", "DESC")
        self.assertEqual(order, "desc")


def _audit_row(audit_id="a-1"):
    return {
        "audit_id": audit_id,
        "title": "Report",
        "audit_date": datetime(2026, 9, 15),
        "created_at": datetime(2026, 9, 30, 14, 25),
        "risk_level": "MEDIUM",
    }


class TagAuditsSortEndpointTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["username"] = "analyst"

    def _call(self, query=""):
        """Runs the endpoint with the tag service stubbed, returning what it saw."""
        seen = {}
        resolved = {"tag_id": 3, "name": "Inventory", "description": None, "boundary": None}

        def fake_audit_page(segment, limit, offset, sort=None, order=None):
            from services.tags.tags import order_clause

            seen["sort"] = sort
            seen["order"] = order
            seen["clause"] = order_clause(sort, order)
            applied = {"sort": seen["clause"][1], "order": seen["clause"][2]}
            return resolved, [_audit_row()], 1, {}, applied

        with patch("services.tags.tags.audit_page", side_effect=fake_audit_page), \
                patch("db.get_db_connection", return_value=MagicMock()):
            response = self.client.get(f"/tags/inventory/audits{query}")
        return response, seen

    def test_passes_sort_and_order_through(self):
        response, seen = self._call("?sort=title&order=asc")
        self.assertEqual(response.status_code, 200)
        self.assertEqual((seen["sort"], seen["order"]), ("title", "asc"))

    def test_echoes_the_applied_ordering(self):
        response, _ = self._call("?sort=risk_level&order=desc")
        self.assertEqual(
            response.get_json()["sort"], {"sort": "risk_level", "order": "desc"}
        )

    def test_an_unknown_sort_still_returns_content(self):
        """A mistyped column must not 400 a page that has valid reports."""
        response, _ = self._call("?sort=nonsense")
        self.assertEqual(response.status_code, 200)
        # The response reports the default it actually used.
        self.assertEqual(response.get_json()["sort"], {"sort": "audit_date", "order": "desc"})

    def test_no_parameters_uses_the_default(self):
        response, seen = self._call()
        self.assertIsNone(seen["sort"])
        self.assertEqual(
            response.get_json()["sort"], {"sort": "audit_date", "order": "desc"}
        )


if __name__ == "__main__":
    unittest.main()
