"""Tests for the scheduler polling loop."""

import unittest
from unittest.mock import Mock, patch

from services.scheduler.runner import run_forever


class RunnerTests(unittest.TestCase):
    def test_failed_pass_closes_connection_and_retries(self):
        first_connection = Mock()
        second_connection = Mock()
        fake_scan = Mock()

        with (
            patch(
                "services.scheduler.runner.connect_db",
                side_effect=[first_connection, second_connection],
            ) as connect,
            patch(
                "services.scheduler.runner.run_once",
                side_effect=[RuntimeError("Test failure"), None],
            ) as process,
            patch(
                "services.scheduler.runner.time.sleep",
                side_effect=[None, KeyboardInterrupt],
            ) as wait,
            self.assertLogs(
                "services.scheduler.runner", level="ERROR"
            ),
        ):
            run_forever(fake_scan, poll_seconds=60)

        self.assertEqual(connect.call_count, 2)
        self.assertEqual(process.call_count, 2)
        first_connection.close.assert_called_once()
        second_connection.close.assert_called_once()
        self.assertEqual(wait.call_count, 2)
        wait.assert_called_with(60)
        