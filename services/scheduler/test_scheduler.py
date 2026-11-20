"""Tests for scheduler behavior."""

import unittest
from datetime import datetime, timedelta, timezone

from services.scheduler.scheduler import Schedule, trigger_due_scans


class SchedulerTests(unittest.TestCase):
    
    def test_trigger_saves_before_updating_schedule(self):
        now = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
        original_time = now - timedelta(minutes=5)
        schedule = Schedule(
            1, "https://example.com/a", "DAILY", original_time
        )
        next_run = original_time + timedelta(days=1)
        events = []

        def fake_scan(schedule):
            events.append("trigger")

        def fake_save(schedule_id, run_time):
            self.assertEqual(schedule_id, 1)
            self.assertEqual(run_time, next_run)
            self.assertEqual(schedule.next_run_at, original_time)
            events.append("save")

        trigger_due_scans([schedule], now, fake_scan, fake_save)

        self.assertEqual(events, ["trigger", "save"])
        self.assertEqual(schedule.next_run_at, next_run)
    def test_failed_trigger_does_not_block_other_schedules(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        original_time = now - timedelta(minutes=5)

        schedules = [
            Schedule(1, "https://example.com/a", "DAILY", original_time),
            Schedule(2, "https://example.com/b", "DAILY", original_time),
        ]
        attempted_ids = []

        def fake_scan(schedule):
            attempted_ids.append(schedule.schedule_id)
            if schedule.schedule_id == 1:
                raise RuntimeError("Intentional test failure")

        with self.assertLogs(
            "services.scheduler.scheduler", level="ERROR"
        ) as logs:
            trigger_due_scans(schedules, now, fake_scan)

        self.assertEqual(attempted_ids, [1, 2])
        self.assertEqual(schedules[0].next_run_at, original_time)
        self.assertEqual(
            schedules[1].next_run_at,
            original_time + timedelta(days=1),
        )
        self.assertTrue(
            any("Failed to process schedule 1" in message
                for message in logs.output)
        )
    def test_successful_trigger_advances_and_does_not_repeat(self):
        now = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
        original_time = now - timedelta(minutes=5)
        schedule = Schedule(
            1, "https://example.com/a", "DAILY", original_time
        )
        triggered_ids = []

        def fake_scan(schedule):
            triggered_ids.append(schedule.schedule_id)

        trigger_due_scans([schedule], now, fake_scan)

        self.assertEqual(triggered_ids, [1])
        self.assertEqual(
            schedule.next_run_at,
            original_time + timedelta(days=1),
        )

        trigger_due_scans([schedule], now, fake_scan)

        self.assertEqual(triggered_ids, [1])

    