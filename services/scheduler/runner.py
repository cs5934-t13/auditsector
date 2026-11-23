"""Single-worker polling loop; MySQL coordinates overlapping worker instances."""

import logging
import time
from datetime import UTC, datetime

import pymysql

from services.scheduler.repository import (
    begin_run,
    connect_db,
    load_schedules,
    save_run,
)
from services.scheduler.scheduler import trigger_due_scans

logger = logging.getLogger(__name__)
LOCK_NAME = "auditsector.scheduler"


def run_once(connection, now, trigger_scan, is_unsupported=None):
    with connection.cursor() as cur:
        cur.execute("SELECT GET_LOCK(%s, 0) AS acquired", (LOCK_NAME,))
        if cur.fetchone()["acquired"] != 1:
            return 0
    try:
        schedules = load_schedules(connection)
        connection.commit()  # End the read snapshot before a potentially long crawl.
        return trigger_due_scans(
            schedules,
            now,
            trigger_scan,
            save_result=lambda sid, started, status, next_run, failure=None: (
                save_run(connection, sid, started, status, next_run, failure=failure)
            ),
            clock=lambda: datetime.now(UTC),
            is_unsupported=is_unsupported,
            begin_run=lambda sid, started: begin_run(connection, sid, started),
        )
    finally:
        with connection.cursor() as cur:
            cur.execute("SELECT RELEASE_LOCK(%s)", (LOCK_NAME,))


def run_forever(trigger_scan, poll_seconds=60, is_unsupported=None):
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be greater than zero")
    try:
        while True:
            run_completed = False

            while not run_completed:
                time.sleep(5)

                try:
                    connection = connect_db()
                    try:
                        run_once(
                            connection,
                            datetime.now(UTC),
                            trigger_scan,
                            is_unsupported=is_unsupported,
                        )
                        run_completed = True
                        logger.info("Run successful.")
                    finally:
                        connection.close()
                except pymysql.err.OperationalError as oe:
                    error_code = oe.args[0] if oe.args else None
                    if error_code != 2003:
                        logger.exception("Scheduler pass failed")
                    logger.info("Retrying database connection in 5 seconds.")

            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        logger.info("Scheduler stopped")
