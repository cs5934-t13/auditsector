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


def save_run(connection, schedule_id, started_at, status, next_run_at):
    """Record outcome and next time atomically, preserving an archive made during a scan.

    `status` is the run outcome. `UNSUPPORTED` is not a run status; it means the
    source is terminally unusable, so the schedule is parked and its
    `last_run_status` records the failure as an error for the operator.
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

    try:
        with connection.cursor() as cur:
            cur.execute(
                """UPDATE schedules SET last_run_at=%s, last_run_status=%s,
                scan_status=COALESCE(%s, scan_status),
                next_run_at=CASE WHEN scan_frequency='ARCHIVE' THEN NULL ELSE %s END
                WHERE schedule_id=%s""",
                (
                    utc(started_at),
                    last_status,
                    scan_status,
                    utc(next_run_at),
                    schedule_id,
                ),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
