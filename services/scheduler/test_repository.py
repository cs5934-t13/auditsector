"""Tests for converting database rows into schedules."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from services.scheduler.repository import load_schedules, save_next_run, save_run

class RepositoryTests(unittest.TestCase):

    def test_save_run_records_a_successful_run(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
        next_run = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)

        save_run(connection, 7, started, "SUCCESS", next_run)

        sql, parameters = cursor.execute.call_args.args
        # A normal run must not touch scan_status: COALESCE keeps the column.
        self.assertIn("COALESCE(%(scan_status)s, scan_status)", " ".join(sql.split()))
        self.assertEqual(
            parameters,
            {
                "started_at": datetime(2026, 10, 25, 12, 0),
                "last_status": "SUCCESS",
                "scan_status": None,
                # A success clears all three failure fields.
                "last_error": None,
                "error_code": None,
                "last_error_detail": None,
                "next_run_at": datetime(2026, 10, 26, 12, 0),
                "schedule_id": 7,
            },
        )
        connection.commit.assert_called_once()

    def test_save_run_stores_the_failure_reason(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(
            connection, 7, started, "ERROR", started,
            failure={
                "error_code": "SOURCE_UNREADABLE",
                "error": "We couldn't read reports from this source.",
                "error_detail": "No report links found; check the collection page selector",
            },
        )

        parameters = cursor.execute.call_args.args[1]
        # A person-readable sentence, a switchable code, and the raw detail kept
        # separately for administrators.
        self.assertEqual(parameters["error_code"], "SOURCE_UNREADABLE")
        self.assertEqual(
            parameters["last_error"], "We couldn't read reports from this source."
        )
        self.assertEqual(
            parameters["last_error_detail"],
            "No report links found; check the collection page selector",
        )

    def test_save_run_truncates_technical_detail_separately(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(
            connection, 7, started, "ERROR", started,
            failure={"error": "Short.", "error_detail": "y" * 9000},
        )

        parameters = cursor.execute.call_args.args[1]
        self.assertEqual(len(parameters["last_error"]), len("Short."))
        self.assertEqual(len(parameters["last_error_detail"]), 2000)

    def test_save_run_clears_the_reason_on_success(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(connection, 7, started, "SUCCESS", started)

        parameters = cursor.execute.call_args.args[1]
        self.assertIsNone(parameters["last_error"])
        self.assertIsNone(parameters["error_code"])
        self.assertIsNone(parameters["last_error_detail"])

    def test_save_run_truncates_a_very_long_message(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(connection, 7, started, "ERROR", started,
                 failure={"error": "x" * 5000})

        parameters = cursor.execute.call_args.args[1]
        # The friendly message is short enough for a table cell.
        self.assertEqual(len(parameters["last_error"]), 300)

    def test_save_run_parks_an_unsupported_source(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
        parked_until = datetime(2027, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(connection, 7, started, "UNSUPPORTED", parked_until)

        parameters = cursor.execute.call_args.args[1]
        # UNSUPPORTED is not a run outcome, so last_run_status records ERROR
        # while scan_status carries the parked state.
        self.assertEqual(parameters["last_status"], "ERROR")
        self.assertEqual(parameters["scan_status"], "UNSUPPORTED")
        connection.commit.assert_called_once()

    def test_every_placeholder_has_a_value(self):
        """Guards the bug that crashed the worker in production.

        A positional tuple once wrote the friendly message into the ENUM column
        `last_error_code`, which strict mode rejected at runtime. Binding by name
        makes a missing or misnamed placeholder fail here instead.
        """
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        save_run(
            connection, 7, started, "ERROR", started,
            failure={"error_code": "SCAN_FAILED", "error": "Boom.", "error_detail": "Detail."},
        )

        sql, parameters = cursor.execute.call_args.args
        import re
        used = set(re.findall(r"%\((\w+)\)s", sql))
        self.assertTrue(used)
        self.assertEqual(used, set(parameters))
        # The ENUM column must receive a code, never a sentence.
        self.assertEqual(parameters["error_code"], "SCAN_FAILED")
        self.assertNotIn(" ", parameters["error_code"])

    def test_save_run_rolls_back_on_database_error(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect = RuntimeError("Database unavailable")
        started = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)

        with self.assertRaisesRegex(RuntimeError, "Database unavailable"):
            save_run(connection, 7, started, "SUCCESS", started)

        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    def test_save_run_rejects_a_naive_time(self):
        connection = MagicMock()

        with self.assertRaisesRegex(ValueError, "timezone"):
            save_run(
                connection,
                7,
                datetime(2026, 10, 25, 12, 0),
                "SUCCESS",
                datetime(2026, 10, 26, 12, 0),
            )

    def test_save_rolls_back_on_database_error(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect = RuntimeError("Database unavailable")

        next_run = datetime(
            2026, 10, 26, 12, 0, tzinfo=timezone.utc
        )

        with self.assertRaisesRegex(
            RuntimeError, "Database unavailable"
        ):
            save_next_run(connection, 1, next_run)

        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    def test_save_converts_to_utc_and_commits(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value

        local_time = datetime(
            2026, 10, 25, 15, 0,
            tzinfo=timezone(timedelta(hours=3)),
        )

        save_next_run(connection, 1, local_time)

        parameters = cursor.execute.call_args.args[1]
        self.assertEqual(
            parameters,
            (datetime(2026, 10, 25, 12, 0), 1),
        )
        connection.commit.assert_called_once()
        connection.rollback.assert_not_called()

    def test_loads_utc_time_and_preserves_missing_time(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value

        cursor.fetchall.return_value = [
            {
                "schedule_id": 1,
                "source_link": "https://example.com/a",
                "scan_frequency": "DAILY",
                "next_run_at": datetime(2026, 10, 25, 10, 0),
            },
            {
                "schedule_id": 2,
                "source_link": "https://example.com/b",
                "scan_frequency": "WEEKLY",
                "next_run_at": None,
            },
        ]

        schedules = load_schedules(connection)

        self.assertEqual(len(schedules), 2)
        self.assertEqual(schedules[0].schedule_id, 1)
        self.assertEqual(
            schedules[0].next_run_at,
            datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc),
        )
        self.assertIsNone(schedules[1].next_run_at)