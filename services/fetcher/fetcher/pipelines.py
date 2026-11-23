"""Process downloaded PDFs and commit reports and duplicate receipts together."""

import logging
from datetime import datetime, timezone
from pathlib import Path
from scrapy.pipelines.files import FilesPipeline
from fetcher.ai.pipeline import process_audit
from fetcher.classes import Audit
from fetcher.progress import record_download, record_processed
from fetcher.storage import connect_db

logger = logging.getLogger(__name__)


def _utcnow():
    """Naive UTC now, matching the timezone-free `audit_date` column."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _record_downloads(spider, files):
    """Record a `DOWNLOADED` receipt for each file, keeping any `PROCESSED` row.

    Done in one transaction for the batch: these rows only exist to make the
    next run resumable, so they are worth one round trip, not one per file.
    """
    if not files:
        return
    try:
        with connect_db() as conn, conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO fetches (spider_id, fetch_url, status)
                VALUES (%s, %s, 'DOWNLOADED')
                ON DUPLICATE KEY UPDATE status=status""",
                [(spider.name, file["url"]) for file in files],
            )
        record_download(spider.schedule_id, len(files))
    except Exception:  # pylint: disable=broad-except
        # Progress is a convenience; a receipt failure must not fail the crawl.
        logger.warning("Could not record download receipts", exc_info=True)


#: Longest list of failed URLs written to the log, so one broken source cannot
#: bury the rest of the run's output.
MAX_LOGGED_FAILURES = 5


def _report_missing_downloads(item, files):
    """Log which URLs failed to download, without failing the batch.

    The count is what matters operationally; the URLs make it diagnosable. Both
    go to the log, and the crawl exits non-zero on download failures, which is
    what surfaces as a retry rather than a silent partial success.
    """
    expected = len(item.get("file_urls", []))
    missing = expected - len(files)
    if missing <= 0:
        return

    downloaded = {file["url"] for file in files}
    failed = [url for url in item.get("file_urls", []) if url not in downloaded]
    logger.warning(
        "%s of %s downloads failed; processing the %s that succeeded. Failed: %s",
        missing,
        expected,
        len(files),
        ", ".join(failed[:MAX_LOGGED_FAILURES])
        + (" ..." if len(failed) > MAX_LOGGED_FAILURES else ""),
    )


class FetcherPipeline:
    def process_item(self, item):
        return item


class PdfPipeline(FilesPipeline):
    """Retain Scrapy's URL-hash filenames, which also work outside Portland."""


class SummarizeTagPipeline:
    @classmethod
    def from_crawler(cls, crawler):
        instance = cls()
        instance.crawler = crawler
        return instance

    def process_item(self, item, spider):
        # `files` holds only the downloads that succeeded, because FilesPipeline
        # drops failures before this runs. Processing what arrived and reporting
        # the shortfall is deliberate: raising here discarded every successful
        # download in the batch, so one bad URL cost 200 good reports. The failed
        # URLs have no receipt, so `new_files()` re-queues them next run.
        files = item.get("files", [])
        _report_missing_downloads(item, files)
        if not files:
            logger.warning(
                "No downloads succeeded for %s; nothing to process", spider.name
            )
            return item
        store = Path(self.crawler.settings["FILES_STORE"])

        # Every file in the item is on disk at this point: FilesPipeline runs
        # first and fills `files` for the whole batch. Recording the receipts
        # now is what lets a killed crawl resume instead of re-downloading.
        _record_downloads(spider, files)

        processed_count = 0
        for file in files:
            # Already-committed reports are skipped even if the item is retried.
            with connect_db() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM fetches "
                    "WHERE spider_id=%s AND fetch_url=%s",
                    (spider.name, file["url"]),
                )
                existing = cur.fetchone()
                if existing and existing["status"] == "PROCESSED":
                    continue
            processed = process_audit(store / file["path"], audit_url=file["url"])
            audit = Audit(
                schedule_id=spider.schedule_id,
                muni=spider.name,
                # Link straight to the PDF so the report opens from the UI.
                audit_url=file["url"],
            )
            # The stored download path is a content hash, so the readable name
            # comes from the title chain rather than the filename on disk.
            audit.title = processed["title"]
            audit.summary = processed["summary"]
            # `None` when the classifier returned no usable level, which the
            # column allows and the UI renders as "Not rated".
            audit.risk_level = processed["risk_level"]
            audit.run_status = "COMPLETED"
            # The report's own publication date, not the crawl time. When the
            # PDF states no date, fall back to now so the NOT NULL column is
            # still populated.
            audit.audit_date = processed["publish_date"] or _utcnow()
            with connect_db() as conn, conn.cursor() as cur:
                cur.execute("SELECT tag_id, name FROM tags")
                tags = {row["name"]: row["tag_id"] for row in cur.fetchall()}
                audit.tags = list(
                    dict.fromkeys(tags[tag["tag"]] for tag in processed["tags"])
                )
                try:
                    cur.execute(
                        """INSERT INTO audit_headers
                        (audit_id, schedule_id, title, muni, audit_url, audit_date,
                         risk_level, run_status, summary, created_at)
                        VALUES (%(audit_id)s, %(schedule_id)s, %(title)s, %(muni)s,
                         %(audit_url)s, %(audit_date)s, %(risk_level)s,
                         %(run_status)s, %(summary)s, UTC_TIMESTAMP())
                        """,
                        audit.insert_audit_dict(),
                    )
                    if audit.tags:
                        cur.executemany(
                            "INSERT INTO audit_tags (audit_id, tag_id) VALUES (%(audit_id)s, %(tag_id)s)",
                            audit.insert_tags_dict_list(),
                        )
                    # Mark the receipt processed in the same transaction as the
                    # report, so the two can never disagree.
                    cur.execute(
                        """INSERT INTO fetches (spider_id, fetch_url, status)
                        VALUES (%s, %s, 'PROCESSED')
                        ON DUPLICATE KEY UPDATE status='PROCESSED'""",
                        (spider.name, file["url"]),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
            processed_count += 1
            # Progress is best-effort: a failed counter must not fail the scan.
            record_processed(getattr(spider, "schedule_id", 0), processed_count)
        return item
