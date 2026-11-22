import os
from datetime import timedelta
from functools import wraps
from urllib.parse import urlparse

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import Flask, request, session
from services.tags.tags import Tags
from services.users.users import Users
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

# The nginx client strips the /api prefix before proxying (see
# web/client/web.conf) and reports the stripped prefix in X-Forwarded-Prefix.
# ProxyFix copies that into the WSGI SCRIPT_NAME, so redirect() and url_for()
# emit /api/... URLs instead of /..., and request.script_root tells us where we
# are mounted.
#
# Only x_prefix is enabled: trusting x_for/x_host from an arbitrary client would
# let a caller spoof its own address unless a trusted proxy is configured.
app.wsgi_app = ProxyFix(app.wsgi_app, x_prefix=1)

VALID_FREQUENCIES = {"HOURLY", "DAILY", "WEEKLY", "MONTHLY"}


def get_db_connection():
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )


def _current_role(username):
    """Looks up the live role, status and id for a session user.

    The role is re-read on demand rather than taken from the session blob, so a
    role change or deactivation in the database takes effect immediately instead
    of waiting for the cookie to expire.
    """
    try:
        conn = get_db_connection()
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
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return {"status": "failed", "reason": "authentication required"}, 401
        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    """Requires an authenticated session whose *current* role is ADMIN.

    The role is re-read from the database rather than trusted from the session
    blob. The session copy is a snapshot taken at login, so using it would let a
    demoted or deactivated administrator keep writing until their cookie expired
    (up to PERMANENT_SESSION_LIFETIME).
    """

    @wraps(f)
    def wrapper(*args, **kwargs):
        username = session.get("username")

        if not username:
            return {"status": "failed", "reason": "authentication required"}, 401

        row = _current_role(username)

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


def error_response(code: str, message: str, status: int):
    """Consistent error envelope used by the newer endpoints."""
    return {"error": {"code": code, "message": message}}, status


def get_recent_audits_pagination():
    page = int(request.args.get("page", "1"))
    limit = int(request.args.get("limit", "20"))

    if page < 1 or not 1 <= limit <= 100:
        raise ValueError("Invalid pagination")

    return page, limit


