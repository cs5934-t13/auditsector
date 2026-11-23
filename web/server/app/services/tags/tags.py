"""Tag queries and the tagging-rule matching rules.

All SQL for tags lives here; `blueprints/tags.py` only shapes HTTP responses.
"""

import re
import unicodedata
from urllib.parse import unquote

import db


def slugify(value):
    """Client-compatible slug for a tag name or route segment.

    Mirrors `tagSlug()` in `web/client/app/src/utils/tags.ts`: NFKD-normalize,
    strip combining marks (`Sécurité` -> `securite`), lower-case, collapse every
    non-alphanumeric run to one hyphen, and drop leading/trailing hyphens.
    """
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "-", stripped.strip().lower())
    return slug.strip("-")


def tag_columns():
    """Column names present on the `tags` table in the active database.

    `description` and `boundary` were added after the original schema, so every
    query selects them only when present. A database that has not run the
    latest init still works instead of raising `Unknown column`.
    """
    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            return _tag_columns(cur)


def _tag_columns(cur):
    """Cursor-scoped variant of `tag_columns`, for callers already connected."""
    cur.execute(
        """
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tags';
        """
    )
    # Ignore rows without the expected key so a simplified test double, or an
    # unexpected result shape, degrades to "column absent" rather than a 500.
    return {row["COLUMN_NAME"] for row in cur.fetchall() if "COLUMN_NAME" in row}


def list_with_counts():
    """Every tag with the number of distinct reports carrying it.

    Uses a LEFT JOIN so tags with no reports are still listed (count 0). The
    tag set is open — users can add tags before any report uses them — so
    dropping empty tags would hide valid destinations from the `/tags` index.

    Ordered alphabetically by display name. This is a reader-facing index, so
    name order is what someone scanning the page expects; `tag_id` would show
    insertion order, which is meaningless to a reader and puts a newly added
    tag at the end regardless of its name.

    `tag_id` is kept as the tiebreak so two names that collate equal (differing
    only in case or trailing spaces) still return in a stable order.
    """
    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            columns = _tag_columns(cur)
            boundary = ", t.boundary" if "boundary" in columns else ""
            description = ", t.description" if "description" in columns else ""

            cur.execute(f"""
                SELECT t.tag_id, t.name, COUNT(DISTINCT at.audit_id) AS report_count
                       {description}
                       {boundary}
                FROM tags AS t
                LEFT JOIN audit_tags AS at ON at.tag_id = t.tag_id
                GROUP BY t.tag_id, t.name
                         {", t.description" if description else ""}
                         {", t.boundary" if boundary else ""}
                ORDER BY t.name, t.tag_id;
            """)
            rows = cur.fetchall()

    return [
        {
            "tag_id": row["tag_id"],
            "name": row["name"],
            "report_count": int(row["report_count"] or 0),
            "description": row.get("description"),
            "boundary": row.get("boundary"),
        }
        for row in rows
    ]


def resolve(segment):
    """Finds the tag whose name matches a URL segment.

    Accepts either the display name or the client's slug. Matching is done in
    Python with `slugify` rather than in SQL, so it is byte-for-byte the rule
    the client applies to route segments (including diacritic stripping, which
    MySQL's collations do not do consistently).

    The tag set is small and indexed by name, so reading it is cheap.

    Returns the tag row (`tag_id`, `name`, and rule text when available) or
    `None`.
    """
    wanted = slugify(unquote(segment))
    if not wanted:
        return None

    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            columns = _tag_columns(cur)
            cur.execute(
                "SELECT tag_id, name, description FROM tags ORDER BY tag_id;"
                if "description" in columns
                else "SELECT tag_id, name, NULL AS description FROM tags ORDER BY tag_id;"
            )
            candidates = cur.fetchall()

            match = next(
                (row for row in candidates if slugify(row["name"]) == wanted),
                None,
            )
            if match is None:
                return None

            # `boundary` is fetched separately so a database without the column
            # still resolves tags instead of raising Unknown column.
            if "boundary" in columns:
                cur.execute(
                    "SELECT boundary FROM tags WHERE tag_id = %s;",
                    (match["tag_id"],),
                )
                row = cur.fetchone() or {}
                match["boundary"] = row.get("boundary")
            else:
                match["boundary"] = None

    return match


#: Sortable columns and the SQL that orders them. The expression is a literal
#: from this table, never request text, so `sort`/`order` cannot be injected.
#: Risk sorts by enum position, not alphabetically, so HIGH is above LOW.
_SORT_ORDERS = {
    "title": "a.title",
    "audit_date": "a.audit_date",
    "created_at": "a.created_at",
    "risk_level": "FIELD(a.risk_level, 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
}

#: Default ordering, kept in one place so the endpoint and its docs agree.
DEFAULT_SORT = ("audit_date", "desc")


