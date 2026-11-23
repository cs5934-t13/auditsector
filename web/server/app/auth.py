"""Session-based authentication and authorization guards.

Split out of `app.py` so blueprints can import the same guards without importing
the application object (which would be a circular import).

Role checks re-read the database rather than trusting the session blob: the
session copy is a snapshot taken at login, so using it would let a demoted or
deactivated administrator keep writing until their cookie expired.
"""

from functools import wraps

import pymysql
from flask import session

import db


def current_role(username):
    """Looks up the live role, status and id for a session user.

    Returns the row (`user_id`, `user_role`, `user_status`) or `None` when the
    user is gone, inactive, or the database is unreachable.
    """
    if not username:
        return None

    try:
        conn = db.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT user_id, user_role, user_status
                    FROM users
                    WHERE username = %s;
                    """,
                    (username,),
                )
                return cur.fetchone()
    except pymysql.MySQLError:
        return None


def login_required(f):
    """Requires any signed-in session."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return {"status": "failed", "reason": "authentication required"}, 401
        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    """Requires an authenticated session whose *current* role is ADMIN."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        username = session.get("username")

        if not username:
            return {"status": "failed", "reason": "authentication required"}, 401

        row = current_role(username)

        # Deleted, deactivated, or the lookup failed: no longer an admin.
        if row is None or row["user_status"] != "ACTIVE":
            session.clear()
            return {"status": "failed", "reason": "authentication required"}, 401

        if row["user_role"] != "ADMIN":
            # Keep the session; the user may still use the rest of the app.
            session["role"] = row["user_role"]
            return {
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Administrator access is required.",
                }
            }, 403

        # Keep the snapshot in step with the database for anything that reads it.
        session["role"] = row["user_role"]
        return f(*args, **kwargs)

    return wrapper


def session_user_id():
    """The signed-in user's database id, or None when it is missing/invalid.

    Sessions created before `user_id` was stored in the cookie fall back to a
    lookup by username, so a deploy does not silently break self-service for
    anyone who is already signed in.
    """
    if "user_id" in session:
        try:
            return int(session["user_id"])
        except (TypeError, ValueError):
            pass

    row = current_role(session.get("username"))
    if row is None:
        return None

    session["user_id"] = row["user_id"]
    return row["user_id"]
