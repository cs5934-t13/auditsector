"""Audit report queries and the activity-bucket arithmetic.

The bucket helpers are pure date math (no database, no request), which is why
they are unit-tested directly. Every SQL statement about `audit_headers` lives
here so `blueprints/audits.py` can stay transport-only.
"""

from datetime import date, timedelta

import db
from services.tags import tags as tag_service

VALID_INTERVALS = {"DAY", "WEEK", "MONTH"}

#: Months covered by the default range when the caller omits both dates.
DEFAULT_ACTIVITY_MONTHS = 12

#: Upper bound on buckets per response. A five-year daily range is 1827
#: buckets; beyond this the request is a mistake rather than a chart.
MAX_ACTIVITY_BUCKETS = 1000

#: Group-by expression per interval. These are substituted into the query, so
#: the value must come from this table and never from the request. `%%` escapes
#: the literal percent signs pymysql would otherwise treat as placeholders.
_BUCKET_EXPRESSIONS = {
    "DAY": "DATE({column})",
    # Monday of the report's week, so buckets are ISO weeks regardless of
    # MySQL's default week-start setting.
    "WEEK": "DATE_SUB(DATE({column}), INTERVAL WEEKDAY({column}) DAY)",
    "MONTH": "DATE_FORMAT({column}, '%%Y-%%m-01')",
}

RISK_LEVELS = ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")


# --- Bucket arithmetic -----------------------------------------------------


def first_of_month(day):
    """Returns the first day of `day`'s month."""
    return day.replace(day=1)


def next_bucket(bucket, interval):
    """Advances one `bucket` start to the next."""
    if interval == "DAY":
        return bucket + timedelta(days=1)
    if interval == "WEEK":
        return bucket + timedelta(days=7)
    # Months vary in length, so step from the 28th into the next month instead
    # of adding a fixed 30 days.
    return first_of_month(bucket.replace(day=28) + timedelta(days=4))


def bucket_start(day, interval):
    """Snaps `day` back to the start of the bucket containing it."""
    if interval == "WEEK":
        return day - timedelta(days=day.weekday())
    if interval == "MONTH":
        return first_of_month(day)
    return day


def bucket_period(bucket, interval):
    """Stable, sortable identifier for a bucket."""
    if interval == "MONTH":
        return f"{bucket.year:04d}-{bucket.month:02d}"
    return bucket.isoformat()


def bucket_label(bucket, interval):
    """Short x-axis label, e.g. `Jan` or `Sep 15`."""
    if interval == "MONTH":
        return bucket.strftime("%b")
    return f"{bucket.strftime('%b')} {bucket.day}"


def build_buckets(start, end, interval):
    """Every bucket start from `start` to `end`, inclusive.

    Raises `ValueError` when the range is too large to be a chart, so the
    endpoint can answer 400 instead of streaming thousands of buckets.
    """
    buckets = []
    bucket = bucket_start(start, interval)
    while bucket <= end:
        buckets.append(bucket)
        bucket = next_bucket(bucket, interval)
        if len(buckets) > MAX_ACTIVITY_BUCKETS:
            raise ValueError(
                f"the range spans more than {MAX_ACTIVITY_BUCKETS} buckets; "
                "narrow it or use a larger interval"
            )

    if not buckets:
        # Unreachable while `start <= end`, but keeps the caller's contract
        # explicit: an empty list means "no buckets", never "bad request".
        raise ValueError("the range contains no buckets")

    return buckets


