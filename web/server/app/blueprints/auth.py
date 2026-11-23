"""Session routes: sign in, sign out, and the authoritative session state."""

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import Blueprint, request, session

import db
import routing
from auth import current_role

bp = Blueprint("auth", __name__)


@bp.route("/login", methods=["POST"])
def login_user():
    """Verifies credentials and starts a session.

    Nothing here is protected: this is how a session is obtained.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return {"status": "failed", "reason": "username and password are required"}, 401

    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, password_hash, user_role, user_status
                FROM users
                WHERE username = %s;
                """,
                (username,),
            )
            row = cur.fetchone()

    if row is None:
        return {"status": "failed", "reason": "invalid credentials"}, 401

    try:
        PasswordHasher().verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        return {"status": "failed", "reason": "invalid credentials"}, 401

    # An inactive account must not be able to sign in, even with valid
    # credentials.
    if row["user_status"] != "ACTIVE":
        return {"status": "failed", "reason": "account is inactive"}, 403

    session.clear()
    session["username"] = username
    session["role"] = row["user_role"]
    session["user_id"] = row["user_id"]
    session.permanent = True

    # The role is returned so the client can render the administrator views
    # without a second request. The id lets the client recognise the signed-in
    # user's own row in the Manage Users list.
    return {
        "status": "approved",
        "reason": "user is authorized",
        "username": username,
        "role": row["user_role"],
        "user_id": row["user_id"],
    }


@bp.route("/logout", methods=["POST"])
def logout():
    """Clears the session."""
    session.clear()
    return {"status": "logged out"}


@bp.route("/session", methods=["GET"])
def get_session():
    """Reports the authoritative signed-in state.

    The client uses this instead of trusting its own stored role, so editing
    browser storage cannot change what the application believes about the
    server session. Not protected: it answers `authenticated: false` rather
    than 401 so the page shell can render either way.
    """
    username = session.get("username")

    if not username:
        return {"data": {"authenticated": False}}, 200

    row = current_role(username)

    # The account was deleted, deactivated, or the database is unreachable.
    # Either way the client must not keep rendering a signed-in UI.
    if row is None or row["user_status"] != "ACTIVE":
        session.clear()
        return {"data": {"authenticated": False}}, 200

    return {
        "data": {
            "authenticated": True,
            "username": username,
            "role": row["user_role"],
            "user_id": row["user_id"],
        }
    }, 200


__all__ = ["bp", "pymysql", "routing"]
