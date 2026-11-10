import os
from datetime import timedelta
from functools import wraps
from urllib.parse import urlparse

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import Flask, request, session
from services import users
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
    """Looks up the live role and status for a session user.

    The role is re-read on demand rather than taken from the session blob, so a
    role change or deactivation in the database takes effect immediately instead
    of waiting for the cookie to expire.
    """
    try:
        conn = get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT user_role, user_status
                    FROM users
                    WHERE username = %s;
                """, (username,))
                return cur.fetchone()
    except pymysql.MySQLError:
        return None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return {
                "status": "failed",
                "reason": "authentication required"
            }, 401
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
            return {
                "status": "failed",
                "reason": "authentication required"
            }, 401

        row = _current_role(username)

        # Deleted, deactivated, or the lookup failed: no longer an admin.
        if row is None or row["user_status"] != "ACTIVE":
            session.clear()
            return {
                "status": "failed",
                "reason": "authentication required"
            }, 401

        if row["user_role"] != "ADMIN":
            # Keep the session; the user may still use the rest of the app.
            session["role"] = row["user_role"]
            return {
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Administrator access is required."
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

            cur.execute("""
                SELECT audit_id, title, audit_date, created_at
                FROM audit_headers
                ORDER BY created_at DESC, audit_id DESC
                LIMIT %s OFFSET %s;
            """, (limit, offset))

            rows = cur.fetchall()

    return rows, total_items

def _wants_json() -> bool:
    """True when the request looks like an API call rather than a page load.

    Uses the proxy-provided SCRIPT_NAME so this keeps working if the app is ever
    mounted somewhere other than /api.
    """
    if request.script_root:
        return True
    return request.accept_mimetypes.best_match(
        ["application/json", "text/html"]
    ) == "application/json"


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    """Return JSON for API errors instead of Flask's default HTML pages.

    A typo in an endpoint URL should surface as a JSON error the client can
    parse, not as HTML that makes response.json() throw a SyntaxError.
    """
    response = error.get_response()
    if not _wants_json():
        return response

    response.data = app.json.dumps({
        "error": {
            "code": error.name.upper().replace(" ", "_"),
            "message": error.description,
        }
    })
    response.content_type = "application/json"
    return response

@app.route("/login", methods=["POST"])
def login_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return {
            "status": "failed",
            "reason": "username and password are required"
        }, 401

    conn = get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT password_hash, user_role, user_status
                FROM users
                WHERE username = %s;
            """, (username,))
            row = cur.fetchone()

    if row is None:
        return {
            "status": "failed",
            "reason": "invalid credentials"
        }, 401

    try:
        PasswordHasher().verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        return {
            "status": "failed",
            "reason": "invalid credentials"
        }, 401

    # An inactive account must not be able to sign in, even with valid
    # credentials.
    if row["user_status"] != "ACTIVE":
        return {
            "status": "failed",
            "reason": "account is inactive"
        }, 403

    session.clear()
    session["username"] = username
    session["role"] = row["user_role"]
    session.permanent = True

    # The role is returned so the client can render the administrator views
    # without a second request.
    return {
        "status": "approved",
        "reason": "user is authorized",
        "username": username,
        "role": row["user_role"]
    }


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return {
        "status": "logged out"
    }


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
                "message": "No source given in API call."
            }
        }, 400

    if not valid_url(source):
        return {
            "error": {
                "code": "INVALID_SOURCE",
                "message": "Source must be a valid HTTP or HTTPS URL."
            }
        }, 400

    if frequency not in VALID_FREQUENCIES:
        return {
            "error": {
                "code": "INVALID_FREQUENCY",
                "message": "Frequency must be HOURLY, DAILY, WEEKLY, or MONTHLY."
            }
        }, 400

    try:
        conn = get_db_connection()

        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT user_id
                    FROM users
                    WHERE username = %s;
                """, (user,))

                row = cur.fetchone()

                if row is None:
                    return {
                        "error": {
                            "code": "INVALID_USER",
                            "message": "Given user not found in database."
                        }
                    }, 400

                user_id = row["user_id"]

                cur.execute("""
                    INSERT INTO schedules (
                        created_by,
                        source_link,
                        scan_frequency
                    )
                    VALUES (%s, %s, %s);
                """, (user_id, source, frequency))

                schedule_id = cur.lastrowid
                conn.commit()

        return {
            "data": [
                {
                    "schedule_id": schedule_id,
                    "created_by": user_id,
                    "source_link": source,
                    "scan_frequency": frequency
                }
            ]
        }, 201

    except pymysql.MySQLError:
        return {
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Unable to connect to or update the database."
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
