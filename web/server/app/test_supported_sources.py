"""Tests for the shared audit-source registry.

`supported_sources.py` is the single allow-list both containers read. These tests
live here rather than in either consumer's suite, because a failure here means
the worker and the web tier disagree about what can be scanned.
"""

import unittest

from supported_sources import (
    SUPPORTED_SOURCES,
    example_url,
    path_matches,
    spider_for_url,
)


class SupportHelperTests(unittest.TestCase):
    """The web tier resolves the same URLs the scheduler does.

    Both read `supported_sources.py` at the repository root, so this class guards
    the shared registry and the trailing-slash rules rather than a local copy.
    """

    def test_resolves_every_registered_source(self):
        """Every registry entry's own example URL must resolve to that spider."""
        for source in SUPPORTED_SOURCES:
            with self.subTest(spider=source["spider"]):
                example = example_url(source)
                self.assertEqual(spider_for_url(example), source["spider"])

    def test_accepts_trailing_slash(self):
        self.assertEqual(
            spider_for_url("https://www.seattle.gov/city-auditor/reports/"),
            "seattle_wa",
        )

    def test_accepts_the_newly_added_sources(self):
        """Regression: these were supported by the scheduler but not the UI."""
        cases = {
            "https://www.portland.gov/auditor/audit-services": "portland_audit_services",
            "https://www.portland.gov/auditor/audit-services/about-us/"
            "audit-reports-online": "portland_audit_reports",
            "https://www.cityoftulsa.org/government/internal-audit-reports/": "tulsa_ok",
            "https://clark.wa.gov/auditor/auditor-documents": "clark_wa",
            "https://www.azauditor.gov/counties/maricopa-county": "maricopa_az",
            "https://www.cityofsacramento.gov/auditor": "sacramento_ca",
            "https://www.sandiego.gov/auditor/reports": "san_diego_ca",
            "https://www.sf.gov/information--city-services-auditor": "san_francisco_ca",
            "https://auditor.virginiabeach.gov/": "virginia_beach_va",
        }
        for url, spider in cases.items():
            with self.subTest(url=url):
                self.assertEqual(spider_for_url(url), spider)

    def test_matches_denver_and_king_county_by_suffix(self):
        """Those two listings sit under long, varying parent paths."""
        self.assertEqual(
            spider_for_url(
                "https://denvergov.org/Government/Agencies-Departments-Offices/"
                "Agencies-Departments-Offices-Directory/Auditors-Office/"
                "Audit-Services/Audit-Reports"
            ),
            "denver_co",
        )
        self.assertEqual(
            spider_for_url(
                "https://kingcounty.gov/en/independents/governance-and-leadership/"
                "government-oversight/auditors-office/reports-papers"
            ),
            "king_county_wa",
        )

    def test_rejects_other_urls(self):
        for url in (
            "https://www.portland.gov/auditor/reports",
            "https://www.seattle.gov/city-auditor/reports1",
            "https://efiles.portlandoregon.gov/records",
            "ftp://www.seattle.gov/city-auditor/reports",
            "",
            None,
            "not a url",
        ):
            with self.subTest(url=url):
                self.assertIsNone(spider_for_url(url))


class RegistryShapeTests(unittest.TestCase):
    """Guards the data itself, not just the matching."""

    def test_spider_names_are_unique(self):
        names = [source["spider"] for source in SUPPORTED_SOURCES]
        self.assertEqual(len(names), len(set(names)))

    def test_every_entry_is_complete(self):
        for source in SUPPORTED_SOURCES:
            with self.subTest(spider=source["spider"]):
                self.assertTrue(source["label"])
                self.assertTrue(source["hosts"])
                self.assertTrue(source["paths"])
                self.assertIn(source["match"], ("exact", "prefix", "suffix"))

    def test_example_urls_round_trip(self):
        for source in SUPPORTED_SOURCES:
            with self.subTest(spider=source["spider"]):
                self.assertEqual(spider_for_url(example_url(source)), source["spider"])

    def test_hosts_are_lowercase(self):
        """Matching lowercases the URL host, so the data must be lowercase too."""
        for source in SUPPORTED_SOURCES:
            for host in source["hosts"]:
                with self.subTest(host=host):
                    self.assertEqual(host, host.lower())


class PathMatchingTests(unittest.TestCase):
    """The three matching rules, isolated from the registry data."""
    def test_exact_ignores_trailing_slash_only(self):
        """A listing URL is the same page with or without its final slash."""
        self.assertTrue(path_matches("/a/b", "/a/b", "exact"))
        self.assertTrue(path_matches("/a/b/", "/a/b", "exact"))
        self.assertFalse(path_matches("/a/b/c", "/a/b", "exact"))

    def test_prefix_allows_descendants(self):
        """Portland eFiles numbers each record beneath `/record`."""
        self.assertTrue(path_matches("/record", "/record", "prefix"))
        self.assertTrue(path_matches("/record/123", "/record", "prefix"))
        self.assertFalse(path_matches("/records", "/record", "prefix"))

    def test_suffix_allows_parent_paths(self):
        """Denver and King County sit under long, varying parent paths."""
        self.assertTrue(path_matches("/x/y/reports", "/reports", "suffix"))
        self.assertTrue(path_matches("/a/b", "/a/b", "suffix"))
        self.assertFalse(path_matches("/a/reports-2024", "/reports", "suffix"))
