import unittest
from datetime import date
from unittest.mock import patch, MagicMock

from app import (
    app,
    _bucket_label,
    _bucket_period,
    _bucket_start,
    _next_bucket,
    parse_activity_range,
)


class TestActivityBucketMath(unittest.TestCase):
    """The bucket arithmetic is pure, so it is tested without a database."""

    def test_day_buckets_step_one_day(self):
        day = date(2026, 3, 15)
        self.assertEqual(_next_bucket(day, "DAY"), date(2026, 3, 16))
        self.assertEqual(_bucket_start(day, "DAY"), day)

    def test_week_buckets_start_on_monday(self):
        # 2026-03-15 is a Sunday; its ISO week starts on the 9th.
        sunday = date(2026, 3, 15)
        monday = date(2026, 3, 9)
        self.assertEqual(_bucket_start(sunday, "WEEK"), monday)
        self.assertEqual(_next_bucket(monday, "WEEK"), date(2026, 3, 16))
        self.assertEqual(_bucket_start(monday, "WEEK"), monday)

    def test_month_buckets_snap_to_the_first(self):
        self.assertEqual(_bucket_start(date(2026, 1, 31), "MONTH"), date(2026, 1, 1))

    def test_month_steps_survive_short_months(self):
        # Walking Jan → Dec across a non-leap year must not skip February.
        bucket = date(2026, 1, 1)
        seen = []
        for _ in range(12):
            seen.append(bucket.month)
            bucket = _next_bucket(bucket, "MONTH")
        self.assertEqual(seen, list(range(1, 13)))
        self.assertEqual(bucket, date(2027, 1, 1))

    def test_month_step_ends_year_correctly(self):
        self.assertEqual(_next_bucket(date(2026, 12, 1), "MONTH"), date(2027, 1, 1))
        self.assertEqual(_next_bucket(date(2026, 1, 1), "MONTH"), date(2026, 2, 1))

    def test_period_and_label_formats(self):
        self.assertEqual(_bucket_period(date(2026, 1, 1), "MONTH"), "2026-01")
        self.assertEqual(_bucket_label(date(2026, 1, 1), "MONTH"), "Jan")
        self.assertEqual(_bucket_period(date(2026, 3, 9), "WEEK"), "2026-03-09")
        self.assertEqual(_bucket_label(date(2026, 3, 9), "WEEK"), "Mar 9")


class TestParseActivityRange(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _parse(self, query=""):
        with app.test_request_context(f"/audits/risk-over-time{query}"):
            return parse_activity_range()

    def test_explicit_range_is_inclusive_and_end_is_exclusive(self):
        start, end, interval, buckets = self._parse(
            "?start_date=2026-01-01&end_date=2026-03-31&interval=MONTH"
        )
        self.assertEqual(start, date(2026, 1, 1))
        self.assertEqual(end, date(2026, 4, 1))
        self.assertEqual(interval, "MONTH")
        self.assertEqual(buckets, [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)])

    def test_default_range_covers_twelve_months(self):
        _, _, interval, buckets = self._parse()
        self.assertEqual(interval, "MONTH")
        self.assertEqual(len(buckets), 12)
        # Default buckets are consecutive first-of-month dates.
        for previous, following in zip(buckets, buckets[1:]):
            self.assertEqual(_next_bucket(previous, "MONTH"), following)

    def test_interval_is_case_insensitive(self):
        _, _, interval, _ = self._parse("?interval=day")
        self.assertEqual(interval, "DAY")

    def test_single_day_range_yields_one_bucket(self):
        _, end, _, buckets = self._parse(
            "?start_date=2026-03-15&end_date=2026-03-15&interval=DAY"
        )
        self.assertEqual(buckets, [date(2026, 3, 15)])
        self.assertEqual(end, date(2026, 3, 16))

    def test_rejects_invalid_interval(self):
        with self.assertRaises(ValueError) as raised:
            self._parse("?interval=YEAR")
        self.assertIn("interval", str(raised.exception))

    def test_rejects_reversed_range(self):
        with self.assertRaises(ValueError) as raised:
            self._parse("?start_date=2026-05-01&end_date=2026-01-01")
        self.assertIn("start_date", str(raised.exception))

    def test_rejects_malformed_dates(self):
        with self.assertRaises(ValueError) as raised:
            self._parse("?start_date=2026-02-30&end_date=2026-03-01")
        self.assertIn("start_date", str(raised.exception))

        with self.assertRaises(ValueError) as raised:
            self._parse("?start_date=2026-01-01&end_date=not-a-date")
        self.assertIn("end_date", str(raised.exception))

    def test_rejects_oversized_range(self):
        with self.assertRaises(ValueError) as raised:
            self._parse("?start_date=2000-01-01&end_date=2026-01-01&interval=DAY")
        self.assertIn("buckets", str(raised.exception))