def fetch_recent_audits(page, limit):
    offset = (page - 1) * limit

    conn = get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) AS total_items
                FROM audit_headers;
            """)
            total_items = cur.fetchone()["total_items"]

            if offset >= total_items:
                return [], total_items

            cur.execute(
                """
                SELECT audit_id, title, audit_date, created_at
                FROM audit_headers
                ORDER BY created_at DESC, audit_id DESC
                LIMIT %s OFFSET %s;
            """,
                (limit, offset),
            )

            rows = cur.fetchall()

    return rows, total_items


def _wants_json() -> bool:
    """True when the request looks like an API call rather than a page load.

    Uses the proxy-provided SCRIPT_NAME so this keeps working if the app is ever
    mounted somewhere other than /api.
    """
    if request.script_root:
        return True
    return (
        request.accept_mimetypes.best_match(["application/json", "text/html"])
        == "application/json"
    )


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    """Return JSON for API errors instead of Flask's default HTML pages.

    A typo in an endpoint URL should surface as a JSON error the client can
    parse, not as HTML that makes response.json() throw a SyntaxError.
    """
    response = error.get_response()
    if not _wants_json():
        return response

    response.data = app.json.dumps(
        {
            "error": {
                "code": error.name.upper().replace(" ", "_"),
                "message": error.description,
            }
        }
    )
    response.content_type = "application/json"
    return response


@app.route("/login", methods=["POST"])
def login_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return {"status": "failed", "reason": "username and password are required"}, 401

    conn = get_db_connection()
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


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return {"status": "logged out"}


@app.route("/session", methods=["GET"])
def get_session():
    """Reports the authoritative signed-in state.

    The client uses this instead of trusting its own stored role, so editing
    browser storage cannot change what the application believes about the
    server session.
    """
    username = session.get("username")

    if not username:
        return {"data": {"authenticated": False}}, 200

    row = _current_role(username)

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


def valid_url(url):
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


@app.route("/sources", methods=["POST"])
@login_required
def add_source():
    # The creator is taken from the session, never from the request. The old
    # `?user=` parameter let any caller attribute a schedule to somebody else, so
    # passing one is now rejected unless it matches the signed-in user.
    user = session["username"]
    requested_user = request.args.get("user")

    if requested_user and requested_user != user:
        return error_response(
            "USER_MISMATCH",
            "The 'user' parameter must match the signed-in user.",
            403,
        )

    source = request.args.get("source")
    frequency = request.args.get("frequency", "WEEKLY").upper()

    if not source:
        return {
            "error": {
                "code": "MISSING_SOURCE",
                "message": "No source given in API call.",
            }
        }, 400

    if not valid_url(source):
        return {
            "error": {
                "code": "INVALID_SOURCE",
                "message": "Source must be a valid HTTP or HTTPS URL.",
            }
        }, 400

    if frequency not in VALID_FREQUENCIES:
        return {
            "error": {
                "code": "INVALID_FREQUENCY",
                "message": "Frequency must be HOURLY, DAILY, WEEKLY, or MONTHLY.",
            }
        }, 400

    try:
        conn = get_db_connection()

        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT user_id
                    FROM users
                    WHERE username = %s;
                """,
                    (user,),
                )

                row = cur.fetchone()

                if row is None:
                    return {
                        "error": {
                            "code": "INVALID_USER",
                            "message": "Given user not found in database.",
                        }
                    }, 400

                user_id = row["user_id"]

                cur.execute(
                    """
                    INSERT INTO schedules (
                        created_by,
                        source_link,
                        scan_frequency
                    )
                    VALUES (%s, %s, %s);
                """,
                    (user_id, source, frequency),
                )

                schedule_id = cur.lastrowid
                conn.commit()

        return {
            "data": [
                {
                    "schedule_id": schedule_id,
                    "created_by": user_id,
                    "source_link": source,
                    "scan_frequency": frequency,
                }
            ]
        }, 201

    except pymysql.MySQLError:
        return {
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Unable to connect to or update the database.",
            }
        }, 500


# Keys accepted by GET/PUT /settings, mapped to the column names in the
# app_settings table. The wire format stays snake_case to match the client's
# SettingsUpdate interface.
SETTINGS_FIELDS = {
    "organization_name": "organization_name",
    "password_reset_message": "password_reset_message",
    "general_help": "general_help",
}

SETTINGS_MAX_LENGTH = 2000


def _read_settings(cur):
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


