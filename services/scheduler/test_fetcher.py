"""Tests for turning a crawler's exit into an explainable failure.

`scan()` used to raise a bare `CalledProcessError`, whose message named the
interpreter path and argv. These tests pin the replacement: a code the UI can
translate, and the crawler's own reason when it reported one.
"""

import subprocess
import unittest
from unittest.mock import patch

from services.scheduler.fetcher import (
    CODE_FAILED,
    CODE_TIMEOUT,
    CODE_UNREADABLE,
    CODE_UNSUPPORTED,
    ScanFailure,
    UnsupportedSource,
    _failure_reason,
    scan,
    spider_for_url,
)
from services.scheduler.scheduler import Schedule


def _schedule(source="https://www.seattle.gov/city-auditor/reports"):
    return Schedule(1, source, "WEEKLY", None)


class SpiderLookupTests(unittest.TestCase):
    def test_supported_url_resolves(self):
        self.assertEqual(
            spider_for_url("https://www.seattle.gov/city-auditor/reports"),
            "seattle_wa",
        )

    def test_unsupported_url_is_terminal(self):
        with self.assertRaises(UnsupportedSource) as caught:
            spider_for_url("https://example.gov/nope")
        self.assertEqual(caught.exception.code, CODE_UNSUPPORTED)
        self.assertFalse(caught.exception.retryable)

    def test_unparseable_url_has_its_own_message(self):
        with self.assertRaises(UnsupportedSource) as caught:
            spider_for_url(None)
        # A person reads this; it must not mention Python's parser.
        self.assertIn("could not be read as a URL", caught.exception.message)


class FailureReasonTests(unittest.TestCase):
    def test_extracts_the_structured_line(self):
        stderr = (
            "2026-11-23 [scrapy] INFO: Spider closed\n"
            "SCAN_FAILURE: No report links found; check the collection page selector\n"
        )
        self.assertEqual(
            _failure_reason(stderr),
            "No report links found; check the collection page selector",
        )

    def test_uses_the_last_structured_line(self):
        stderr = "SCAN_FAILURE: first\nSCAN_FAILURE: second\n"
        self.assertEqual(_failure_reason(stderr), "second")

    def test_returns_none_without_the_marker(self):
        self.assertIsNone(_failure_reason("just some log noise"))
        self.assertIsNone(_failure_reason(""))
        self.assertIsNone(_failure_reason(None))

    def test_ignores_an_empty_reason(self):
        self.assertIsNone(_failure_reason("SCAN_FAILURE:   \n"))


class ScanTests(unittest.TestCase):
    def test_success_returns_quietly(self):
        completed = subprocess.CompletedProcess([], 0, "", "")
        with patch("subprocess.run", return_value=completed):
            scan(_schedule())

    def test_reports_the_crawlers_own_reason(self):
        completed = subprocess.CompletedProcess(
            [], 1, "", "SCAN_FAILURE: No report links found\n"
        )
        with patch("subprocess.run", return_value=completed):
            with self.assertRaises(ScanFailure) as caught:
                scan(_schedule())

        self.assertEqual(caught.exception.code, CODE_UNREADABLE)
        self.assertEqual(caught.exception.message, "No report links found")
        self.assertTrue(caught.exception.retryable)

    def test_falls_back_to_a_readable_generic_message(self):
        completed = subprocess.CompletedProcess([], 1, "", "no marker here")
        with patch("subprocess.run", return_value=completed):
            with self.assertRaises(ScanFailure) as caught:
                scan(_schedule())

        self.assertEqual(caught.exception.code, CODE_FAILED)
        # Mentions the outcome, never the subprocess.
        self.assertNotIn("returned non-zero", caught.exception.message)
        self.assertNotIn("fetcher.crawl", caught.exception.message)

    def test_timeout_is_its_own_code(self):
        with patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="fetcher.crawl", timeout=900),
        ):
            with self.assertRaises(ScanFailure) as caught:
                scan(_schedule())

        self.assertEqual(caught.exception.code, CODE_TIMEOUT)
        self.assertTrue(caught.exception.retryable)

    def test_unsupported_source_never_runs_a_subprocess(self):
        with patch("subprocess.run") as run:
            with self.assertRaises(UnsupportedSource):
                scan(_schedule("https://example.gov/nope"))
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
