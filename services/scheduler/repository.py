"""Database access for audit-source schedules."""

from services.scheduler.scheduler import Schedule
import os
from datetime import timezone

import pymysql

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
            SELECT schedule_id, source_link, scan_frequency, next_run_at
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
        )
        for row in rows
    ]