@app.route("/settings", methods=["GET"])
def get_settings():
    """Returns the organization-wide text settings.

    Not protected: the sign-in page shows the organization name and the password
    reset message before a user has a session.
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                settings = _read_settings(cur)
                conn.commit()
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    return {"data": settings}, 200


@app.route("/settings", methods=["PUT"])
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
            return error_response(
                "INVALID_SETTINGS",
                f"'{field}' must be a string.",
                400,
            )

        value = value.strip()
        if not value:
            return error_response(
                "INVALID_SETTINGS",
                f"'{field}' must not be empty.",
                400,
            )

        if len(value) > SETTINGS_MAX_LENGTH:
            return error_response(
                "INVALID_SETTINGS",
                f"'{field}' must be at most {SETTINGS_MAX_LENGTH} characters.",
                400,
            )

        updates[column] = value

    if not updates:
        return error_response(
            "INVALID_SETTINGS",
            "No known settings fields were provided.",
            400,
        )

    assignments = ", ".join(f"{column} = %s" for column in updates)
    values = list(updates.values())

    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                # Make sure the row exists before updating it.
                _read_settings(cur)

                cur.execute(
                    f"UPDATE app_settings SET {assignments} WHERE settings_id = 1;",
                    values,
                )
                conn.commit()

                settings = _read_settings(cur)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    return {"data": settings}, 200


@app.route("/tag", methods=["GET"])
@login_required
def get_tags():
    return Tags().get_tags()


@app.route("/tag", methods=["POST"])
@login_required
def create_tag():
    data = request.get_json(silent=True)
    name = data.get("name") if isinstance(data, dict) else None
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
        return error_response(
            "INVALID_TAG",
            "name must be a nonblank string of at most 100 characters",
            400,
        )

    try:
        tag = Tags().add_tag(name.strip())
    except pymysql.IntegrityError as error:
        if error.args and error.args[0] == 1062:
            return error_response("TAG_EXISTS", "A tag with this name already exists", 409)
        return error_response("INTERNAL_SERVER_ERROR", "Unable to create tag", 500)
    except pymysql.MySQLError:
        return error_response("INTERNAL_SERVER_ERROR", "Unable to create tag", 500)
    return {"data": tag}, 201


@app.route("/tag/<tag_id>", methods=["GET"])
@login_required
def get_tag(tag_id):
    return Tags().get_tag(tag_id)


@app.route("/audits/recent", methods=["GET"])
@login_required
def get_recent_audits():
    try:
        page, limit = get_recent_audits_pagination()
    except ValueError:
        return error_response(
            "INVALID_PAGINATION",
            "page must be at least 1 and limit must be between 1 and 100",
            400,
        )

    try:
        rows, total_items = fetch_recent_audits(page, limit)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to retrieve recent audits",
            500,
        )

    data = [
        {
            "audit_id": row["audit_id"],
            "title": row["title"],
            "audit_date": row["audit_date"].isoformat(timespec="seconds"),
            "created_at": row["created_at"].isoformat(timespec="seconds"),
        }
        for row in rows
    ]

    return {
        "data": data,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_items": total_items,
            "total_pages": (total_items + limit - 1) // limit,
        },
    }, 200


def _session_user_id():
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

    username = session.get("username")
    if not username:
        return None

    row = _current_role(username)
    if row is None:
        return None

    session["user_id"] = row["user_id"]
    return row["user_id"]


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


@app.get("/user")
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
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    return {"data": [_serialize_user(row) for row in rows]}, 200


@app.post("/user")
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
        return error_response("INVALID_USER", str(err), 422)

    try:
        user_id = Users().add_user(
            first_name, last_name, email, username, password, role, status
        )
    except ValueError:
        return error_response(
            "INVALID_USER",
            "first_name, last_name, email, username and password are required; "
            "user_role must be ADMIN or ANALYST; user_status must be ACTIVE or "
            "INACTIVE.",
            422,
        )
    except pymysql.err.IntegrityError:
        return error_response(
            "USER_ALREADY_EXISTS",
            "A user with that username or e-mail address already exists.",
            409,
        )
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    try:
        row = Users().get_user(user_id, include_inactive=True)
    except pymysql.MySQLError:
        row = None

    if row is None:
        # The insert succeeded but the row could not be read back; report the
        # id rather than failing the whole request.
        return {"data": {"user_id": user_id}}, 201

    return {"data": _serialize_user(row)}, 201


@app.get("/user/<int:user_id>")
@login_required
def get_user(user_id):
    """Returns one user. Available to administrators and to the user themself."""
    is_self = user_id == _session_user_id()

    if not is_self:
        row = _current_role(session.get("username"))
        if row is None or row["user_role"] != "ADMIN":
            return error_response(
                "FORBIDDEN",
                "Administrator access is required.",
                403,
            )

    try:
        user = Users().get_user(user_id, include_inactive=not is_self)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    if user is None:
        return error_response("USER_NOT_FOUND", "No such user.", 404)

    return {"data": _serialize_user(user)}, 200


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
    is_self = user_id == _session_user_id()
    current = _current_role(session.get("username"))

    if current is None or current["user_status"] != "ACTIVE":
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    is_admin = current["user_role"] == "ADMIN"

    if not is_admin and not is_self:
        return error_response(
            "FORBIDDEN",
            "Administrator access is required.",
            403,
        )

    if not is_admin and _wants_admin_fields(data):
        return error_response(
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
        return error_response("INVALID_USER", str(err), 422)

    role = data.get("user_role", data.get("role"))
    status = data.get("user_status", data.get("status"))

    if is_self and is_admin:
        # Stop an administrator from locking themselves out of the admin area.
        if role is not None and role != "ADMIN":
            return error_response(
                "INVALID_USER",
                "You cannot remove your own administrator role.",
                422,
            )
        if status is not None and status != "ACTIVE":
            return error_response(
                "INVALID_USER",
                "You cannot deactivate your own account.",
                422,
            )

    if has_password and password and is_self:
        # A user changing their own password must prove they know the old one.
        # An administrator may reset somebody else's password without it.
        if not current_password:
            return error_response(
                "CURRENT_PASSWORD_REQUIRED",
                "Enter your current password to set a new one.",
                422,
            )

        try:
            verified = Users().verify_password(user_id, current_password)
        except pymysql.MySQLError:
            return error_response(
                "INTERNAL_SERVER_ERROR",
                "Unable to connect to or read from the database.",
                500,
            )

        if not verified:
            return error_response(
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
        return error_response("INVALID_USER", str(err), 422)
    except pymysql.err.IntegrityError:
        return error_response(
            "USER_ALREADY_EXISTS",
            "A user with that username or e-mail address already exists.",
            409,
        )
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    if not updated:
        return error_response("USER_NOT_FOUND", "No such user.", 404)

    # The session keys the signed-in username. Keep it in step when a user
    # renames themselves, otherwise the next `_current_role` lookup misses and
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


@app.put("/user/<int:user_id>")
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


@app.delete("/user/<int:user_id>")
@admin_required
def deactivate_user(user_id):
    """Archives a user (sets `user_status` to `INACTIVE`).

    The row is kept so historical references stay valid; only sign-in and the
    active-user listings are affected.
    """
    if user_id == _session_user_id():
        return error_response(
            "INVALID_USER",
            "You cannot archive the account you are signed in with.",
            422,
        )

    try:
        archived = Users().deactivate_user(user_id)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    if not archived:
        return error_response(
            "USER_NOT_FOUND",
            "No active user with that id.",
            404,
        )

    return {"data": {"user_id": user_id, "user_status": "INACTIVE"}}, 200


@app.post("/user/<int:user_id>/restore")
@admin_required
def restore_user(user_id):
    """Restores an archived user to `ACTIVE`."""
    try:
        restored = Users().reactivate_user(user_id)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )

    if not restored:
        return error_response(
            "USER_NOT_FOUND",
            "No archived user with that id.",
            404,
        )

    return {"data": {"user_id": user_id, "user_status": "ACTIVE"}}, 200


@app.get("/profile")
@login_required
def get_profile():
    """Returns the signed-in user's own record.

    Self-service, so a regular user does not need to know their internal id to
    load and edit their details.
    """
    user_id = _session_user_id()

    if user_id is None:
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    try:
        row = Users().get_user(user_id, include_inactive=True)
    except pymysql.MySQLError:
        return error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or read from the database.",
            500,
        )

    if row is None or row["user_status"] != "ACTIVE":
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    return {"data": _serialize_user(row)}, 200


@app.put("/profile")
@login_required
def update_profile():
    """Lets the signed-in user edit their own details.

    Shares `_apply_user_update` with `PUT /user/<id>`, so a regular user cannot
    reach role/status fields by switching endpoints.
    """
    user_id = _session_user_id()

    if user_id is None:
        session.clear()
        return {"status": "failed", "reason": "authentication required"}, 401

    return _apply_user_update(user_id, request.get_json(silent=True) or {})
