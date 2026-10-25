"""Connect scheduler timing logic to database storage."""

from collections.abc import Callable
import logging
import time
from datetime import datetime, timezone

from services.scheduler.repository import (
    connect_db,
    load_schedules,
    save_next_run,
)
from services.scheduler.scheduler import Schedule, trigger_due_scans

logger = logging.getLogger(__name__)

def run_once(
    connection,
    now: datetime,
    trigger_scan: Callable[[Schedule], None],
) -> None:
    """Load schedules and process those that are due."""
    schedules = load_schedules(connection)

    def persist_next_run(schedule_id: int, next_run_at: datetime):
        save_next_run(connection, schedule_id, next_run_at)

    trigger_due_scans(
        schedules,
        now,
        trigger_scan,
        persist_next_run,
    )
def run_forever(
    trigger_scan: Callable[[Schedule], None],
    poll_seconds: float = 60,
) -> None:
    """Check schedules repeatedly until interrupted."""
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be greater than zero")

    try:
        while True:
            try:
                connection = connect_db()
                try:
                    run_once(
                        connection,
                        datetime.now(timezone.utc),
                        trigger_scan,
                    )
                finally:
                    connection.close()
            except Exception:
                logger.exception("Scheduler pass failed")

            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        logger.info("Scheduler stopped")