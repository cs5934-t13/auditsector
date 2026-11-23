"""Scan schedules: list what the worker is watching, and remove one.

Schedules were write-only from the web tier: `POST /sources` created them, but
nothing could read them back, so the UI could not show what was scheduled or why
a source was producing nothing. These endpoints close that gap.

Deletion is administrator-only. `audit_headers.schedule_id` is
``ON DELETE RESTRICT``, so a schedule that has produced reports cannot be
removed without destroying those reports; the endpoint reports that conflict
rather than cascading by surprise.
"""

import pymysql
from flask import Blueprint, session

import db
import routing
from auth import admin_required, current_role, login_required

bp = Blueprint("schedules", __name__)

#: `schedules.scan_status` values. Mirrors the column's ENUM.
ACTIVE = "ACTIVE"

#: Wording per failure code, shown to every signed-in user. Kept server-side so
#: the sentence can be improved without shipping a new client build, and so the
#: raw worker message is never the user-facing label.
FAILURE_MESSAGES = {
    "UNSUPPORTED_SOURCE": (
        "This source is not supported yet. Remove it, or use a supported address."
    ),
    "SOURCE_UNREADABLE": (
        "We couldn't read reports from this source. It will try again shortly."
    ),
    "SCAN_TIMEOUT": (
        "The scan took too long. It will try again."
    ),
    "SCAN_FAILED": (
        "The scan stopped unexpectedly. It will try again."
    ),
}


def _is_admin():
    """True when the session's *current* role is ADMIN.

    Read from the database rather than the session blob, matching the guards, so
    a demoted administrator stops seeing diagnostics immediately.
    """
    row = current_role(session.get("username"))
    return bool(row) and row["user_role"] == "ADMIN" and row["user_status"] == "ACTIVE"


def _db_error():
    return routing.error_response(
        "INTERNAL_SERVER_ERROR",
        "Unable to retrieve schedules.",
        500,
    )


def _isoformat(value):
    """Timestamp as `YYYY-MM-DDTHH:MM:SS`, matching the audit endpoints.

    The columns are timezone-free UTC, so no suffix is added.
    """
    return value.isoformat(timespec="seconds") if value is not None else None


def serialize_schedule(row, include_detail=False):
    """One schedule as the client expects it.

    `report_count` lets the UI explain a delete that will be refused. The run
    state and `last_error` report what the worker observed; the UI does not
    re-derive support from the URL. Stored schedules are supported by
    construction, because `POST /sources` refuses unsupported ones. The only way
    a stored schedule becomes unsupported is a source being dropped from the
    allow-list later, and that surfaces as `scan_status: "UNSUPPORTED"` with the
    worker's reason in `last_error`.
    """
    return {
        "schedule_id": row["schedule_id"],
        "source_link": row["source_link"],
        "scan_frequency": row["scan_frequency"],
        "scan_status": row.get("scan_status") or ACTIVE,
        "last_run_at": _isoformat(row.get("last_run_at")),
        "last_run_status": row.get("last_run_status"),
        # A stable code the UI can switch on, and a sentence written for a person.
        # The raw worker text is *not* sent: it names interpreter paths and argv.
        "last_error_code": row.get("last_error_code"),
        "last_error": (
            FAILURE_MESSAGES.get(row.get("last_error_code"))
            or row.get("last_error")
        ),
        # Administrative diagnostics: the worker's own message.
        **({"last_error_detail": row.get("last_error_detail")} if include_detail else {}),
        # Live progress. A non-NULL `current_run_started_at` means a scan is in
        # flight, which is the "is it working or stuck?" signal.
        "is_running": row.get("current_run_started_at") is not None,
        "run_started_at": _isoformat(row.get("current_run_started_at")),
        "run_total": row.get("run_total"),
        "run_downloaded": int(row.get("run_downloaded") or 0),
        "run_processed": int(row.get("run_processed") or 0),
        "next_run_at": _isoformat(row.get("next_run_at")),
        "created_at": _isoformat(row.get("created_at")),
        "created_by": row.get("created_by"),
        "created_by_username": row.get("created_by_username"),
        "report_count": int(row.get("report_count") or 0),
    }


@bp.route("/schedules", methods=["GET"])
@login_required
def list_schedules():
    """Every schedule with its run state and how many reports it produced.

    Results are counts and metadata only; no report rows are read, so this stays
    cheap even when a source has thousands of reports.
    """
    try:
        conn = db.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.schedule_id,
                           s.source_link,
                           s.scan_frequency,
                           s.scan_status,
                           s.last_run_at,
                           s.last_run_status,
                           s.last_error,
                           s.last_error_code,
                           s.last_error_detail,
                           s.current_run_started_at,
                           s.run_total,
                           s.run_downloaded,
                           s.run_processed,
                           s.next_run_at,
                           s.created_at,
                           s.created_by,
                           u.username AS created_by_username,
                           COUNT(a.audit_id) AS report_count
                    FROM schedules AS s
                    LEFT JOIN users AS u ON u.user_id = s.created_by
                    LEFT JOIN audit_headers AS a ON a.schedule_id = s.schedule_id
                    GROUP BY s.schedule_id, s.source_link, s.scan_frequency,
                             s.scan_status, s.last_run_at, s.last_run_status,
                             s.last_error, s.last_error_code, s.last_error_detail,
                             s.current_run_started_at, s.run_total,
                             s.run_downloaded, s.run_processed,
                             s.next_run_at, s.created_at, s.created_by, u.username
                    ORDER BY s.created_at DESC, s.schedule_id DESC;
                    """
                )
                rows = cur.fetchall()
    except pymysql.MySQLError:
        return _db_error()

    include_detail = _is_admin()
    return {
        "data": [serialize_schedule(row, include_detail) for row in rows]
    }, 200


@bp.route("/schedules/<int:schedule_id>", methods=["DELETE"])
@admin_required
def delete_schedule(schedule_id):
    """Removes a schedule. Administrator only.

    Reports are kept: a schedule with reports cannot be deleted because
    `audit_headers.schedule_id` is `ON DELETE RESTRICT`. That is deliberate —
    deleting reports is a separate, destructive decision — so the conflict is
    reported as `409` with the count, and the UI tells the operator why.
    """
    try:
        conn = db.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM schedules WHERE schedule_id = %s;",
                    (schedule_id,),
                )
                if cur.fetchone() is None:
                    return routing.error_response(
                        "SCHEDULE_NOT_FOUND",
                        "No such schedule.",
                        404,
                    )

                cur.execute(
                    "SELECT COUNT(*) AS total FROM audit_headers "
                    "WHERE schedule_id = %s;",
                    (schedule_id,),
                )
                total = int(cur.fetchone()["total"] or 0)
                if total:
                    return routing.error_response(
                        "SCHEDULE_IN_USE",
                        f"This schedule has {total} report(s) and cannot be "
                        "deleted while they exist.",
                        409,
                    )

                cur.execute(
                    "DELETE FROM schedules WHERE schedule_id = %s;",
                    (schedule_id,),
                )
            conn.commit()
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to delete the schedule.",
            500,
        )

    # 204 has no body; the client only needs to know it succeeded.
    return "", 204
