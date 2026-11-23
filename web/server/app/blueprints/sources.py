"""Source/schedule routes."""

from urllib.parse import urlparse

import pymysql
from flask import Blueprint, request, session

import db
import routing
import supported_sources
from auth import login_required

bp = Blueprint("sources", __name__)

VALID_FREQUENCIES = {"HOURLY", "DAILY", "WEEKLY", "MONTHLY"}


def _unsupported_source_response():
    """400 telling the caller which URLs *are* accepted.

    Rejecting here is what lets the UI stop guessing: a stored schedule is
    supported by construction, so "unsupported" becomes a validation error at
    entry instead of a badge the table has to derive.
    """
    examples = ", ".join(
        supported_sources.example_url(source)
        for source in supported_sources.SUPPORTED_SOURCES
    )
    return routing.error_response(
        "UNSUPPORTED_SOURCE",
        "No scanner supports this URL yet. Supported sources: " + examples,
        400,
    )


def valid_url(url):
    """True for an absolute http(s) URL with a host.

    `urlparse` raises on a non-string or a malformed value; a bad source is a
    client error (400), never a 500, so those cases return False.
    """
    try:
        parsed = urlparse(url)
    except (TypeError, ValueError):
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


@bp.route("/sources", methods=["POST"])
@login_required
def add_source():
    """Registers a source to scan on a schedule.

    The creator is taken from the session, never from the request. The old
    `?user=` parameter let any caller attribute a schedule to somebody else, so
    passing one is now rejected unless it matches the signed-in user.
    """
    user = session["username"]
    requested_user = request.args.get("user")

    if requested_user and requested_user != user:
        return routing.error_response(
            "USER_MISMATCH",
            "The 'user' parameter must match the signed-in user.",
            403,
        )

    source = request.args.get("source")
    frequency = request.args.get("frequency", "WEEKLY").upper()

    if not source:
        return routing.error_response(
            "MISSING_SOURCE",
            "No source given in API call.",
            400,
        )

    if not valid_url(source):
        return routing.error_response(
            "INVALID_SOURCE",
            "Source must be a valid HTTP or HTTPS URL.",
            400,
        )

    if supported_sources.spider_for_url(source) is None:
        return _unsupported_source_response()

    if frequency not in VALID_FREQUENCIES:
        return routing.error_response(
            "INVALID_FREQUENCY",
            "Frequency must be HOURLY, DAILY, WEEKLY, or MONTHLY.",
            400,
        )

    try:
        conn = db.get_db_connection()

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
                    return routing.error_response(
                        "INVALID_USER",
                        "Given user not found in database.",
                        400,
                    )

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
                    # Which scanner will collect it, so the client can confirm
                    # rather than re-deriving support from the URL.
                    "spider": supported_sources.spider_for_url(source),
                }
            ]
        }, 201

    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to connect to or update the database.",
            500,
        )
