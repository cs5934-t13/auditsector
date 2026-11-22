"""Audit report routes: recent list, detail, and the two activity aggregates.

Transport only — the SQL and bucket math live in `services/audits/audits.py`.
"""

import pymysql
from flask import Blueprint, request

import routing
from auth import login_required
from services.audits import audits as audit_service

bp = Blueprint("audits", __name__)


def _invalid_pagination():
    return routing.error_response(
        "INVALID_PAGINATION",
        "page must be at least 1 and limit must be between 1 and 100",
        400,
    )


@bp.route("/audits/recent", methods=["GET"])
@login_required
def get_recent_audits():
    """Newest reports, paginated by record creation time."""
    try:
        page, limit = routing.read_pagination_args()
    except ValueError:
        return _invalid_pagination()

    try:
        rows, total_items = audit_service.recent(page, limit)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to retrieve recent audits",
            500,
        )

    return {
        "data": [audit_service.serialize_row(row, row["tags"]) for row in rows],
        "pagination": routing.paginate(total_items, page, limit),
    }, 200


@bp.route("/audits/risk-over-time", methods=["GET"])
@login_required
def get_risk_over_time():
    """Counts audit reports per risk level for each bucket in a date range.

    Backs the homepage "Risk levels over time" chart. Buckets are keyed on
    `audit_date` (the report's own publication date) rather than `created_at`,
    so the series follows report timelines instead of when the crawler inserted
    the row.

    Every bucket in the range is returned, including empty ones, so the client
    never has to fill gaps.
    """
    try:
        start, end, interval, buckets = audit_service.parse_range(request.args)
    except ValueError as invalid:
        return routing.error_response("INVALID_DATE_RANGE", str(invalid), 400)

    try:
        data = audit_service.risk_over_time(interval, start, end, buckets)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to aggregate audit risk levels.",
            500,
        )

    return {"data": data}, 200


@bp.route("/audits/scan-activity", methods=["GET"])
@login_required
def get_scan_activity():
    """Counts audit records added per bucket in a date range.

    Backs the homepage "Reports scanned over time" chart. Buckets are keyed on
    `created_at`, the moment the fetcher inserted the record, which is the
    closest thing the schema stores to a scan time: `audit_headers` has no
    completed-at column and `run_status` is a current-state flag.
    """
    try:
        start, end, interval, buckets = audit_service.parse_range(request.args)
    except ValueError as invalid:
        return routing.error_response("INVALID_DATE_RANGE", str(invalid), 400)

    try:
        data = audit_service.scan_activity(interval, start, end, buckets)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to aggregate scan activity.",
            500,
        )

    return {"data": data}, 200


@bp.route("/audits/<audit_id>", methods=["GET"])
@login_required
def get_audit_report(audit_id):
    """One report with its summary and tags.

    Tolerates a pre-migration schema: optional columns are selected only when
    they exist, and the response reports empty values for the ones that do not.
    """
    try:
        report = audit_service.get(audit_id)
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to retrieve audit report.",
            500,
        )

    if report is None:
        return routing.error_response(
            "AUDIT_NOT_FOUND",
            "Audit report not found.",
            404,
        )

    return {"data": report}, 200