def order_clause(sort=None, order=None):
    """The `ORDER BY` body for a requested sort, as `(sql, sort, order)`.

    Falls back to the default for an unknown column or direction rather than
    raising, because the alternative is a 400 for a merely mistyped parameter on
    an otherwise valid request. An unknown *column* discards the direction too:
    honouring "ascending" for a column the caller did not name would echo an
    ordering nobody asked for. `audit_id` is always appended as a tiebreaker so
    equal values do not shuffle between pages.

    Returns the values actually used, so the response can echo them.
    """
    if sort not in _SORT_ORDERS:
        column, direction = DEFAULT_SORT
    else:
        column = sort
        direction = (order or "").lower()
        if direction not in ("asc", "desc"):
            direction = DEFAULT_SORT[1]

    sql = f"{_SORT_ORDERS[column]} {direction.upper()}, a.audit_id {direction.upper()}"
    return sql, column, direction


def audit_page(segment, limit, offset, sort=None, order=None):
    """One page of reports for a tag URL segment.

    Resolving the tag, counting, paging, and collecting the per-row tag names
    all happen on a single connection so a request sees one consistent snapshot
    (and does not open three connections for one page).

    `sort`/`order` are applied through `order_clause`, which whitelists both and
    falls back to the default rather than rejecting a mistyped value.

    Returns `(None, None, None, None, None)` when no tag matches, otherwise
    `(tag_row, rows, total_items, tags_by_audit, applied)` where `applied` is
    `{"sort": ..., "order": ...}` for the ordering actually used.
    """
    wanted = slugify(unquote(segment))
    if not wanted:
        return None, None, None, None, None

    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            columns = _tag_columns(cur)
            cur.execute(
                "SELECT tag_id, name, description FROM tags ORDER BY tag_id;"
                if "description" in columns
                else "SELECT tag_id, name, NULL AS description FROM tags ORDER BY tag_id;"
            )
            resolved = next(
                (row for row in cur.fetchall() if slugify(row["name"]) == wanted),
                None,
            )
            if resolved is None:
                return None, None, None, None, None

            # `boundary` may be missing on a pre-migration database.
            if "boundary" in columns:
                cur.execute(
                    "SELECT boundary FROM tags WHERE tag_id = %s;",
                    (resolved["tag_id"],),
                )
                resolved["boundary"] = (cur.fetchone() or {}).get("boundary")
            else:
                resolved["boundary"] = None

            cur.execute(
                """
                SELECT COUNT(*) AS total_items
                FROM audit_tags
                WHERE tag_id = %s;
                """,
                (resolved["tag_id"],),
            )
            total_items = cur.fetchone()["total_items"]

            # Resolved outside the page branch: an offset past the end returns no
            # rows, but the response still has to report which ordering it would
            # have used.
            clause, applied_sort, applied_order = order_clause(sort, order)

            rows = []
            if offset < total_items:
                cur.execute(
                    f"""
                    SELECT a.audit_id, a.title, a.audit_date, a.created_at,
                           a.risk_level
                    FROM audit_tags AS at
                    JOIN audit_headers AS a ON a.audit_id = at.audit_id
                    WHERE at.tag_id = %s
                    ORDER BY {clause}
                    LIMIT %s OFFSET %s;
                    """,
                    (resolved["tag_id"], limit, offset),
                )
                rows = cur.fetchall()

            tags_by_audit = tags_for_audits(
                cur, [row["audit_id"] for row in rows]
            )

    return (
        resolved,
        rows,
        total_items,
        tags_by_audit,
        {"sort": applied_sort, "order": applied_order},
    )


def audits_for_tag(tag_id, limit, offset):
    """Reports carrying `tag_id`, newest first, plus the total count.

    Returns `([], total)` when the offset is past the end, so the caller does
    not need a separate empty-page branch.
    """
    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS total_items
                FROM audit_tags
                WHERE tag_id = %s;
                """,
                (tag_id,),
            )
            total_items = cur.fetchone()["total_items"]

            if offset >= total_items:
                return [], total_items

            cur.execute(
                """
                SELECT a.audit_id, a.title, a.audit_date, a.created_at,
                       a.risk_level
                FROM audit_tags AS at
                JOIN audit_headers AS a ON a.audit_id = at.audit_id
                WHERE at.tag_id = %s
                ORDER BY a.audit_date DESC, a.audit_id DESC
                LIMIT %s OFFSET %s;
                """,
                (tag_id, limit, offset),
            )
            return cur.fetchall(), total_items


def tags_for_audits(cur, audit_ids):
    """Maps each audit id to its tag names, ordered by name.

    Takes an open cursor so the caller can reuse its connection and transaction.
    Ids with no tags are absent from the mapping; callers default to `[]`.
    """
    if not audit_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(audit_ids))
    cur.execute(
        f"""
        SELECT at.audit_id, t.name
        FROM audit_tags AS at
        JOIN tags AS t ON t.tag_id = at.tag_id
        WHERE at.audit_id IN ({placeholders})
        ORDER BY t.name;
        """,
        tuple(audit_ids),
    )

    tags_by_audit = {}
    for row in cur.fetchall():
        tags_by_audit.setdefault(row["audit_id"], []).append(row["name"])

    return tags_by_audit


__all__ = [
    "audit_page",
    "audits_for_tag",
    "list_with_counts",
    "resolve",
    "slugify",
    "tag_columns",
    "tags_for_audits",
]
