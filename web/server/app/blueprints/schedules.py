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
from flask import Blueprint

import db
import routing
from auth import admin_required, login_required
from services.audits.support import is_supported

bp = Blueprint("schedules", __name__)

#: `schedules.scan_status` values. Mirrors the column's ENUM.
ACTIVE = "ACTIVE"


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


def serialize_schedule(row):
    """One schedule as the client expects it.

    `report_count` lets the UI explain a delete that will be refused, and
    `is_supported` is derived from the same allow-list the scheduler uses, so the
    table can flag a source that will never scan.
    """
    return {
        "schedule_id": row["schedule_id"],
        "source_link": row["source_link"],
        "scan_frequency": row["scan_frequency"],
        "scan_status": row.get("scan_status") or ACTIVE,
        # Whether any spider can collect this source. A schedule can exist for an
        # unsupported URL (older data, or a hand-written row), and the UI must be
        # able to say so rather than imply the source is simply idle.
        "is_supported": is_supported(row["source_link"]),
        "last_run_at": _isoformat(row.get("last_run_at")),
        "last_run_status": row.get("last_run_status"),
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
                             s.next_run_at, s.created_at, s.created_by, u.username
                    ORDER BY s.created_at DESC, s.schedule_id DESC;
                    """
                )
                rows = cur.fetchall()
    except pymysql.MySQLError:
        return _db_error()

    return {"data": [serialize_schedule(row) for row in rows]}, 200


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