def parse_range(args):
    """Validates `start_date`, `end_date` and `interval` mapping.

    Takes the request args rather than the request itself, so this stays a pure
    function that callers can test without a Flask request context.

    Returns `(start, end_exclusive, interval, buckets)`. The default range is
    the last `DEFAULT_ACTIVITY_MONTHS` months including the current one, which
    is what the homepage charts want when the caller sends no dates.

    Raises `ValueError` with a client-safe message for a bad request.
    """
    interval = (args.get("interval") or "MONTH").upper()
    if interval not in VALID_INTERVALS:
        raise ValueError("interval must be one of DAY, WEEK, MONTH")

    end_raw = args.get("end_date")
    start_raw = args.get("start_date")

    if end_raw:
        try:
            end = date.fromisoformat(end_raw)
        except ValueError:
            raise ValueError("end_date must be a calendar date, YYYY-MM-DD") from None
    else:
        end = first_of_month(date.today())
        # Move to the last day of the current month.
        end = next_bucket(end, "MONTH") - timedelta(days=1)

    if start_raw:
        try:
            start = date.fromisoformat(start_raw)
        except ValueError:
            raise ValueError("start_date must be a calendar date, YYYY-MM-DD") from None
    else:
        start = first_of_month(end)
        for _ in range(DEFAULT_ACTIVITY_MONTHS - 1):
            start = first_of_month(start - timedelta(days=1))

    if start > end:
        raise ValueError("start_date must be on or before end_date")

    buckets = build_buckets(start, end, interval)
    # `end_exclusive` is the day after the final bucket, which makes the SQL
    # range `>= start AND < end_exclusive` cover the last bucket exactly.
    return start, next_bucket(buckets[-1], interval), interval, buckets


# --- Queries ---------------------------------------------------------------


def _bucket_column(value):
    """Normalizes a group-by bucket to a `date`.

    `DATE_FORMAT` returns a string while the DATE-based expressions return a
    date, so both shapes must map onto the same key type.
    """
    return date.fromisoformat(value) if isinstance(value, str) else value


def bucketed_counts(column, interval, start, end_exclusive):
    """Counts rows per bucket, returned as `{bucket_start: count}`.

    The caller fills missing buckets with zeros, so this only returns buckets
    that actually contain rows.
    """
    expression = _BUCKET_EXPRESSIONS[interval].format(column=column)

    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {expression} AS bucket, COUNT(*) AS total
                FROM audit_headers
                WHERE {column} >= %s AND {column} < %s
                GROUP BY bucket;
                """,
                (start, end_exclusive),
            )
            rows = cur.fetchall()

    return {_bucket_column(row["bucket"]): row["total"] for row in rows}


def bucketed_risk(column, interval, start, end_exclusive):
    """Counts rows per bucket and risk level.

    Returns `{bucket_start: {level: count}}`, where `level` is one of the
    database's risk levels or `UNRATED` for a NULL classification.
    """
    expression = _BUCKET_EXPRESSIONS[interval].format(column=column)

    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {expression} AS bucket,
                       COALESCE(risk_level, 'UNRATED') AS level,
                       COUNT(*) AS total
                FROM audit_headers
                WHERE {column} >= %s AND {column} < %s
                GROUP BY bucket, level;
                """,
                (start, end_exclusive),
            )
            rows = cur.fetchall()

    counts = {}
    for row in rows:
        counts.setdefault(_bucket_column(row["bucket"]), {})[row["level"]] = row["total"]

    return counts


def risk_over_time(interval, start, end_exclusive, buckets):
    """Chart-ready per-level counts for every bucket in the range."""
    counts = bucketed_risk("audit_date", interval, start, end_exclusive)

    data = []
    for bucket in buckets:
        levels = counts.get(bucket, {})
        per_level = {level: levels.get(level, 0) for level in RISK_LEVELS}
        unrated = levels.get("UNRATED", 0)
        data.append(
            {
                "period": bucket_period(bucket, interval),
                "label": bucket_label(bucket, interval),
                "total": sum(per_level.values()) + unrated,
                "counts": {**per_level, "UNRATED": unrated},
            }
        )

    return data


def scan_activity(interval, start, end_exclusive, buckets):
    """Chart-ready counts of records added per bucket."""
    counts = bucketed_counts("created_at", interval, start, end_exclusive)

    return [
        {
            "period": bucket_period(bucket, interval),
            "label": bucket_label(bucket, interval),
            "total": counts.get(bucket, 0),
        }
        for bucket in buckets
    ]


