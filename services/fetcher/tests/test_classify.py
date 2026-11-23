"""Tests for risk-level classification and the combined summary prompt.

The parser and prompt are pure text, so these need no model or network.
"""

import unittest

from fetcher.ai.classify import (
    RISK_LEVELS,
    build_prompt,
    normalize_risk_level,
    parse_response,
)


class PromptTests(unittest.TestCase):
    def test_lists_every_level(self):
        prompt = build_prompt("an audit report")
        for level in RISK_LEVELS:
            self.assertIn(level, prompt)

    def test_requests_summary_and_risk_level(self):
        prompt = build_prompt("an audit report")
        self.assertIn("summary", prompt)
        self.assertIn("risk_level", prompt)
        self.assertIn("JSON", prompt)

    def test_truncates_long_text(self):
        prompt = build_prompt("x" * 50000)
        self.assertLess(len(prompt), 50000)

    def test_keeps_summary_rules(self):
        prompt = build_prompt("an audit report")
        self.assertIn("Exactly 4 sentences", prompt)


class NormalizeRiskLevelTests(unittest.TestCase):
    def test_accepts_exact_levels(self):
        for level in RISK_LEVELS:
            with self.subTest(level=level):
                self.assertEqual(normalize_risk_level(level), level)

    def test_normalizes_case_and_whitespace(self):
        for raw, expected in (
            ("medium", "MEDIUM"),
            ("  High  ", "HIGH"),
            ("critical.", "CRITICAL"),
            ("Low\n", "LOW"),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(normalize_risk_level(raw), expected)

    def test_rejects_unknown_values(self):
        for raw in ("SEVERE", "moderate", "", None, 3, "MEDIUM-HIGH", ["HIGH"]):
            with self.subTest(raw=raw):
                self.assertIsNone(normalize_risk_level(raw))


class ParseResponseTests(unittest.TestCase):
    def test_parses_plain_json(self):
        result = parse_response(
            '{"summary": "Four sentences here.", "risk_level": "HIGH"}'
        )
        self.assertEqual(result["summary"], "Four sentences here.")
        self.assertEqual(result["risk_level"], "HIGH")

    def test_parses_fenced_json(self):
        result = parse_response(
            '```json\n{"summary": "A summary.", "risk_level": "LOW"}\n```'
        )
        self.assertEqual(result["summary"], "A summary.")
        self.assertEqual(result["risk_level"], "LOW")

    def test_salvages_json_wrapped_in_prose(self):
        result = parse_response(
            'Here is the result:\n{"summary": "A summary.", "risk_level": "MEDIUM"}'
        )
        self.assertEqual(result["risk_level"], "MEDIUM")

    def test_collapses_whitespace_in_summary(self):
        result = parse_response('{"summary": "Line one.\\n\\nLine two.", "risk_level": "LOW"}')
        self.assertEqual(result["summary"], "Line one. Line two.")

    def test_invalid_level_is_none_not_coerced(self):
        result = parse_response('{"summary": "A summary.", "risk_level": "SEVERE"}')
        self.assertEqual(result["summary"], "A summary.")
        self.assertIsNone(result["risk_level"])

    def test_missing_level_is_none(self):
        result = parse_response('{"summary": "A summary."}')
        self.assertIsNone(result["risk_level"])

    def test_plain_prose_still_yields_a_summary(self):
        result = parse_response("This report found nothing significant.")
        self.assertEqual(result["summary"], "This report found nothing significant.")
        self.assertIsNone(result["risk_level"])

    def test_summary_list_is_joined(self):
        result = parse_response('{"summary": ["One.", "Two."], "risk_level": "LOW"}')
        self.assertEqual(result["summary"], "One. Two.")

    def test_empty_reply_raises(self):
        for content in ("", "   ", "{}", '{"risk_level": "HIGH"}', None):
            with self.subTest(content=content):
                with self.assertRaises(ValueError):
                    parse_response(content)


if __name__ == "__main__":
    unittest.main()
