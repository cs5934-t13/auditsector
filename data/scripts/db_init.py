import os
import time
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT

HOST = os.environ.get("DB_HOST", "")
DB_NAME = os.environ.get("DB_NAME", "auditsector")

SQL_FILES = [
    "init_users.sql",
    "init_schedules.sql",
    "init_audits.sql",
    # Runs after init_audits.sql creates the `tags` table. The tag set is seed
    # data, not demo data, so every deployment gets it.
    "init_tag_data.sql",
    "init_settings.sql",
    "init_fetches.sql",
]

if os.environ.get("LOAD_DUMMY_DATA") == "true":
    SQL_FILES.append("init_data.sql")

def connect_db(database=None, retries=30, delay=2):
    for attempt in range(retries):
        try:
            return pymysql.connect(
                host=HOST,
                user="root",
                password=os.environ["MYSQL_ROOT_PASSWORD"],
                database=database,
                cursorclass=pymysql.cursors.DictCursor,
                client_flag=CLIENT.MULTI_STATEMENTS,
            )
        except pymysql.err.OperationalError as e:
            if attempt == retries - 1:
                raise
            time.sleep(delay)


def init_db(sql_dir):
    sql_dir = Path(sql_dir)

    # Fail with one clear message instead of a traceback partway through the
    # seed files, which would leave the database partially initialized.
    missing = [name for name in SQL_FILES if not (sql_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"Missing SQL files in {sql_dir}: {', '.join(missing)}. "
            "Looked for the copy made by the Containerfile "
            "(COPY scripts/*.sql ./sql/); set SQL_DIR to override."
        )

    # 1. Make sure the database exists
    with connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
        conn.commit()

    # 2. Run the SQL files inside it
    with connect_db(DB_NAME) as conn:
        with conn.cursor() as cur:
            for name in SQL_FILES:
                # `CREATE TABLE IF NOT EXISTS` never alters an existing table, so
                # a database created before a column was introduced keeps the old
                # shape and this file's INSERT would fail on the unknown column.
                # Apply the late columns before each file, so by the time
                # init_tag_data.sql runs the tags table already has them.
                _add_missing_columns(cur)

                cur.execute((sql_dir / name).read_text())
                while cur.nextset():
                    pass
        conn.commit()


#: Columns added after the original table definitions. `CREATE TABLE IF NOT
#: EXISTS` never alters an existing table, so these are applied explicitly.
#: Each entry is `(table, column, definition)`; the definition must be safe to
#: add to a populated table (nullable, or NOT NULL with a DEFAULT).
LATE_COLUMNS = [
    ("tags", "description", "TEXT NULL"),
    ("tags", "boundary", "TEXT NULL"),
    (
        "app_settings",
        "contact",
        "VARCHAR(2000) NOT NULL "
        "DEFAULT '<p>Contact us at "
        '<a href="mailto:team@auditsector.example">team@auditsector.example</a>'
        ".</p>'",
    ),
    # Existing reports predate these. The server only selects them when present
    # and the client turns an empty URL into "no link", so backfilling with the
    # column default is safe. audit_url has no DEFAULT clause because TEXT
    # columns are backfilled with '' when added as NOT NULL.
    ("audit_headers", "muni", "VARCHAR(255) NOT NULL DEFAULT ''"),
    ("audit_headers", "audit_url", "TEXT NOT NULL"),
]


def _existing_columns(cur, table):
    """Column names currently on `table` in the active database."""
    cur.execute(
        """
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s;
        """,
        (table,),
    )
    return {row["COLUMN_NAME"] for row in cur.fetchall()}


def _add_missing_columns(cur):
    """Adds any `LATE_COLUMNS` absent from the database.

    Brings a legacy database up to the shape the seed files expect, so an
    existing deployment ends up with the same tag columns as a fresh one.
    """
    for table, column, definition in LATE_COLUMNS:
        cur.execute("SHOW TABLES LIKE %s", (table,))
        if cur.fetchone() is None:
            # Table is created by a seed file that has not run yet, or this is a
            # database this script does not own; leave it alone.
            continue

        if column in _existing_columns(cur, table):
            continue

        cur.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")


def _sql_dir_for(script_dir):
    """Picks the SQL directory for a given script directory.

    Split out from `resolve_sql_dir` so both layouts can be unit-tested without
    touching the real filesystem.
    """
    nested = Path(script_dir) / "sql"
    if nested.is_dir():
        return nested
    return Path(script_dir)


def resolve_sql_dir():
    """Locates the directory holding the seed SQL files.

    The two layouts that must both work:

    * Container image — `data/Containerfile` sets `WORKDIR /app`, copies
      `db_init.py` to `/app/`, and copies `scripts/*.sql` into `/app/sql/`.
      So the files are at `<script dir>/sql`.
    * Repository / local run — `db_init.py` and the `.sql` files sit side by
      side in `data/scripts/`. So the files are at `<script dir>` itself.

    The nested directory wins when it exists, because that is the packaged
    layout. `SQL_DIR` overrides both (for example a mounted volume).

    The previous hardcoded `/sql` matched neither layout: the image has no
    `/sql`, so every run raised FileNotFoundError before executing a single
    file and no seed data (including the tag list) was ever applied.
    """
    override = os.environ.get("SQL_DIR")
    if override:
        return Path(override)

    return _sql_dir_for(Path(__file__).resolve().parent)


if __name__ == "__main__":
    init_db(resolve_sql_dir())
