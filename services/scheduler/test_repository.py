"""Tests for converting database rows into schedules."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from services.scheduler.repository import load_schedules, save_next_run

class RepositoryTests(unittest.TestCase):
    
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