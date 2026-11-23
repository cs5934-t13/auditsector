"""Tests for the download batch pipeline.

`SummarizeTagPipeline` used to raise when any download in a batch failed, which
discarded every successful download in that batch. These tests pin the
replacement: process what arrived, report what did not, and let the resume logic
re-queue the rest.
"""

import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fetcher.pipelines import SummarizeTagPipeline


def _spider(name="test_spider", schedule_id=7):
    return SimpleNamespace(name=name, schedule_id=schedule_id)


def _pipeline(store="/tmp/files"):
    pipeline = SummarizeTagPipeline()
    pipeline.crawler = SimpleNamespace(settings={"FILES_STORE": store})
    return pipeline


def _file(url, path="full/abc.pdf"):
    return {"url": url, "path": path}


def _connection(existing_status=None, tag_rows=None):
    """A connection answering the receipt lookup, tag lookup, and inserts.

    A single cursor is shared by every `connect_db()` call the pipeline makes,
    so `last_executed` can be inspected afterwards. `fetchone` is dispatched on
    the statement rather than a fixed side-effect list, because the pipeline
    opens a new connection per file and the order is not guaranteed.
    """
    cursor = MagicMock()
    executed = []

    def execute(sql, params=None):
        executed.append((" ".join(str(sql).split()), params))

    def fetchone():
        last = executed[-1][0] if executed else ""
        if last.startswith("SELECT status FROM fetches"):
            return {"status": existing_status} if existing_status else None
        if "SELECT tag_id, name FROM tags" in last:
            return {"total_tags": 0}
        return None

    cursor.execute.side_effect = execute
    cursor.executemany.side_effect = execute
    cursor.fetchone.side_effect = fetchone
    cursor.fetchall.return_value = tag_rows or []
    cursor.executed = executed

    cursor.__enter__.return_value = cursor

    conn = MagicMock()
    # Every `connect_db()` in the pipeline returns this same connection, whose
    # cursor is the recording one, so all statements land in `executed`.
    conn.__enter__.return_value = conn
    conn.cursor.return_value = cursor
    return conn, cursor


def _processed(risk_level="LOW"):
    """What `process_audit` returns for one PDF."""
    return {
        "file_name": "abc.pdf",
        "title": "A Report",
        "publish_date": datetime(2026, 1, 1).date(),
        "page_count": 3,
        "summary": "Summary.",
        "risk_level": risk_level,
        "tags": [],
    }


class PartialDownloadTests(unittest.TestCase):
    """One failed download must not cost the rest of the batch."""

    def test_processes_the_successful_downloads(self):
        item = {
            "file_urls": ["https://x.test/a.pdf", "https://x.test/b.pdf"],
            # FilesPipeline removed the failed one before this ran.
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, cursor = _connection()
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit", return_value=_processed()), \
                patch("fetcher.pipelines.record_processed"):
            result = pipeline.process_item(item, _spider())

        # The item survives rather than raising, and the good report is inserted.
        self.assertIs(result, item)
        inserts = [sql for sql, _ in cursor.executed if "INSERT INTO audit_headers" in sql]
        self.assertEqual(len(inserts), 1)

    def test_logs_the_shortfall_and_the_failed_urls(self):
        item = {
            "file_urls": [
                "https://x.test/a.pdf",
                "https://x.test/bad.pdf",
                "https://x.test/also-bad.pdf",
            ],
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, _ = _connection()
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit", return_value=_processed()), \
                patch("fetcher.pipelines.record_processed"), \
                self.assertLogs("fetcher.pipelines", level="WARNING") as logs:
            pipeline.process_item(item, _spider())

        message = "\n".join(logs.output)
        self.assertIn("2 of 3 downloads failed", message)
        self.assertIn("processing the 1 that succeeded", message)
        # The failed URLs are named, so the cause is diagnosable.
        self.assertIn("bad.pdf", message)

    def test_caps_the_number_of_urls_logged(self):
        urls = [f"https://x.test/{index}.pdf" for index in range(20)]
        item = {"file_urls": urls, "files": []}
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=MagicMock()), \
                self.assertLogs("fetcher.pipelines", level="WARNING") as logs:
            pipeline.process_item(item, _spider())

        message = "\n".join(logs.output)
        self.assertIn("20 of 20 downloads failed", message)
        self.assertIn("...", message)
        # Only the cap's worth of URLs are listed.
        self.assertLessEqual(message.count(".pdf"), 6)

    def test_an_empty_batch_is_not_an_error(self):
        """Nothing downloaded is a warning, not a crash."""
        item = {"file_urls": ["https://x.test/a.pdf"], "files": []}
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=MagicMock()), \
                self.assertLogs("fetcher.pipelines", level="WARNING") as logs:
            result = pipeline.process_item(item, _spider())

        self.assertIs(result, item)
        self.assertTrue(any("nothing to process" in line for line in logs.output))

    def test_a_complete_batch_logs_nothing(self):
        item = {
            "file_urls": ["https://x.test/a.pdf"],
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, _ = _connection()
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit", return_value=_processed()), \
                patch("fetcher.pipelines.record_processed"), \
                patch("fetcher.pipelines.logger") as logger:
            pipeline.process_item(item, _spider())

        logger.warning.assert_not_called()


class ResumeTests(unittest.TestCase):
    """The resume logic must re-queue exactly what did not finish."""

    def test_skips_a_report_already_processed(self):
        item = {
            "file_urls": ["https://x.test/a.pdf"],
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, cursor = _connection(existing_status="PROCESSED")
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit") as process, \
                patch("fetcher.pipelines.record_processed"):
            pipeline.process_item(item, _spider())

        # No AI work is repeated for a finished report.
        process.assert_not_called()

    def test_reprocesses_a_report_left_at_downloaded(self):
        """A DOWNLOADED receipt means the report never reached the database."""
        item = {
            "file_urls": ["https://x.test/a.pdf"],
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, _ = _connection(existing_status="DOWNLOADED")
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit", return_value=_processed()) as process, \
                patch("fetcher.pipelines.record_processed"):
            pipeline.process_item(item, _spider())

        process.assert_called_once()

    def test_the_receipt_is_marked_processed_with_the_report(self):
        item = {
            "file_urls": ["https://x.test/a.pdf"],
            "files": [_file("https://x.test/a.pdf")],
        }
        conn, cursor = _connection()
        pipeline = _pipeline()

        with patch("fetcher.pipelines.connect_db", return_value=conn), \
                patch("fetcher.pipelines.process_audit", return_value=_processed()), \
                patch("fetcher.pipelines.record_processed"):
            pipeline.process_item(item, _spider())

        receipt_calls = [
            sql for sql, _ in cursor.executed
            if "INSERT INTO fetches" in sql and "PROCESSED" in sql
        ]
        self.assertEqual(len(receipt_calls), 1)


if __name__ == "__main__":
    unittest.main()
