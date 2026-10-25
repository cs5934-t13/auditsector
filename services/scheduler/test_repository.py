"""Tests for converting database rows into schedules."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from services.scheduler.repository import load_schedules


class RepositoryTests(unittest.TestCase):
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