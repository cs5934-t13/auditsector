"""Tests for deriving a report's publication date.

All parsing is pure text processing, so these tests need no PDF or network.
"""

import unittest
from datetime import date

from fetcher.ai.publish_date import (
    derive_publish_date,
    publish_date_from_metadata,
    publish_date_from_page_text,
)


class PageTextDateTests(unittest.TestCase):
    def test_month_day_year(self):
        self.assertEqual(
            publish_date_from_page_text("Report\nSeptember 14, 2020\n"),
            date(2020, 9, 14),
        )

    def test_abbreviated_and_ordinal_months(self):
        for text in (
            "Apr 16, 2020",
            "April 16th, 2020",
            "April 16th 2020",
        ):
            with self.subTest(text=text):
                self.assertEqual(publish_date_from_page_text(text), date(2020, 4, 16))

    def test_day_month_year(self):
        self.assertEqual(
            publish_date_from_page_text("16 April 2020\n"),
            date(2020, 4, 16),
        )

    def test_iso_date(self):
        self.assertEqual(
            publish_date_from_page_text("2020-04-16\n"),
            date(2020, 4, 16),
        )

    def test_month_and_year_only(self):
        for text in ("MARCH 2023", "March 2023", "December\n2022"):
            with self.subTest(text=text):
                self.assertEqual(
                    publish_date_from_page_text(text),
                    date(2023, 3, 1) if "2023" in text else date(2022, 12, 1),
                )

    def test_date_sharing_a_line_with_a_title(self):
        self.assertEqual(
            publish_date_from_page_text("April 1, 2025 2024 Annual Report\n"),
            date(2025, 4, 1),
        )

    def test_wrapped_date_across_lines(self):
        self.assertEqual(
            publish_date_from_page_text("December\n2022\nSeattle\n"),
            date(2022, 12, 1),
        )

    def test_prefers_earliest_date_on_page(self):
        text = (
            "Seattle City Auditor\n"
            "April 16, 2020\n"
            "This report follows up on the October 2, 2018 audit.\n"
        )
        self.assertEqual(publish_date_from_page_text(text), date(2020, 4, 16))

    def test_no_date_returns_none(self):
        self.assertIsNone(publish_date_from_page_text("No date here at all"))
        self.assertIsNone(publish_date_from_page_text(""))
        self.assertIsNone(publish_date_from_page_text(None))

    def test_rejects_impossible_and_implausible_dates(self):
        for text in ("February 31, 2020", "April 16, 1880", "April 16, 9999"):
            with self.subTest(text=text):
                self.assertIsNone(publish_date_from_page_text(text))


class MetadataDateTests(unittest.TestCase):
    def test_pdf_date_with_offset(self):
        self.assertEqual(
            publish_date_from_metadata("D:20200414125318-07'00'"),
            date(2020, 4, 14),
        )

    def test_pdf_date_with_zulu(self):
        self.assertEqual(
            publish_date_from_metadata("D:20150423174038Z"),
            date(2015, 4, 23),
        )

    def test_missing_or_malformed(self):
        for value in (None, "", "garbage", "D:20209999"):
            with self.subTest(value=value):
                self.assertIsNone(publish_date_from_metadata(value))


class DerivePublishDateTests(unittest.TestCase):
    def test_page_date_wins_over_metadata(self):
        self.assertEqual(
            derive_publish_date(
                first_page_text="September 14, 2020",
                metadata_creation_date="D:20250101000000",
            ),
            date(2020, 9, 14),
        )

    def test_metadata_used_when_page_has_no_date(self):
        self.assertEqual(
            derive_publish_date(
                first_page_text="No date here",
                metadata_creation_date="D:20200414125318",
            ),
            date(2020, 4, 14),
        )

    def test_fallback_used_when_nothing_found(self):
        sentinel = date(2026, 11, 23)
        self.assertEqual(
            derive_publish_date(first_page_text="none", fallback=sentinel),
            sentinel,
        )

    def test_returns_none_without_any_source(self):
        self.assertIsNone(derive_publish_date())


if __name__ == "__main__":
    unittest.main()
