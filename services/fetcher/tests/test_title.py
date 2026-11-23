"""Tests for the report-title fallback chain.

The chain is pure text processing, so these tests need no PDF, database, or
network access.
"""

import unittest

from fetcher.ai.title import (
    MAX_TITLE_LENGTH,
    _is_usable,
    derive_title,
    title_from_page_text,
    title_from_url,
)


class MetadataTitleTests(unittest.TestCase):
    def test_uses_embedded_title(self):
        self.assertEqual(
            derive_title(metadata_title="Final Inspections of Buildings Audit Report"),
            "Final Inspections of Buildings Audit Report",
        )

    def test_strips_word_wrapper_and_extension(self):
        self.assertEqual(
            derive_title(
                metadata_title=(
                    "Microsoft Word - SPU Wholesale Water Sales Audit- "
                    "Final Report 3_15_2018.docx"
                )
            ),
            "SPU Wholesale Water Sales Audit- Final Report 3_15_2018",
        )

    def test_ignores_empty_and_placeholder_titles(self):
        for placeholder in ("", "   ", "Untitled", "Microsoft Word", "Table of Contents"):
            with self.subTest(placeholder=placeholder):
                self.assertEqual(
                    derive_title(
                        metadata_title=placeholder,
                        audit_url="https://example.gov/2018-03_LPR.pdf",
                    ),
                    "2018 03 LPR",
                )


class PageTextTests(unittest.TestCase):
    def test_uses_masthead_line_naming_the_document(self):
        text = (
            "Seattle Office of City Auditor\n"
            "Audit of Astound's Compliance with Seattle's Cable Customer "
            "Bill of Rights\n"
            "June 2025\n"
        )
        self.assertEqual(
            title_from_page_text(text),
            "Audit of Astound's Compliance with Seattle's Cable Customer "
            "Bill of Rights",
        )

    def test_joins_title_wrapped_over_two_lines(self):
        text = (
            "City of Seattle Sweetened Beverage Tax\n"
            "Overall Evaluation Findings\n"
            "January 2026\n"
        )
        self.assertEqual(
            title_from_page_text(text),
            "City of Seattle Sweetened Beverage Tax Overall Evaluation Findings",
        )

    def test_merges_continuation_of_a_cut_title(self):
        text = (
            "Status Report on Implementation of\n"
            "Office of City Auditor Recommendations\n"
            "December 2023\n"
        )
        self.assertEqual(
            title_from_page_text(text),
            "Status Report on Implementation of Office of City Auditor Recommendations",
        )

    def test_collapses_long_html_heading_run(self):
        text = (
            "Seattle Department of Transportation: Strategic Approach to "
            "Vehicle Bridge Maintenance is Warranted. The City Should Also "
            "Perform an Audit of Bridge Conditions.\n"
        )
        title = title_from_page_text(text)
        self.assertTrue(title.startswith("Seattle Department of Transportation:"))
        self.assertLess(len(title), len(text))

    def test_skips_page_furniture_and_roles(self):
        text = (
            "Page 1\n"
            "April 1, 2025\n"
            "Arushi Thakorlal, Acting City Auditor\n"
            "2024 Annual Report\n"
        )
        self.assertEqual(title_from_page_text(text), "2024 Annual Report")

    def test_ignores_branding_only_masthead(self):
        text = "Seattle Office of City Auditor\n^ Seattle Office of Inspector General\n"
        self.assertIsNone(title_from_page_text(text))

    def test_skips_memorandum_letterhead(self):
        text = (
            "(206) 233-1095\n"
            "700 Fifth Avenue, Suite 2410\n"
            "P.O. Box 94729\n"
            "Seattle, Washington 98124-4729\n"
            "Seattle Office of City Auditor\n"
            "M E M O R A N D U M\n"
            "Follow Up on Recent Loss Reports filed by the Information "
            "Technology Department\n"
        )
        self.assertEqual(
            title_from_page_text(text),
            "Follow Up on Recent Loss Reports filed by the Information "
            "Technology Department",
        )

    def test_skips_addressee_block(self):
        text = (
            "Seattle, Washington 98124-4729\n"
            "Seattle Office of City Auditor\n"
            "The Honorable Lisa Herbold, Chair, Public Safety and Human "
            "Services Committee,\n"
            "Councilmember, Seattle City Council\n"
            "Gun Safe Storage Ordinance: Statistical Report on 2021 and 2022 Data\n"
        )
        self.assertEqual(
            title_from_page_text(text),
            "Gun Safe Storage Ordinance: Statistical Report on 2021 and 2022 Data",
        )


