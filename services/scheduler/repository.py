"""Database access for audit-source schedules."""

import os
from datetime import datetime, timezone

import pymysql

from services.scheduler.scheduler import Schedule


def connect_db():
    """Connect to MySQL using environment configuration."""
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database=os.environ.get("DB_NAME", "auditsector"),
        cursorclass=pymysql.cursors.DictCursor,
    )


# Convention: next_run_at values in MySQL represent UTC.
def load_schedules(connection) -> list[Schedule]:
    """Read schedules using a connection with dictionary cursors."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT schedule_id, source_link, scan_frequency, next_run_at,
                   scan_status
            FROM schedules
            ORDER BY next_run_at, schedule_id
            """
        )
        rows = cursor.fetchall()

    return [
        Schedule(
            schedule_id=row["schedule_id"],
            source_link=row["source_link"],
            scan_frequency=row["scan_frequency"],
            next_run_at=(
                row["next_run_at"].replace(tzinfo=timezone.utc)
                if row["next_run_at"] is not None
                else None
            ),
            scan_status=row.get("scan_status") or "ACTIVE",
        )
        for row in rows
    ]


def save_next_run(
    connection,
    schedule_id: int,
    next_run_at: datetime,
) -> None:
    """Save an aware datetime as a UTC MySQL DATETIME."""
    if next_run_at.utcoffset() is None:
        raise ValueError("next_run_at must include a timezone")

    database_time = next_run_at.astimezone(timezone.utc).replace(tzinfo=None)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE schedules
                SET next_run_at = %s
                WHERE schedule_id = %s
                """,
                (database_time, schedule_id),
            )

        connection.commit()
    except Exception:
        connection.rollback()
        raise


#: Longest friendly message stored in `schedules.last_error`. This is the line an
#: end user reads, so it is kept short enough to sit in a table cell.
MAX_ERROR_LENGTH = 300

#: Longest technical detail stored in `schedules.last_error_detail`. Administrators
#: see this; it is where a stack-trace-ish string is allowed to live.
MAX_ERROR_DETAIL_LENGTH = 2000


def _failure_columns(last_status, failure):
    """The three failure columns, truncated, and cleared when the run succeeded.

    `failure` is the mapping `scheduler.failure_fields()` builds, so this module
    does not need to know how an exception becomes a code. Split out of
    `save_run` so the truncation limits and the "a success clears the message"
    rule are stated once, where they are easy to test.
    """
    if last_status != "ERROR" or not failure:
        return None, None, None

    detail = failure.get("error_detail")
    message = failure.get("error")
    return (
        failure.get("error_code"),
        str(message)[:MAX_ERROR_LENGTH] if message else None,
        str(detail)[:MAX_ERROR_DETAIL_LENGTH] if detail else None,
    )


def begin_run(connection, schedule_id, started_at):
    """Mark a scan as started and reset its progress counters.

    `current_run_started_at` is the "scanning" signal the UI polls for. Doing
    this before the crawl is what makes a long download phase visible: nothing
    else is written until the first report is committed.
    """
    try:
        with connection.cursor() as cur:
            cur.execute(
                """UPDATE schedules
                SET current_run_started_at=%(started_at)s,
                    run_total=NULL, run_downloaded=0, run_processed=0
                WHERE schedule_id=%(schedule_id)s""",
                {
                    "started_at": started_at.astimezone(timezone.utc).replace(
                        tzinfo=None
                    ),
                    "schedule_id": schedule_id,
                },
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def record_run_total(connection, schedule_id, total):
    """Store how many reports the source listed, once the index is parsed."""
    try:
        with connection.cursor() as cur:
            cur.execute(
                "UPDATE schedules SET run_total=%s WHERE schedule_id=%s",
                (int(total), schedule_id),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise


# Six arguments is inherent: one row identity, three outcome fields, and the
# failure mapping. Folding them into a params object would hide the call site's
# meaning without reducing what the UPDATE needs.
# pylint: disable-next=too-many-arguments
def save_run(connection, schedule_id, started_at, status, next_run_at, *, failure=None):
    """Record outcome and next time atomically, preserving an archive made during a scan.

    `status` is the run outcome. `UNSUPPORTED` is not a run status; it means the
    source is terminally unusable, so the schedule is parked and its
    `last_run_status` records the failure as an error for the operator.

    `failure` is the mapping built by `scheduler.failure_fields()`, holding three
    fields for three audiences:

    * `error_code` — stable, switchable (`SOURCE_UNREADABLE`, `SCAN_TIMEOUT`, ...),
      so the UI can choose its own wording.
    * `error` — a short person-readable sentence, what the table shows.
    * `error_detail` — the raw technical text, shown to administrators only.

    All three are cleared on success, so a stale message never outlives the
    failure it described.
    """

    def utc(value):
        if value.utcoffset() is None:
            raise ValueError("Schedule times must include a timezone")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    parked = status == "UNSUPPORTED"
    last_status = "ERROR" if parked else status
    # One statement for both outcomes: only the parked branch touches
    # `scan_status`, and it is set to the value the run already implies. Writing
    # the column as a parameter keeps a single SQL string to review.
    scan_status = "UNSUPPORTED" if parked else None

    error_code, last_error, last_error_detail = _failure_columns(
        last_status, failure
    )
    # Named placeholders, not positional: these six fields have different types
    # (a datetime, two ENUMs, two TEXTs) and a positional tuple silently wrote the
    # message into the ENUM column once, which strict mode rejected at runtime.
    # Binding by name makes a mismatch a `KeyError` in tests, not a crash in
    # production.
    try:
        with connection.cursor() as cur:
            cur.execute(
                """UPDATE schedules SET last_run_at=%(started_at)s,
                last_run_status=%(last_status)s,
                scan_status=COALESCE(%(scan_status)s, scan_status),
                last_error=%(last_error)s,
                last_error_code=%(error_code)s,
                last_error_detail=%(last_error_detail)s,
                -- The run is over, so its progress stops being true.
                current_run_started_at=NULL,
                run_total=NULL,
                next_run_at=CASE WHEN scan_frequency='ARCHIVE' THEN NULL
                                 ELSE %(next_run_at)s END
                WHERE schedule_id=%(schedule_id)s""",
                {
                    "started_at": utc(started_at),
                    "last_status": last_status,
                    "scan_status": scan_status,
                    "last_error": last_error,
                    "error_code": error_code,
                    "last_error_detail": last_error_detail,
                    "next_run_at": utc(next_run_at),
                    "schedule_id": schedule_id,
                },
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
