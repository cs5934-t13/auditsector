"""Boundaries missed by the original timing-only tests."""

import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, Mock, patch
from services.scheduler.scheduler import Schedule, calculate_next_run, trigger_due_scans
from services.scheduler.fetcher import scan, spider_for_url
from services.scheduler.runner import run_once
from services.scheduler.repository import save_run

UTC = timezone.utc
NOW = datetime(2026, 1, 31, 12, tzinfo=UTC)


class IntegrationLogicTests(unittest.TestCase):
    def test_monthly_clamps_leap_year_and_month_end(self):
        self.assertEqual(
            calculate_next_run(NOW, NOW, "MONTHLY"),
            datetime(2026, 2, 28, 12, tzinfo=UTC),
        )
        leap = NOW.replace(year=2028)
        self.assertEqual(
            calculate_next_run(leap, leap, "MONTHLY"),
            datetime(2028, 2, 29, 12, tzinfo=UTC),
        )
        self.assertEqual(
            calculate_next_run(NOW, NOW.replace(month=3), "MONTHLY"),
            datetime(2026, 4, 30, 12, tzinfo=UTC),
        )

    def test_fixed_frequencies_skip_missed_slots(self):
        for frequency, delta in [
            ("HOURLY", timedelta(hours=1)),
            ("DAILY", timedelta(days=1)),
            ("WEEKLY", timedelta(weeks=1)),
        ]:
            with self.subTest(frequency=frequency):
                self.assertEqual(
                    calculate_next_run(NOW, NOW + 3 * delta, frequency), NOW + 4 * delta
                )

    def test_first_scan_runs_but_archived_and_future_sources_do_not(self):
        callback = Mock()
        save = Mock()
        schedules = [
            Schedule(1, "url", "WEEKLY", None),
            Schedule(2, "url", "ARCHIVE", None),
            Schedule(3, "url", "DAILY", NOW + timedelta(hours=1)),
        ]
        trigger_due_scans(schedules, NOW, callback, save_result=save)
        callback.assert_called_once_with(schedules[0])
        save.assert_called_once_with(1, NOW, "SUCCESS", NOW + timedelta(weeks=1))

    def test_failure_records_error_retry_and_other_source_still_runs(self):
        callback = Mock(side_effect=[RuntimeError("controlled failure"), None])
        save = Mock()
        schedules = [Schedule(1, "a", "DAILY", NOW), Schedule(2, "b", "WEEKLY", NOW)]
        with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
            trigger_due_scans(schedules, NOW, callback, save_result=save)
        self.assertEqual(callback.call_count, 2)
        self.assertEqual(
            save.call_args_list[0].args, (1, NOW, "ERROR", NOW + timedelta(minutes=5))
        )
        self.assertEqual(
            save.call_args_list[1].args, (2, NOW, "SUCCESS", NOW + timedelta(weeks=1))
        )

    def test_persistence_failure_is_not_reported_as_success_or_swallowed(self):
        with self.assertRaisesRegex(RuntimeError, "database"):
            trigger_due_scans(
                [Schedule(1, "a", "DAILY", NOW)],
                NOW,
                Mock(),
                save_result=Mock(side_effect=RuntimeError("database")),
            )

    def test_only_supported_collections_are_routed(self):
        self.assertEqual(
            spider_for_url("https://www.seattle.gov/city-auditor/reports"), "seattle_wa"
        )
        self.assertEqual(
            spider_for_url("https://efiles.portlandoregon.gov/record?q=example"),
            "portland_or",
        )
        for url in [
            "https://example.com",
            "file:///etc/passwd",
            "https://seattle.gov.evil.test/city-auditor/reports",
            "https://user:secret@seattle.gov/city-auditor/reports",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                spider_for_url(url)

    def test_adapter_passes_source_and_schedule_without_shell_and_propagates_failure(
        self,
    ):
        schedule = Schedule(
            42, "https://www.seattle.gov/city-auditor/reports", "DAILY", NOW
        )
        with patch("services.scheduler.fetcher.subprocess.run") as run:
            scan(schedule)
            command = run.call_args.args[0]
            self.assertEqual(
                command[-4:], ["--source", schedule.source_link, "--schedule-id", "42"]
            )
            self.assertTrue(run.call_args.kwargs["check"])
            self.assertNotIn("shell", run.call_args.kwargs)
        with patch(
            "services.scheduler.fetcher.subprocess.run",
            side_effect=subprocess.CalledProcessError(1, ["crawl"]),
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                scan(schedule)

    def test_competing_worker_does_not_start_any_scans(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = {"acquired": 0}
        with patch("services.scheduler.runner.load_schedules") as load:
            callback = Mock()
            run_once(conn, NOW, callback)
            load.assert_not_called()
            callback.assert_not_called()

    def test_outcome_converts_times_and_rolls_back_on_write_failure(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        save_run(conn, 4, NOW, "SUCCESS", NOW + timedelta(days=1))
        self.assertEqual(
            cur.execute.call_args.args[1],
            (
                NOW.replace(tzinfo=None),
                "SUCCESS",
                (NOW + timedelta(days=1)).replace(tzinfo=None),
                4,
            ),
        )
        conn.commit.assert_called_once()
        cur.execute.side_effect = RuntimeError("write failed")
        with self.assertRaises(RuntimeError):
            save_run(conn, 4, NOW, "ERROR", NOW)
        conn.rollback.assert_called_once()

    def test_long_crawls_use_completion_time_for_next_slot_and_retry(self):
        later = NOW + timedelta(hours=2)
        save = Mock()
        trigger_due_scans(
            [Schedule(1, "a", "HOURLY", NOW)],
            NOW,
            Mock(),
            save_result=save,
            clock=Mock(side_effect=[NOW, later]),
        )
        save.assert_called_once_with(1, NOW, "SUCCESS", NOW + timedelta(hours=3))
        save = Mock()
        with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
            failures = trigger_due_scans(
                [Schedule(1, "a", "HOURLY", NOW)],
                NOW,
                Mock(side_effect=RuntimeError("failure")),
                save_result=save,
                clock=Mock(side_effect=[NOW, later]),
            )
        self.assertEqual(failures, 1)
        save.assert_called_once_with(1, NOW, "ERROR", later + timedelta(minutes=5))