class UrlTitleTests(unittest.TestCase):
    def test_uses_filename_from_url(self):
        self.assertEqual(
            title_from_url(
                "https://www.seattle.gov/documents/Departments/CityAuditor/"
                "auditreports/2021/SidewalksFinalReportREV3.pdf"
            ),
            "Sidewalks Final Report REV3",
        )

    def test_splits_camel_case_and_separators(self):
        self.assertEqual(
            title_from_url(
                "https://example.gov/docs/CommunityResistanceGentrification.pdf"
            ),
            "Community Resistance Gentrification",
        )

    def test_percent_decodes_filename(self):
        self.assertEqual(
            title_from_url("https://example.gov/docs/Seattle%27s%20Plan.pdf"),
            "Seattle's Plan",
        )


class FallbackChainTests(unittest.TestCase):
    def test_prefers_metadata_over_page_text_and_url(self):
        self.assertEqual(
            derive_title(
                metadata_title="Final Inspections of Buildings Audit Report",
                first_page_text="Some other Audit Report\n",
                audit_url="https://example.gov/thing.pdf",
            ),
            "Final Inspections of Buildings Audit Report",
        )

    def test_falls_back_to_page_text_when_metadata_unusable(self):
        self.assertEqual(
            derive_title(
                metadata_title="Microsoft Word",
                first_page_text="Workforce Equity Promotions Audit\n",
                audit_url="https://example.gov/thing.pdf",
            ),
            "Workforce Equity Promotions Audit",
        )

    def test_falls_back_to_url_when_metadata_and_page_text_unusable(self):
        self.assertEqual(
            derive_title(
                metadata_title="Microsoft Word",
                first_page_text="Page 1\nContents\n",
                audit_url="https://example.gov/docs/HomelessContractsAudit.pdf",
            ),
            "Homeless Contracts Audit",
        )

    def test_never_returns_a_content_hash(self):
        title = derive_title(
            audit_url=(
                "https://example.gov/docs/"
                "41c739d34be8d957222f5903c224f5c717d45f84.pdf"
            ),
        )
        self.assertNotIn("41c739d34be8d957", title)

    def test_returns_untitled_report_without_any_candidate(self):
        self.assertEqual(derive_title(), "Untitled report")

    def test_clips_long_titles_on_a_word_boundary(self):
        title = derive_title(metadata_title="word " * 100)
        self.assertLessEqual(len(title), MAX_TITLE_LENGTH)
        self.assertTrue(title.endswith("…"))


class UsabilityTests(unittest.TestCase):
    def test_rejects_hashes_placeholders_and_furniture(self):
        for unusable in (
            None,
            "",
            "Page 1",
            "Table of Contents",
            "An equal opportunity employer",
            "41c739d34be8d957222f5903c224f5c717d45f84.pdf",
            "Status Report on",
            "THE EVALUATION OF SEATTLE'S",
            "Seattle Office of City Auditor",
            "Center for Evidence-Based Crime Policy",
        ):
            with self.subTest(candidate=unusable):
                self.assertFalse(_is_usable(unusable))

    def test_accepts_real_titles(self):
        for usable in (
            "2025 Recommendation Follow-up Report",
            "Homeless Contracts Management Audit",
            "Seattle Minimum Wage Enforcement Audit",
            "Two Year Report: Store Audits",
            "2019-04 Final Report",
        ):
            with self.subTest(candidate=usable):
                self.assertTrue(_is_usable(usable))


if __name__ == "__main__":
    unittest.main()
