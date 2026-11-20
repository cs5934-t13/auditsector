"""Single-worker polling loop; MySQL coordinates overlapping worker instances."""

import logging
import time
from datetime import datetime, timezone

from repository import connect_db, load_schedules, save_run
from scheduler_calculate import trigger_due_scans

logger = logging.getLogger(__name__)
LOCK_NAME = "auditsector.scheduler"


def run_once(connection, now, trigger_scan):
    with connection.cursor() as cur:
        schedules = load_schedules(connection)
        connection.commit()  # End the read snapshot before a potentially long crawl.
        return trigger_due_scans(
            schedules,
            now,
            trigger_scan,
            save_result=lambda sid, started, status, next_run: save_run(
                connection, sid, started, status, next_run
            ),
            clock=lambda: datetime.now(timezone.utc),
        )


def run_forever(trigger_scan, poll_seconds=60):
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be greater than zero")
    try:
        while True:
            run_completed = False
            while not run_completed:
                logger.info("Attempting database connection")
                time.sleep(5)
                try:
                    connection = connect_db()
                    try:
                        logger.info("Beginning run")
                        run_once(connection, datetime.now(timezone.utc), trigger_scan)
                        logger.info("Run completing")
                        run_completed = True
                    finally:
                        connection.close()
                except pymysql.err.OperationError as oe:
                    error_code = oe.args[0] if oe.args else None
                    if error_code != 2003:
                        logger.exception("Scheduler pass failed")
                    logger.info("Database not initialized yet. Retrying in 5 seconds.")


            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        logger.info("Scheduler stopped")
