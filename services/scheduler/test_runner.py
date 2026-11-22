"""Tests for the scheduler polling loop."""

import unittest
from unittest.mock import Mock, patch

import pymysql

from services.scheduler.runner import run_forever


class RunnerTests(unittest.TestCase):
    def test_database_error_closes_connection_and_retries(self):
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
                # 2013 = lost connection; only database errors are retried.
                side_effect=[pymysql.err.OperationalError(2013, "Lost connection"), None],
            ) as process,
            patch(
                "services.scheduler.runner.time.sleep",
                side_effect=[None, None, KeyboardInterrupt],
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
        # Two five-second retry waits, then the normal poll interval.
        self.assertEqual([call.args[0] for call in wait.call_args_list], [5, 5, 60])

    def test_unexpected_error_closes_connection_and_propagates(self):
        connection = Mock()
        fake_scan = Mock()

        with (
            patch(
                "services.scheduler.runner.connect_db",
                side_effect=[connection],
            ) as connect,
            patch(
                "services.scheduler.runner.run_once",
                side_effect=RuntimeError("Unexpected bug"),
            ),
            patch(
                "services.scheduler.runner.time.sleep",
                side_effect=[None],
            ),
        ):
            # A real bug must stop the worker so the pod restarts it, rather than
            # being swallowed and leaving the scheduler silently idle.
            with self.assertRaises(RuntimeError):
                run_forever(fake_scan, poll_seconds=60)

        self.assertEqual(connect.call_count, 1)
        connection.close.assert_called_once()
        