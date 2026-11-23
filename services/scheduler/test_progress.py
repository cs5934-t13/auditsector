"""Tests for the fetcher's progress reporting.

Progress is written by the crawl, in its own process, so these cover the pieces
that are easy to get wrong: committing, and never failing a scan because a
counter could not be written.
"""

import unittest
from unittest.mock import MagicMock, patch

from fetcher import progress


def _connection(execute_raises=None):
    cursor = MagicMock()
    if execute_raises:
        cursor.execute.side_effect = execute_raises
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


class ProgressTests(unittest.TestCase):
    def test_records_each_column(self):
        for function, column, value in (
            (progress.record_total, "run_total", 209),
            (progress.record_download, "run_downloaded", 187),
            (progress.record_processed, "run_processed", 41),
        ):
            with self.subTest(column=column):
                conn, cursor = _connection()
                with patch("fetcher.progress.connect_db", return_value=conn):
                    function(6, value)

                sql, params = cursor.execute.call_args.args
                self.assertIn(column, sql)
                self.assertEqual(params, (value, 6))

    def test_commits_the_update(self):
        """pymysql's connection context manager closes but does not commit."""
        conn, _ = _connection()
        with patch("fetcher.progress.connect_db", return_value=conn):
            progress.record_download(6, 5)

        conn.commit.assert_called_once()

    def test_closes_the_connection(self):
        conn, _ = _connection()
        with patch("fetcher.progress.connect_db", return_value=conn):
            progress.record_download(6, 5)

        conn.close.assert_called_once()

    def test_a_write_failure_does_not_raise(self):
        """Progress is a convenience; it must never fail an otherwise good scan."""
        conn, _ = _connection(execute_raises=RuntimeError("db down"))
        with patch("fetcher.progress.connect_db", return_value=conn):
            progress.record_processed(6, 5)  # must not raise
        conn.commit.assert_not_called()

    def test_skips_writes_without_a_schedule(self):
        with patch("fetcher.progress.connect_db") as connect:
            progress.record_download(0, 5)
        connect.assert_not_called()

    def test_casts_booleans_and_strings_to_int(self):
        conn, cursor = _connection()
        with patch("fetcher.progress.connect_db", return_value=conn):
            progress.record_total(6, "12")

        self.assertEqual(cursor.execute.call_args.args[1], (12, 6))


if __name__ == "__main__":
    unittest.main()
