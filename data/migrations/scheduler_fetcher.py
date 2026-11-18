"""Inspect first; explicitly apply the scheduler/fetcher upgrade after a database backup.

Run with the worker stopped. DDL commits in MySQL; a backup is needed for recovery.
Existing numeric audit IDs are preserved as strings, not replaced with new IDs.
"""

import argparse
import os
from pathlib import Path
import re
import pymysql


def identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise ValueError("Unexpected database identifier")
    return "`" + value + "`"


def plan(conn):
    with conn.cursor() as cur:

        def columns(table):
            cur.execute("SHOW COLUMNS FROM " + identifier(table))
            return {row["Field"]: row for row in cur.fetchall()}

        audits = columns("audit_headers")
        links = columns("audit_tags")
        schedules = columns("schedules")
        tags = columns("tags")
        for col in [audits["audit_id"], links["audit_id"]]:
            if col["Type"].lower() not in ("bigint unsigned", "char(36)"):
                raise ValueError("Unsupported audit ID type; inspect before migrating")
        cur.execute("""SELECT a.audit_id FROM audit_headers a
            LEFT JOIN schedules s ON s.schedule_id=a.schedule_id
            WHERE s.schedule_id IS NULL LIMIT 1""")
        if cur.fetchone():
            raise ValueError(
                "Reports without real schedules exist; resolve their ownership before migrating"
            )
        cur.execute("""SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE REFERENCED_TABLE_SCHEMA=DATABASE()
              AND REFERENCED_TABLE_NAME='audit_headers'""")
        references = list(cur.fetchall())
        if any(
            r["TABLE_NAME"] != "audit_tags" or r["COLUMN_NAME"] != "audit_id"
            for r in references
        ):
            raise ValueError(
                "Additional audit ID foreign keys exist; inspect before migrating"
            )
        cur.execute("SHOW TABLES LIKE 'fetches'")
        has_fetches = bool(cur.fetchone())
        unique_fetches = False
        if has_fetches:
            cur.execute("""SELECT 1 FROM fetches GROUP BY spider_id, fetch_url
                HAVING COUNT(*) > 1 LIMIT 1""")
            if cur.fetchone():
                raise ValueError(
                    "Duplicate fetch receipts exist; inspect before adding the unique constraint"
                )
            cur.execute("SHOW INDEX FROM fetches")
            indexes = {}
            for row in cur.fetchall():
                if row["Non_unique"] == 0:
                    indexes.setdefault(row["Key_name"], []).append(
                        (row["Seq_in_index"], row["Column_name"])
                    )
            unique_fetches = any(
                [col for _, col in sorted(parts)] == ["spider_id", "fetch_url"]
                for parts in indexes.values()
            )
        if has_fetches and not unique_fetches:
            # Older fetchers recorded URLs before successful report processing.
            # Their receipts cannot safely be treated as completed reports.
            cur.execute("SELECT 1 FROM fetches LIMIT 1")
            if cur.fetchone():
                raise ValueError(
                    "Legacy download records exist; review them before enabling processed-report deduplication"
                )
        statements = []
        change_ids = (
            audits["audit_id"]["Type"].lower() != "char(36)"
            or links["audit_id"]["Type"].lower() != "char(36)"
        )
        if change_ids:
            for ref in references:
                statements.append(
                    "ALTER TABLE audit_tags DROP FOREIGN KEY "
                    + identifier(ref["CONSTRAINT_NAME"])
                )
            statements += [
                "ALTER TABLE audit_headers MODIFY audit_id CHAR(36) NOT NULL",
                "ALTER TABLE audit_tags MODIFY audit_id CHAR(36) NOT NULL",
            ]
        if change_ids or not references:
            statements.append(
                "ALTER TABLE audit_tags ADD CONSTRAINT fk_at_audit FOREIGN KEY (audit_id) REFERENCES audit_headers(audit_id) ON DELETE CASCADE"
            )
        if "muni" not in audits:
            statements.append(
                "ALTER TABLE audit_headers ADD COLUMN muni VARCHAR(255) NOT NULL DEFAULT ''"
            )
        if "last_run_at" not in schedules:
            statements.append(
                "ALTER TABLE schedules ADD COLUMN last_run_at DATETIME NULL"
            )
        if "last_run_status" not in schedules:
            statements.append(
                "ALTER TABLE schedules ADD COLUMN last_run_status ENUM('SUCCESS','ERROR') NULL"
            )
        if "description" not in tags:
            statements.append("ALTER TABLE tags ADD COLUMN description TEXT NULL")
        if not has_fetches:
            statements.append("""CREATE TABLE fetches (
                fetch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                spider_id VARCHAR(255) NOT NULL, fetch_url VARCHAR(255) NOT NULL,
                fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_fetch_source (spider_id, fetch_url))""")
        elif not unique_fetches:
            statements.append(
                "ALTER TABLE fetches ADD UNIQUE KEY uq_fetch_source (spider_id, fetch_url)"
            )
        cur.execute("""SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_headers'
              AND COLUMN_NAME='schedule_id' AND REFERENCED_TABLE_NAME='schedules'""")
        if not cur.fetchone():
            statements.append(
                "ALTER TABLE audit_headers ADD CONSTRAINT fk_audit_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE RESTRICT"
            )
    return statements


def apply(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT GET_LOCK('auditsector.scheduler', 0) AS acquired")
        if cur.fetchone()["acquired"] != 1:
            raise RuntimeError(
                "A scheduler pass is active; stop the worker before migrating"
            )
    try:
        statements = plan(
            conn
        )  # All data-dependent preflight checks happen before DDL.
        with conn.cursor() as cur:
            for statement in statements:
                cur.execute(statement)
            # Seed names required by the existing classifier, preserving custom tags.
            seed = Path(__file__).resolve().parents[1] / "scripts/init_tag_data.sql"
            cur.execute(seed.read_text())
        conn.commit()
        return len(statements)
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT RELEASE_LOCK('auditsector.scheduler')")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Apply after backing up the database"
    )
    args = parser.parse_args()
    conn = pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database=os.environ.get("DB_NAME", "auditsector"),
        cursorclass=pymysql.cursors.DictCursor,
    )
    with conn:
        if args.apply:
            print("Applied", apply(conn), "schema changes; predefined tags seeded")
        else:
            for statement in plan(conn):
                print(statement + ";")
            print("Also seeds missing predefined tags. No changes applied.")


if __name__ == "__main__":
    main()
