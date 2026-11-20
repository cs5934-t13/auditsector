"""Real MySQL + Scrapy + PDF tests, enabled only by the disposable test runner."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import unittest
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
import pymupdf
import pymysql
from services.scheduler.fetcher import scan
from services.scheduler.repository import connect_db
from services.scheduler.runner import run_once

TOKEN = os.environ.get("AW98_TEST_RUN")


def owned(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT token FROM aw98_test_guard")
        if not TOKEN or cur.fetchone()["token"] != TOKEN:
            raise RuntimeError("Not an owned AW-98 disposable database")


@unittest.skipUnless(TOKEN, "requires the AW-98 disposable runner")
class MySQLIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.conn = connect_db()
        owned(self.conn)
        self.fail_llm = False
        self.fail_download = False
        self.prompts = []
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text(
            (72, 72),
            "AW98 procurement audit: invoices were not approved. Improve vendor controls.",
        )
        self.pdf = doc.tobytes()
        doc.close()
        case = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == "/robots.txt":
                    body = b"User-agent: *\nAllow: /\n"
                    kind = "text/plain"
                    status = 200
                elif self.path == "/collection":
                    body = b'<html><body><table><tbody><tr><td></td><td></td><td></td><td><a href="/record/fixture/">Report</a></td></tr></tbody></table></body></html>'
                    kind = "text/html"
                    status = 200
                elif self.path == "/record/fixture/file/document":
                    body = case.pdf
                    kind = "application/pdf"
                    status = 503 if case.fail_download else 200
                else:
                    body = b"Missing"
                    kind = "text/plain"
                    status = 404
                self.send_response(status)
                self.send_header("Content-Type", kind)
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                prompt = data["messages"][0]["content"]
                case.prompts.append(prompt)
                content = (
                    json.dumps(
                        {
                            "tags": [
                                {
                                    "tag": "Accounts Payable and Vendors",
                                    "evidence": "vendor controls",
                                }
                            ]
                        }
                    )
                    if "PREDEFINED TAGS:" in prompt
                    else "The audit examined procurement. It found approval gaps. Those gaps affect vendor payments. The auditors recommended stronger controls."
                )
                body = json.dumps(
                    {"choices": [{"message": {"content": content}}]}
                ).encode()
                self.send_response(500 if case.fail_llm else 200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:" + str(self.http.server_port)
        self.env = patch.dict(
            os.environ,
            {
                "LLM_API_URL": self.base + "/llm",
                "LLM_API_KEY": "disposable-fixture-only",
            },
        )
        self.env.start()
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users(first_name,last_name,email,username,password_hash) VALUES ('AW98','Fixture',%s,%s,%s)",
                (
                    TOKEN + str(self.http.server_port) + "@example.invalid",
                    TOKEN + str(self.http.server_port),
                    os.environ["AW98_TEST_HASH"],
                ),
            )
            self.uid = cur.lastrowid
        self.conn.commit()
        self.api = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        request = urllib.request.Request(
            "http://127.0.0.1:5000/login",
            data=json.dumps(
                {"username": TOKEN + str(self.http.server_port), "password": TOKEN}
            ).encode(),
            headers={"Content-Type": "application/json"},
        )
        with self.api.open(request) as response:
            self.assertEqual(response.status, 200)
        params = urllib.parse.urlencode(
            {"source": self.base + "/collection", "frequency": "MONTHLY"}
        )
        request = urllib.request.Request(
            "http://127.0.0.1:5000/sources?" + params, data=b"", method="POST"
        )
        with self.api.open(request) as response:
            self.assertEqual(response.status, 201)
            self.sid = json.load(response)["data"][0]["schedule_id"]

    def tearDown(self):
        self.env.stop()
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM audit_headers WHERE schedule_id=%s", (self.sid,))
            cur.execute(
                "DELETE FROM fetches WHERE fetch_url LIKE %s", (self.base + "/%",)
            )
            cur.execute("DELETE FROM schedules WHERE schedule_id=%s", (self.sid,))
            cur.execute("DELETE FROM users WHERE user_id=%s", (self.uid,))
        self.conn.commit()
        self.conn.close()

    def query(self, sql, args=()):
        self.conn.commit()  # Read commits made by the child process.
        with self.conn.cursor() as cur:
            cur.execute(sql, args)
            return list(cur.fetchall())

    def run_pass(self):
        # Only routing is replaced: real adapter -> child process -> HTTP -> PDF -> LLM fixture -> MySQL.
        now = datetime.now(timezone.utc)
        with patch(
            "services.scheduler.fetcher.spider_for_url", return_value="portland_or"
        ):
            run_once(self.conn, now, scan)

    def make_due(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE schedules SET next_run_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE schedule_id=%s",
                (self.sid,),
            )
        self.conn.commit()

    def test_first_monthly_scan_persists_report_relationship_and_skips_repeat(self):
        self.run_pass()
        records = self.query(
            "SELECT audit_id,schedule_id,run_status,summary FROM audit_headers WHERE schedule_id=%s",
            (self.sid,),
        )
        self.assertEqual(len(records), 1)
        self.assertEqual(len(records[0]["audit_id"]), 36)
        self.assertEqual(records[0]["schedule_id"], self.sid)
        self.assertEqual(records[0]["run_status"], "COMPLETED")
        self.assertIn("approval gaps", records[0]["summary"])
        with self.api.open("http://127.0.0.1:5000/audits/recent") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(
                json.load(response)["data"][0]["audit_id"], records[0]["audit_id"]
            )
        self.assertEqual(
            len(
                self.query(
                    "SELECT * FROM audit_tags WHERE audit_id=%s",
                    (records[0]["audit_id"],),
                )
            ),
            1,
        )
        self.assertTrue(
            all("invoices were not approved" in prompt for prompt in self.prompts)
        )
        status = self.query(
            "SELECT * FROM schedules WHERE schedule_id=%s", (self.sid,)
        )[0]
        self.assertEqual(status["last_run_status"], "SUCCESS")
        self.assertIsNotNone(status["last_run_at"])
        self.assertGreater(
            status["next_run_at"], datetime.now(timezone.utc).replace(tzinfo=None)
        )
        calls = len(self.prompts)
        self.make_due()
        self.run_pass()
        self.assertEqual(
            len(
                self.query(
                    "SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)
                )
            ),
            1,
        )
        self.assertEqual(len(self.prompts), calls)

    def test_failed_llm_remains_retryable_and_recovers(self):
        self.fail_llm = True
        with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
            self.run_pass()
        self.assertEqual(
            self.query("SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)),
            [],
        )
        self.assertEqual(
            self.query(
                "SELECT * FROM fetches WHERE fetch_url LIKE %s", (self.base + "/%",)
            ),
            [],
        )
        status = self.query(
            "SELECT last_run_status,next_run_at FROM schedules WHERE schedule_id=%s",
            (self.sid,),
        )[0]
        self.assertEqual(status["last_run_status"], "ERROR")
        self.assertGreater(
            status["next_run_at"], datetime.now(timezone.utc).replace(tzinfo=None)
        )
        self.fail_llm = False
        self.make_due()
        self.run_pass()
        self.assertEqual(
            len(
                self.query(
                    "SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)
                )
            ),
            1,
        )

    def test_failed_download_does_not_create_a_receipt(self):
        self.fail_download = True
        with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
            self.run_pass()
        self.assertEqual(
            self.query(
                "SELECT * FROM fetches WHERE fetch_url LIKE %s", (self.base + "/%",)
            ),
            [],
        )
        self.assertEqual(self.prompts, [])
        self.assertEqual(
            self.query(
                "SELECT last_run_status FROM schedules WHERE schedule_id=%s",
                (self.sid,),
            )[0]["last_run_status"],
            "ERROR",
        )

    def test_failed_database_write_rolls_back_report_and_receipt(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "CREATE TRIGGER aw98_receipt_failure BEFORE INSERT ON fetches FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='controlled receipt failure'"
            )
        try:
            with self.assertLogs("services.scheduler.scheduler", level="ERROR"):
                self.run_pass()
            self.assertEqual(
                self.query(
                    "SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)
                ),
                [],
            )
            self.assertEqual(
                self.query(
                    "SELECT * FROM fetches WHERE fetch_url LIKE %s", (self.base + "/%",)
                ),
                [],
            )
        finally:
            with self.conn.cursor() as cur:
                cur.execute("DROP TRIGGER aw98_receipt_failure")
        self.make_due()
        self.run_pass()
        self.assertEqual(
            len(
                self.query(
                    "SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)
                )
            ),
            1,
        )

    def test_second_worker_cannot_enter_an_active_pass(self):
        other = connect_db()
        with other.cursor() as cur:
            cur.execute("SELECT GET_LOCK('auditsector.scheduler',0)")
        try:
            self.run_pass()
            self.assertEqual(self.prompts, [])
            self.assertIsNone(
                self.query(
                    "SELECT last_run_status FROM schedules WHERE schedule_id=%s",
                    (self.sid,),
                )[0]["last_run_status"]
            )
        finally:
            with other.cursor() as cur:
                cur.execute("SELECT RELEASE_LOCK('auditsector.scheduler')")
            other.close()

    def test_archived_source_is_not_crawled(self):
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE schedules SET scan_frequency='ARCHIVE' WHERE schedule_id=%s",
                (self.sid,),
            )
        self.conn.commit()
        self.run_pass()
        self.assertEqual(self.prompts, [])
        self.assertEqual(
            self.query("SELECT * FROM audit_headers WHERE schedule_id=%s", (self.sid,)),
            [],
        )


@unittest.skipUnless(TOKEN, "requires the AW-98 disposable runner")
class MigrationTests(unittest.TestCase):
    def test_legacy_records_and_relationships_survive_and_upgrade_is_repeatable(self):
        conn = connect_db()
        owned(conn)
        spec = importlib.util.spec_from_file_location(
            "migration", "/data/migrations/scheduler_fetcher.py"
        )
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with conn.cursor() as cur:
            cur.execute("CREATE DATABASE aw98_legacy")
            cur.execute("USE aw98_legacy")
            cur.execute("CREATE TABLE users(user_id BIGINT UNSIGNED PRIMARY KEY)")
            cur.execute("INSERT INTO users VALUES (1)")
            cur.execute(
                "CREATE TABLE schedules(schedule_id BIGINT UNSIGNED PRIMARY KEY,created_by BIGINT UNSIGNED,source_link VARCHAR(255),scan_frequency ENUM('HOURLY','DAILY','WEEKLY','MONTHLY','ARCHIVE'),next_run_at DATETIME)"
            )
            cur.execute(
                "INSERT INTO schedules VALUES (2,1,'https://example.invalid/legacy','MONTHLY',NULL)"
            )
            cur.execute(
                "CREATE TABLE audit_headers(audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,schedule_id BIGINT UNSIGNED NOT NULL,title VARCHAR(255),audit_date DATETIME,risk_level VARCHAR(20),run_status VARCHAR(20),summary TEXT,created_at DATETIME,CONSTRAINT fk_audit_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id))"
            )
            cur.execute(
                "INSERT INTO audit_headers VALUES (7,2,'Keep this report',NOW(),'HIGH','COMPLETED','Keep this summary',NOW())"
            )
            cur.execute(
                "CREATE TABLE tags(tag_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) UNIQUE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
            )
            cur.execute("INSERT INTO tags VALUES(5,'Custom legacy tag',NOW())")
            cur.execute(
                "CREATE TABLE audit_tags(audit_id BIGINT UNSIGNED,tag_id BIGINT UNSIGNED,PRIMARY KEY(audit_id,tag_id),CONSTRAINT fk_at_audit FOREIGN KEY(audit_id) REFERENCES audit_headers(audit_id) ON DELETE CASCADE,CONSTRAINT fk_at_tag FOREIGN KEY(tag_id) REFERENCES tags(tag_id))"
            )
            cur.execute("INSERT INTO audit_tags VALUES(7,5)")
        conn.commit()
        try:
            # A historical download receipt does not prove that processing succeeded.
            with conn.cursor() as cur:
                cur.execute("CREATE TABLE fetches(fetch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,spider_id VARCHAR(255),fetch_url VARCHAR(255),fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
                cur.execute("INSERT INTO fetches(spider_id,fetch_url) VALUES ('legacy','https://example.invalid/legacy-download')")
            conn.commit()
            with self.assertRaisesRegex(ValueError, "Legacy download records"):
                migration.apply(conn)
            with conn.cursor() as cur:
                cur.execute("SHOW COLUMNS FROM audit_headers LIKE 'audit_id'")
                self.assertEqual(cur.fetchone()["Type"], "bigint unsigned")
                cur.execute("SELECT COUNT(*) AS n FROM fetches")
                self.assertEqual(cur.fetchone()["n"], 1)
                # Remove only this controlled fixture before testing the valid upgrade.
                cur.execute("DELETE FROM fetches WHERE fetch_url='https://example.invalid/legacy-download'")
            conn.commit()
            migration.apply(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT audit_id,title,summary FROM audit_headers")
                self.assertEqual(
                    cur.fetchone(),
                    {
                        "audit_id": "7",
                        "title": "Keep this report",
                        "summary": "Keep this summary",
                    },
                )
                cur.execute("SELECT * FROM audit_tags")
                self.assertEqual(cur.fetchone(), {"audit_id": "7", "tag_id": 5})
                cur.execute("SELECT COUNT(*) AS n FROM tags")
                self.assertEqual(cur.fetchone()["n"], 11)
            self.assertEqual(migration.apply(conn), 0)
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO fetches(spider_id,fetch_url) VALUES('fixture','https://example.invalid/one')"
                )
                with self.assertRaises(pymysql.IntegrityError):
                    cur.execute(
                        "INSERT INTO fetches(spider_id,fetch_url) VALUES('fixture','https://example.invalid/one')"
                    )
            conn.rollback()
            # Preflight must refuse orphan reports without silently dropping them.
            with conn.cursor() as cur:
                cur.execute(
                    "ALTER TABLE audit_headers DROP FOREIGN KEY fk_audit_schedule"
                )
                cur.execute(
                    "INSERT INTO audit_headers(audit_id,schedule_id,title) VALUES ('orphan',0,'Keep orphan until ownership is resolved')"
                )
            conn.commit()
            with self.assertRaisesRegex(ValueError, "without real schedules"):
                migration.plan(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS n FROM audit_headers")
                self.assertEqual(cur.fetchone()["n"], 2)
                cur.execute("DELETE FROM audit_headers WHERE audit_id='orphan'")
                cur.execute("ALTER TABLE fetches DROP INDEX uq_fetch_source")
                cur.execute(
                    "INSERT INTO fetches(spider_id,fetch_url) VALUES('fixture','same'),('fixture','same')"
                )
            conn.commit()
            with self.assertRaisesRegex(ValueError, "Duplicate fetch receipts"):
                migration.plan(conn)
        finally:
            with conn.cursor() as cur:
                cur.execute("DROP DATABASE aw98_legacy")
            conn.close()
