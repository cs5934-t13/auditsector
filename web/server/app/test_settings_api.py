"""Tests for `GET`/`PUT /settings`.

The settings row is stubbed in memory: `FakeConnection` keeps the row, applies
the `UPDATE` the endpoint builds, and answers the endpoint's `SELECT` with the
current values. That keeps the tests about the endpoint (field coverage,
validation, authorization) rather than about SQL text.
"""

import unittest
from unittest.mock import patch

import auth
from app import app
from blueprints import settings as settings_blueprint

SETTINGS_ROW = {
    "organization_name": "City of Alexandria",
    "password_reset_message": "<p>To reset your password, contact the administrators.</p>",
    "general_help": "<p>For help using AuditSector, review the guidance below.</p>",
    "contact": '<p>Contact us at <a href="mailto:team@auditsector.example">team@auditsector.example</a>.</p>',
}


def _columns_in(update_sql):
    """Column names from an `UPDATE ... SET a = %s, b = %s` statement."""
    set_clause = update_sql.split("SET ", 1)[1].split(" WHERE", 1)[0]
    return [part.strip().split("=", 1)[0].strip() for part in set_clause.split(",")]


class FakeCursor:
    def __init__(self, row):
        self.row = dict(row)
        self.next_row = None
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.statements.append((" ".join(sql.split()), params))
        normalized = " ".join(sql.split())

        if normalized.startswith("SELECT"):
            self.next_row = dict(self.row)
        elif normalized.startswith("UPDATE"):
            for column, value in zip(_columns_in(normalized), params or ()):
                self.row[column] = value
            self.next_row = None
        else:
            self.next_row = None

    def fetchone(self):
        return self.next_row


class FakeConnection:
    def __init__(self, row):
        self.cursor_instance = FakeCursor(row)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        pass


def _admin_row(username="admin"):
    return {
        "user_id": 1,
        "user_role": "ADMIN",
        "user_status": "ACTIVE",
    }


def _analyst_row(username="analyst"):
    return {
        "user_id": 2,
        "user_role": "ANALYST",
        "user_status": "ACTIVE",
    }


class SettingsEndpointTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        self.connection = FakeConnection(SETTINGS_ROW)

    def _patch_db(self):
        return patch("db.get_db_connection", return_value=self.connection)

    def _sign_in(self, username="admin", role="ADMIN"):
        with self.client.session_transaction() as session:
            session["username"] = username
            session["role"] = role

    # --- GET ---------------------------------------------------------------

    def test_get_returns_every_setting_including_contact(self):
        """`contact` is part of the public payload the footer reads."""
        with self._patch_db():
            response = self.client.get("/settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], SETTINGS_ROW)

    def test_get_selects_the_contact_column(self):
        """A `SELECT` that omits `contact` would silently drop it from the API."""
        with self._patch_db():
            self.client.get("/settings")

        select_sql = next(
            sql for sql, _ in self.connection.cursor_instance.statements
            if sql.startswith("SELECT")
        )
        self.assertIn("contact", select_sql)

    # --- PUT ---------------------------------------------------------------

    def test_admin_can_update_contact(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": "helpdesk@example.gov"}
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["data"]["contact"], "helpdesk@example.gov"
        )

    def test_admin_update_is_trimmed(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            self.client.put("/settings", json={"contact": "  help@example.gov  "})

        self.assertEqual(
            self.connection.cursor_instance.row["contact"], "help@example.gov"
        )

    def test_contact_accepts_free_text(self):
        """The field is open text, not an email-only field."""
        self._sign_in("admin", "ADMIN")
        text = "Call the help desk at 555-0100, Monday to Friday."

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put("/settings", json={"contact": text})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"]["contact"], text)

    # --- rich text ---------------------------------------------------------

    def test_admin_can_save_formatted_rich_text(self):
        """Bold, lists, and links are the point of the editor."""
        self._sign_in("admin", "ADMIN")
        html = (
            "<p><strong>Help desk</strong></p>"
            '<ul><li>Mon&ndash;Fri</li></ul>'
            '<p><a href="mailto:help@example.gov">Email us</a></p>'
        )

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put("/settings", json={"general_help": html})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"]["general_help"], html)

    def test_stored_plain_text_is_still_accepted(self):
        """Rows written before rich text existed must keep saving."""
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": "Contact the administrators."}
            )

        self.assertEqual(response.status_code, 200)

    def test_script_markup_is_rejected(self):
        """The endpoint is public to any admin session, so it must not store XSS."""
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": "<script>alert(1)</script>"}
            )

        self.assertEqual(response.status_code, 400)
        body = response.get_json()["error"]
        self.assertEqual(body["code"], "INVALID_SETTINGS")
        self.assertIn("script", body["message"])

    def test_event_handler_attribute_is_rejected(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": '<p onclick="alert(1)">x</p>'}
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("onclick", response.get_json()["error"]["message"])

    def test_javascript_url_is_rejected(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": '<a href="javascript:alert(1)">x</a>'}
            )

        self.assertEqual(response.status_code, 400)

    def test_rejected_value_is_never_written(self):
        """A 400 must leave the stored row untouched."""
        self._sign_in("admin", "ADMIN")
        before = dict(self.connection.cursor_instance.row)

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            self.client.put("/settings", json={"contact": "<script>x</script>"})

        self.assertEqual(self.connection.cursor_instance.row, before)

    def test_visually_empty_rich_text_is_rejected(self):
        """`<p><br></p>` is a non-empty string but shows nothing."""
        self._sign_in("admin", "ADMIN")

        for value in ["<p></p>", "<p><br></p>", "<p>&nbsp;</p>"]:
            with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
                response = self.client.put("/settings", json={"contact": value})

            self.assertEqual(response.status_code, 400, value)
            self.assertEqual(
                response.get_json()["error"]["code"], "INVALID_SETTINGS", value
            )

    def test_organization_name_is_not_treated_as_rich_text(self):
        """The header text stays plain, so tags there are just characters."""
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"organization_name": "A & B <City>"}
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["data"]["organization_name"], "A & B <City>"
        )

    def test_empty_contact_is_rejected(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put("/settings", json={"contact": "   "})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_SETTINGS")

    def test_contact_over_the_limit_is_rejected(self):
        self._sign_in("admin", "ADMIN")

        with patch("auth.current_role", return_value=_admin_row()), self._patch_db():
            response = self.client.put(
                "/settings", json={"contact": "x" * (settings_blueprint.SETTINGS_MAX_LENGTH + 1)}
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_SETTINGS")

    def test_non_admin_cannot_update_contact(self):
        self._sign_in("analyst", "ANALYST")

        with patch("auth.current_role", return_value=_analyst_row()), self._patch_db():
            response = self.client.put("/settings", json={"contact": "nope"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["error"]["code"], "FORBIDDEN")

    def test_anonymous_cannot_update_contact(self):
        with self._patch_db():
            response = self.client.put("/settings", json={"contact": "nope"})

        self.assertEqual(response.status_code, 401)

    # --- contract ----------------------------------------------------------

    def test_contact_is_a_registered_setting_field(self):
        """Guards against adding the column but forgetting the API field."""
        self.assertIn("contact", settings_blueprint.SETTINGS_FIELDS)

    def test_every_registered_field_is_selected(self):
        with self._patch_db():
            self.client.get("/settings")

        select_sql = next(
            sql for sql, _ in self.connection.cursor_instance.statements
            if sql.startswith("SELECT")
        )
        for field in settings_blueprint.SETTINGS_FIELDS:
            self.assertIn(field, select_sql)


if __name__ == "__main__":
    unittest.main()
