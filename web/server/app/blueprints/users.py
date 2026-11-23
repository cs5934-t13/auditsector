"""User management and self-service profile routes.

Authorization policy lives here; the SQL and password hashing live in
`services/users/users.py` (the pre-existing service, unchanged by the split).
"""

import pymysql
from flask import Blueprint, request, session

import routing
from auth import admin_required, current_role, login_required, session_user_id
from services.users.users import Users

bp = Blueprint("users", __name__)


def _invalid_user(message):
    return routing.error_response("INVALID_USER", message, 422)


def _user_not_found(message="No such user."):
    return routing.error_response("USER_NOT_FOUND", message, 404)


def _db_error():
    return routing.error_response(
        "INTERNAL_SERVER_ERROR",
        "Unable to connect to or update the database.",
        500,
    )


def _serialize_user(row):
    """Converts a users row into the JSON shape the client expects.

    Only allow-listed columns are returned (the service never selects
    `password_hash`). Timestamps are emitted as ISO-8601, matching the style
    used by the audit endpoints rather than Flask's default date formatting.
    """
    return {
        "user_id": row["user_id"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "email": row["email"],
        "username": row["username"],
        "user_role": row["user_role"],
        "user_status": row["user_status"],
        "created_at": row["created_at"].isoformat(timespec="seconds"),
        "updated_at": row["updated_at"].isoformat(timespec="seconds"),
    }


def _optional_string(data, key):
    """Returns (present, value) for an optional string field.

    A present but non-string value raises ValueError so callers can answer 422
    instead of letting `len()` blow up further down.
    """
    if key not in data:
        return False, None

    value = data[key]
    if not isinstance(value, str):
        raise ValueError(f"'{key}' must be a string.")

    return True, value


def _wants_admin_fields(data):
    """True when the payload names a role or status field in either spelling."""
    return any(
        key in data for key in ("user_role", "role", "user_status", "status")
    )


def _apply_user_update(user_id, data):
    """Shared implementation for `PUT /user/<id>` and `PUT /profile`.

    Keeping this in one place means the self-service endpoint cannot drift into
    a more permissive version of the admin one: both go through the same
    role/status and current-password checks.
    """
    is_self = user_id == session_user_id()
    current = current_role(session.get("username"))

    if current is None or current["user_status"] != "ACTIVE":
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    is_admin = current["user_role"] == "ADMIN"

    if not is_admin and not is_self:
        return routing.error_response(
            "FORBIDDEN",
            "Administrator access is required.",
            403,
        )

    if not is_admin and _wants_admin_fields(data):
        return routing.error_response(
            "FORBIDDEN",
            "Only an administrator can change a user's role or status.",
            403,
        )

    try:
        has_password, password = _optional_string(data, "password")
        _, first_name = _optional_string(data, "first_name")
        _, last_name = _optional_string(data, "last_name")
        _, email = _optional_string(data, "email")
        _, username = _optional_string(data, "username")
        _, current_password = _optional_string(data, "current_password")
    except ValueError as err:
        return _invalid_user(str(err))

    role = data.get("user_role", data.get("role"))
    status = data.get("user_status", data.get("status"))

    if is_self and is_admin:
        # Stop an administrator from locking themselves out of the admin area.
        if role is not None and role != "ADMIN":
            return _invalid_user("You cannot remove your own administrator role.")
        if status is not None and status != "ACTIVE":
            return _invalid_user("You cannot deactivate your own account.")

    if has_password and password and is_self:
        # A user changing their own password must prove they know the old one.
        # An administrator may reset somebody else's password without it.
        if not current_password:
            return routing.error_response(
                "CURRENT_PASSWORD_REQUIRED",
                "Enter your current password to set a new one.",
                422,
            )

        try:
            verified = Users().verify_password(user_id, current_password)
        except pymysql.MySQLError:
            return _db_error()

        if not verified:
            return routing.error_response(
                "INVALID_CURRENT_PASSWORD",
                "The current password is incorrect.",
                422,
            )

    try:
        updated = Users().update_user(
            user_id,
            first_name=first_name,
            last_name=last_name,
            email=email,
            username=username,
            password=password,
            role=role,
            status=status,
        )
    except ValueError as err:
        return _invalid_user(str(err))
    except pymysql.err.IntegrityError:
        return routing.error_response(
            "USER_ALREADY_EXISTS",
            "A user with that username or e-mail address already exists.",
            409,
        )
    except pymysql.MySQLError:
        return _db_error()

    if not updated:
        return _user_not_found()

    # The session keys the signed-in username. Keep it in step when a user
    # renames themselves, otherwise the next `current_role` lookup misses and
    # the session is treated as signed out.
    if is_self and username is not None and username != session.get("username"):
        session["username"] = username

    try:
        row = Users().get_user(user_id, include_inactive=True)
    except pymysql.MySQLError:
        row = None

    if row is None:
        return {"data": {"user_id": user_id}}, 200

    return {"data": _serialize_user(row)}, 200


@bp.get("/user")
@admin_required
def get_users():
    """Lists users. Administrator only, because it exposes e-mail addresses.

    Archived (`INACTIVE`) accounts are hidden unless the caller asks for them
    with `?include_inactive=true`, which the Manage Users screen does so it can
    offer a Restore action.
    """
    include_inactive = request.args.get("include_inactive", "").lower() in (
        "1",
        "true",
        "yes",
    )

    try:
        rows = Users().get_users(include_inactive=include_inactive)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    return {"data": [_serialize_user(row) for row in rows]}, 200


@bp.post("/user")
@admin_required
def add_user():
    """Creates a user. Administrator only."""
    data = request.get_json(silent=True) or {}

    try:
        _, first_name = _optional_string(data, "first_name")
        _, last_name = _optional_string(data, "last_name")
        _, email = _optional_string(data, "email")
        _, username = _optional_string(data, "username")
        _, password = _optional_string(data, "password")

        # Accept both the short (`role`) and column (`user_role`) names.
        role = data.get("user_role", data.get("role"))
        status = data.get("user_status", data.get("status"))
    except ValueError as err:
        return _invalid_user(str(err))

    try:
        user_id = Users().add_user(
            first_name, last_name, email, username, password, role, status
        )
    except ValueError:
        return _invalid_user(
            "first_name, last_name, email, username and password are required; "
            "user_role must be ADMIN or ANALYST; user_status must be ACTIVE or "
            "INACTIVE."
        )
    except pymysql.err.IntegrityError:
        return routing.error_response(
            "USER_ALREADY_EXISTS",
            "A user with that username or e-mail address already exists.",
            409,
        )
    except pymysql.MySQLError:
        return _db_error()

    try:
        row = Users().get_user(user_id, include_inactive=True)
    except pymysql.MySQLError:
        row = None

    if row is None:
        # The insert succeeded but the row could not be read back; report the
        # id rather than failing the whole request.
        return {"data": {"user_id": user_id}}, 201

    return {"data": _serialize_user(row)}, 201


@bp.get("/user/<int:user_id>")
@login_required
def get_user(user_id):
    """Returns one user. Available to administrators and to the user themself."""
    is_self = user_id == session_user_id()

    if not is_self:
        row = current_role(session.get("username"))
        if row is None or row["user_role"] != "ADMIN":
            return routing.error_response(
                "FORBIDDEN",
                "Administrator access is required.",
                403,
            )

    try:
        user = Users().get_user(user_id, include_inactive=not is_self)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    if user is None:
        return _user_not_found()

    return {"data": _serialize_user(user)}, 200


@bp.put("/user/<int:user_id>")
@login_required
def update_user(user_id):
    """Updates a user's properties without changing their id.

    - Administrators may change any field, including role and status.
    - A regular user may change their own name, e-mail, username and password,
      but cannot grant themselves a role or change their status.
    - No caller may change `user_id`; it is only used to select the row.

    A self-service password change must include `current_password`, so a stolen
    session cannot silently take over the account.
    """
    return _apply_user_update(user_id, request.get_json(silent=True) or {})


@bp.delete("/user/<int:user_id>")
@admin_required
def deactivate_user(user_id):
    """Archives a user (sets `user_status` to `INACTIVE`).

    The row is kept so historical references stay valid; only sign-in and the
    active-user listings are affected.
    """
    if user_id == session_user_id():
        return _invalid_user("You cannot archive the account you are signed in with.")

    try:
        archived = Users().deactivate_user(user_id)
    except pymysql.MySQLError:
        return _db_error()

    if not archived:
        return _user_not_found("No active user with that id.")

    return {"data": {"user_id": user_id, "user_status": "INACTIVE"}}, 200


@bp.post("/user/<int:user_id>/restore")
@admin_required
def restore_user(user_id):
    """Restores an archived user to `ACTIVE`."""
    try:
        restored = Users().reactivate_user(user_id)
    except pymysql.MySQLError:
        return _db_error()

    if not restored:
        return _user_not_found("No archived user with that id.")

    return {"data": {"user_id": user_id, "user_status": "ACTIVE"}}, 200


@bp.get("/profile")
@login_required
def get_profile():
    """Returns the signed-in user's own record.

    Self-service, so a regular user does not need to know their internal id to
    load and edit their details.
    """
    user_id = session_user_id()

    if user_id is None:
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    try:
        row = Users().get_user(user_id, include_inactive=True)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    if row is None or row["user_status"] != "ACTIVE":
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    return {"data": _serialize_user(row)}, 200


@bp.put("/profile")
@login_required
def update_profile():
    """Lets the signed-in user edit their own details.

    Shares `_apply_user_update` with `PUT /user/<id>`, so a regular user cannot
    reach role/status fields by switching endpoints.
    """
    user_id = session_user_id()

    if user_id is None:
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    return _apply_user_update(user_id, request.get_json(silent=True) or {})
