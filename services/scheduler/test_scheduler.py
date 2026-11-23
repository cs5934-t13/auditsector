"""Tests for scheduler behavior."""

import unittest
from datetime import datetime, timedelta, timezone

from services.scheduler.scheduler import (
    STATUS_ACTIVE,
    STATUS_UNSUPPORTED,
    Schedule,
    get_due_schedules,
    trigger_due_scans,
)


class UnsupportedSourceTests(unittest.TestCase):
    """An unsupported URL must be parked, not retried every five minutes."""

    def setUp(self):
        self.now = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
        self.started = self.now - timedelta(minutes=5)
        self.saved = []

    def _schedule(self, schedule_id=1, status=STATUS_ACTIVE):
        return Schedule(
            schedule_id,
            "https://example.gov/reports",
            "WEEKLY",
            self.started,
            scan_status=status,
        )

    def _trigger(self, error):
        def fake_scan(_schedule):
            raise error

        return fake_scan

    def _save(self, schedule_id, started_at, status, next_run_at, failure=None):
        self.saved.append((schedule_id, status, next_run_at, failure or {}))

    def test_unsupported_source_is_parked_not_retried(self):
        schedule = self._schedule()

        failures = trigger_due_scans(
            [schedule],
            self.now,
            self._trigger(ValueError("No spider supports this collection URL yet")),
            save_result=self._save,
            clock=lambda: self.now,
            is_unsupported=lambda error: "No spider supports" in str(error),
        )

        self.assertEqual(failures, 1)
        self.assertEqual(schedule.scan_status, STATUS_UNSUPPORTED)
        self.assertEqual(self.saved[0][1], STATUS_UNSUPPORTED)
        # The reason is handed on with a code, so the UI can phrase it itself.
        self.assertEqual(self.saved[0][3]["error_code"], "SCAN_FAILED")

        # The decisive assertion: the same schedule is not due on the next pass,
        # unlike a transient failure which is retried in five minutes.
        self.assertEqual(get_due_schedules([schedule], self.now), [])

    def test_marks_the_run_started_before_crawling(self):
        """The UI needs a "scanning" signal before the first report lands."""
        schedule = self._schedule()
        begun = []

        def fake_begin(schedule_id, started_at):
            begun.append((schedule_id, started_at))

        trigger_due_scans(
            [schedule],
            self.now,
            lambda _s: None,
            save_result=self._save,
            clock=lambda: self.now,
            begin_run=fake_begin,
        )

        self.assertEqual(begun, [(1, self.now)])

    def test_begin_run_is_not_called_for_a_schedule_that_is_not_due(self):
        schedule = Schedule(
            1, "https://example.gov/a", "WEEKLY",
            self.now + timedelta(days=1),
        )
        begun = []

        trigger_due_scans(
            [schedule],
            self.now,
            lambda _s: None,
            clock=lambda: self.now,
            begin_run=lambda sid, started: begun.append(sid),
        )

        self.assertEqual(begun, [])

    def test_transient_failure_still_retries(self):
        schedule = self._schedule()

        trigger_due_scans(
            [schedule],
            self.now,
            self._trigger(RuntimeError("crawl crashed")),
            save_result=self._save,
            clock=lambda: self.now,
            is_unsupported=lambda error: False,
        )

        self.assertEqual(schedule.scan_status, STATUS_ACTIVE)
        self.assertEqual(self.saved[0][1], "ERROR")
        self.assertEqual(self.saved[0][2], self.now + timedelta(minutes=5))
        # A plain exception gets the generic code and its text as the detail.
        self.assertEqual(self.saved[0][3]["error_code"], "SCAN_FAILED")
        self.assertIn("crawl crashed", self.saved[0][3]["error_detail"])
        self.assertNotIn("crawl crashed", self.saved[0][3]["error"])
        # Still active, so it comes back once the retry time arrives. That is
        # the intended difference from a parked schedule, which never returns.
        self.assertEqual(get_due_schedules([schedule], self.now), [])
        self.assertEqual(
            len(get_due_schedules([schedule], self.now + timedelta(minutes=5))),
            1,
        )

    def test_parked_schedule_is_not_due_even_with_a_past_next_run(self):
        schedule = Schedule(
            1,
            "https://example.gov/reports",
            "DAILY",
            self.now - timedelta(days=30),
            scan_status=STATUS_UNSUPPORTED,
        )
        self.assertEqual(get_due_schedules([schedule], self.now), [])

    def test_parking_does_not_touch_other_schedules(self):
        unsupported = self._schedule(1)
        healthy = self._schedule(2)

        def fake_scan(schedule):
            if schedule.schedule_id == 1:
                raise ValueError("No spider supports this collection URL yet")

        with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
            trigger_due_scans(
                [unsupported, healthy],
                self.now,
                fake_scan,
                save_result=self._save,
                clock=lambda: self.now,
                is_unsupported=lambda error: "No spider supports" in str(error),
            )

        self.assertEqual(unsupported.scan_status, STATUS_UNSUPPORTED)
        self.assertEqual(healthy.scan_status, STATUS_ACTIVE)
        self.assertGreater(healthy.next_run_at, self.now)


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

    