class TestActivityEndpoints(unittest.TestCase):
    """Endpoint wiring, including the gap-filling that the charts rely on."""

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def _sign_in(self):
        with self.client.session_transaction() as session:
            session["username"] = "testuser"

    def _connection(self, rows):
        cursor = MagicMock()
        cursor.fetchall.return_value = rows
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn

    def test_risk_over_time_fills_missing_buckets_and_levels(self):
        self._sign_in()
        # Only February has data; January and March must still be returned.
        rows = [
            {"bucket": date(2026, 2, 1), "level": "HIGH", "total": 2},
            {"bucket": date(2026, 2, 1), "level": "UNRATED", "total": 1},
        ]

        with patch("app.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get(
                "/audits/risk-over-time"
                "?start_date=2026-01-01&end_date=2026-03-31&interval=MONTH"
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual([point["period"] for point in data], ["2026-01", "2026-02", "2026-03"])

        self.assertEqual(data[0]["total"], 0)
        self.assertEqual(data[0]["counts"]["HIGH"], 0)

        self.assertEqual(data[1]["total"], 3)
        self.assertEqual(data[1]["counts"]["HIGH"], 2)
        self.assertEqual(data[1]["counts"]["UNRATED"], 1)
        self.assertEqual(data[1]["counts"]["INFO"], 0)

        self.assertEqual(data[2]["total"], 0)

    def test_risk_counts_and_total_stay_consistent(self):
        self._sign_in()
        rows = [
            {"bucket": date(2026, 1, 1), "level": level, "total": 1}
            for level in ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "UNRATED")
        ]

        with patch("app.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get(
                "/audits/risk-over-time"
                "?start_date=2026-01-01&end_date=2026-01-31&interval=MONTH"
            )

        point = response.get_json()["data"][0]
        counts = point["counts"]
        self.assertEqual(point["total"], 6)
        self.assertEqual(sum(counts[level] for level in counts), 6)

    def test_risk_over_time_accepts_date_objects_from_a_week_group(self):
        self._sign_in()
        # WEEK group-by returns DATE columns, which pymysql yields as date.
        rows = [{"bucket": date(2026, 3, 9), "level": "LOW", "total": 4}]

        with patch("app.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get(
                "/audits/risk-over-time"
                "?start_date=2026-03-09&end_date=2026-03-15&interval=WEEK"
            )

        data = response.get_json()["data"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "2026-03-09")
        self.assertEqual(data[0]["label"], "Mar 9")
        self.assertEqual(data[0]["counts"]["LOW"], 4)

    def test_scan_activity_returns_zero_for_empty_buckets(self):
        self._sign_in()
        rows = [{"bucket": date(2026, 2, 1), "total": 5}]

        with patch("app.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get(
                "/audits/scan-activity"
                "?start_date=2026-01-01&end_date=2026-03-31&interval=MONTH"
            )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual([point["total"] for point in data], [0, 5, 0])
        self.assertEqual(data[1]["label"], "Feb")

    def test_scan_activity_handles_string_buckets(self):
        self._sign_in()
        # A MONTH group-by returns DATE_FORMAT output, i.e. a string.
        rows = [{"bucket": "2026-01-01", "total": 3}]

        with patch("app.get_db_connection", return_value=self._connection(rows)):
            response = self.client.get(
                "/audits/scan-activity"
                "?start_date=2026-01-01&end_date=2026-01-31&interval=MONTH"
            )

        self.assertEqual(response.get_json()["data"][0]["total"], 3)

    def test_endpoints_require_a_session(self):
        for path in ("/audits/risk-over-time", "/audits/scan-activity"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 401, path)

    def test_invalid_range_returns_400_not_empty_data(self):
        self._sign_in()
        response = self.client.get(
            "/audits/risk-over-time?start_date=2026-05-01&end_date=2026-01-01"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_DATE_RANGE")

    def test_database_failure_returns_500(self):
        import pymysql

        self._sign_in()
        with patch("app.get_db_connection", side_effect=pymysql.MySQLError("boom")):
            for path in ("/audits/risk-over-time", "/audits/scan-activity"):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 500, path)
                self.assertEqual(
                    response.get_json()["error"]["code"], "INTERNAL_SERVER_ERROR"
                )


if __name__ == "__main__":
    unittest.main()
