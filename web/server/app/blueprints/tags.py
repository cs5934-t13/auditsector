"""Tag routes: the `/tags` index and per-tag report lists.

Transport only — the SQL and slug rules live in `services/tags/tags.py`.
"""

from urllib.parse import unquote

import pymysql
from flask import Blueprint

import routing
from auth import login_required
from services.audits import audits as audit_service
from services.tags import tags as tag_service

bp = Blueprint("tags", __name__)


@bp.route("/tags", methods=["GET"])
@login_required
def get_tag_index():
    """Every tag with its report count, for the `/tags` index page.

    Returns the aggregate the index needs: one entry per tag, including tags
    that have no reports yet (count 0), ordered in seed/taxonomy order, with
    the tagging rule (`description` inclusion, `boundary` exclusion).
    """
    try:
        return {"data": tag_service.list_with_counts()}, 200
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to retrieve tags.",
            500,
        )


@bp.route("/tags/<string:tag>/audits", methods=["GET"])
@login_required
def get_tag_audits(tag):
    """Audit reports carrying one tag, newest first.

    `<tag>` may be the display name or the client's slug
    (`information-technology`); `tag_service.resolve` applies the same
    normalization the client uses, so a hand-typed URL still resolves.

    The converter is `string`, not `path`: a tag slug can never contain a `/`,
    and Werkzeug ignores `strict_slashes` on `path:` rules (the converter's
    greedy match swallows the trailing slash), which made
    `/tags/inventory/audits/` a hard 404.

    A tag with no reports returns `200` and an empty page. An unknown tag is a
    `404`, so the page can offer alternative tags instead of implying the tag
    exists but is unused.
    """
    try:
        page, limit = routing.read_pagination_args()
    except ValueError:
        return routing.error_response(
            "INVALID_PAGINATION",
            "page must be at least 1 and limit must be between 1 and 100",
            400,
        )

    try:
        resolved, rows, total_items, tags_by_audit = tag_service.audit_page(
            tag, limit, (page - 1) * limit
        )
    except pymysql.MySQLError:
        return routing.error_response(
            "INTERNAL_SERVER_ERROR",
            "Unable to retrieve audits for tag.",
            500,
        )

    if resolved is None:
        return routing.error_response(
            "TAG_NOT_FOUND",
            f'No tag matches "{unquote(tag)}"',
            404,
        )

    return {
        "data": [
            audit_service.serialize_row(row, tags_by_audit.get(row["audit_id"], []))
            for row in rows
        ],
        # The tagging rule travels with the tag so the page can explain what the
        # tag means next to the reports it selected.
        "tag": {
            "tag_id": resolved["tag_id"],
            "name": resolved["name"],
            "description": resolved.get("description"),
            "boundary": resolved.get("boundary"),
        },
        "pagination": routing.paginate(total_items, page, limit),
    }, 200
