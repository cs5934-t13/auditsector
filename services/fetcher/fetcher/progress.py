"""Report scan progress to the schedules table.

The UI polls `schedules` while a scan runs, so the counters there have to move
during the crawl, not only at the end. Three moments matter:

* the collection page has been parsed, so the total is known (`record_total`);
* a PDF has landed on disk (`record_download`);
* a report has been committed (`record_processed`).

Each write is a single-column UPDATE, so a crawl never holds a transaction open
across an AI call. Failures are deliberately swallowed: progress is a
convenience, and losing a counter must not fail an otherwise good scan.
"""

import logging

from fetcher.storage import connect_db

logger = logging.getLogger(__name__)


def _update(schedule_id, column, value):
    """Set one progress column, ignoring failures."""
    if not schedule_id:
        return
    try:
        conn = connect_db()
        try:
            with conn.cursor() as cur:
                # `column` is a literal from the three call sites below, never
                # user input; the value is always bound.
                cur.execute(
                    f"UPDATE schedules SET {column}=%s WHERE schedule_id=%s",
                    (value, schedule_id),
                )
            # pymysql's connection context manager closes but does not commit,
            # so the update would be rolled back silently without this.
            conn.commit()
        finally:
            conn.close()
    except Exception:  # pylint: disable=broad-except
        logger.warning(
            "Could not record %s for schedule %s", column, schedule_id,
            exc_info=True,
        )


def record_total(schedule_id, total):
    """Store how many reports the source listed."""
    _update(schedule_id, "run_total", int(total))


def record_download(schedule_id, downloaded):
    """Store how many PDFs have been fetched so far."""
    _update(schedule_id, "run_downloaded", int(downloaded))


def record_processed(schedule_id, processed):
    """Store how many reports have been committed so far."""
    _update(schedule_id, "run_processed", int(processed))