def recent(page, limit):
    """Newest reports, one page, ordered by record creation.

    Returns `(rows, total_items)`. Each row gains a `tags` list from a single
    extra query for the whole page rather than one query per row.
    """
    offset = (page - 1) * limit

    conn = db.get_db_connection()
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
                SELECT audit_id, title, audit_date, created_at, risk_level
                FROM audit_headers
                ORDER BY created_at DESC, audit_id DESC
                LIMIT %s OFFSET %s;
                """,
                (limit, offset),
            )
            rows = cur.fetchall()

            tags_by_audit = tag_service.tags_for_audits(
                cur, [row["audit_id"] for row in rows]
            )

    for row in rows:
        row["tags"] = tags_by_audit.get(row["audit_id"], [])

    return rows, total_items


def optional_columns(cur):
    """Optional `audit_headers`/`tags` columns present in this database.

    `muni`, `audit_url`, and `tags.description` are added by the scheduler/
    fetcher migration (`data/migrations/scheduler_fetcher.py`). A database that
    has not run it is still readable, so the report query selects them only when
    present instead of failing with `Unknown column`.

    Returns `{"audit_headers": set(), "tags": set()}`.
    """
    cur.execute(
        """
        SELECT TABLE_NAME, COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('audit_headers', 'tags');
        """
    )

    present = {"audit_headers": set(), "tags": set()}
    for row in cur.fetchall():
        table = row.get("TABLE_NAME")
        if table in present:
            present[table].add(row.get("COLUMN_NAME"))

    return present


def get(audit_id):
    """One report with its summary and tags, or `None` when it does not exist.

    Tolerates a pre-migration schema; absent columns come back as empty values.
    """
    conn = db.get_db_connection()
    with conn:
        with conn.cursor() as cur:
            columns = optional_columns(cur)
            has_muni = "muni" in columns["audit_headers"]
            has_url = "audit_url" in columns["audit_headers"]
            has_tag_description = "description" in columns["tags"]

            # The optional columns are built into the select list so one query
            # covers both schemas.
            cur.execute(
                f"""
                SELECT
                    audit_id,
                    schedule_id,
                    title,
                    audit_date,
                    risk_level,
                    run_status,
                    summary,
                    created_at
                    {", muni" if has_muni else ""}
                    {", audit_url" if has_url else ""}
                FROM audit_headers
                WHERE audit_id = %s
                """,
                (audit_id,),
            )
            audit = cur.fetchone()

            if audit is None:
                return None

            cur.execute(
                f"""
                SELECT
                    t.tag_id,
                    t.name
                    {", t.description" if has_tag_description else ""}
                FROM audit_tags AS at
                JOIN tags AS t
                    ON at.tag_id = t.tag_id
                WHERE at.audit_id = %s
                ORDER BY t.name
                """,
                (audit_id,),
            )
            tags = cur.fetchall()

    for tag in tags:
        # Keep one response shape across schemas; the client already treats a
        # null description as "this tag has no description".
        tag.setdefault("description", None)

    return {
        "audit_id": str(audit["audit_id"]),
        "schedule_id": audit["schedule_id"],
        "title": audit["title"],
        "municipality": audit.get("muni") or "",
        "audit_url": audit.get("audit_url") or "",
        "audit_date": audit["audit_date"].isoformat(timespec="seconds"),
        "risk_level": audit["risk_level"],
        "run_status": audit["run_status"],
        "summary": audit["summary"],
        "created_at": audit["created_at"].isoformat(timespec="seconds"),
        "tags": tags,
    }


def serialize_row(row, tags):
    """Serializes one audit row for the list endpoints.

    `GET /audits/recent` and `GET /tags/<tag>/audits` return the same row shape,
    so the serialization lives here to keep the two responses from drifting.
    """
    return {
        "audit_id": row["audit_id"],
        "title": row["title"],
        "audit_date": row["audit_date"].isoformat(timespec="seconds"),
        "created_at": row["created_at"].isoformat(timespec="seconds"),
        "risk_level": row["risk_level"],
        "tags": tags,
    }
