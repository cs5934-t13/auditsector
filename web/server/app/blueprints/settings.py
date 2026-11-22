"""Organization-wide text settings.

`GET` is public because the sign-in page shows the organization name and the
password reset message before a session exists; `PUT` is administrator only.
"""

import pymysql
from flask import Blueprint, request

import db
import routing
from auth import admin_required

bp = Blueprint("settings", __name__)

#: Keys accepted by GET/PUT /settings, mapped to the column names in the
#: app_settings table. The wire format stays snake_case to match the client's
#: SettingsUpdate interface.
SETTINGS_FIELDS = {
    "organization_name": "organization_name",
    "password_reset_message": "password_reset_message",
    "general_help": "general_help",
}

SETTINGS_MAX_LENGTH = 2000


def read_settings(cur):
    """Returns the settings row as a dict, creating it if absent."""
    cur.execute("""
        SELECT organization_name, password_reset_message, general_help
        FROM app_settings
        WHERE settings_id = 1;
    """)
    row = cur.fetchone()

    if row is None:
        cur.execute("""
            INSERT INTO app_settings (settings_id)
            VALUES (1);
        """)
        cur.execute("""
            SELECT organization_name, password_reset_message, general_help
            FROM app_settings
            WHERE settings_id = 1;
        """)
        row = cur.fetchone()

    return row


@bp.route("/settings", methods=["GET"])
def get_settings():
    """Returns the organization-wide text settings. Public."""
    try:
        conn = db.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                settings = read_settings(cur)
                conn.commit()
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    return {"data": settings}, 200


@bp.route("/settings", methods=["PUT"])
@admin_required
def update_settings():
    """Updates any subset of the settings. Administrator only."""
    data = request.get_json(silent=True) or {}

    updates = {}
    for field, column in SETTINGS_FIELDS.items():
        if field not in data:
            continue

        value = data[field]
        if not isinstance(value, str):
            return routing.error_response(
                "INVALID_SETTINGS",
                f"'{field}' must be a string.",
                400,
            )

        value = value.strip()
        if not value:
            return routing.error_response(
                "INVALID_SETTINGS",
                f"'{field}' must not be empty.",
                400,
            )

        if len(value) > SETTINGS_MAX_LENGTH:
            return routing.error_response(
                "INVALID_SETTINGS",
                f"'{field}' must be at most {SETTINGS_MAX_LENGTH} characters.",
                400,
            )

        updates[column] = value

    if not updates:
        return routing.error_response(
            "INVALID_SETTINGS",
            "No known settings fields were provided.",
            400,
        )

    assignments = ", ".join(f"{column} = %s" for column in updates)
    values = list(updates.values())

    try:
        conn = db.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                # Make sure the row exists before updating it.
                read_settings(cur)

                # `assignments` is built from SETTINGS_FIELDS values, never from
                # request input, so the interpolation cannot inject SQL.
                cur.execute(
                    f"UPDATE app_settings SET {assignments} WHERE settings_id = 1;",
                    values,
                )
                conn.commit()

                settings = read_settings(cur)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    return {"data": settings}, 200
