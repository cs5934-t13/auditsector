# Data Layer

The data container initialises the MySQL schema and optionally seeds demo rows.
It is a **one-shot job**: it runs `scripts/db_init.py`, exits, and the pod keeps
running. Do not expect it to stay up.

## Build

The image tag must match the `data` container in `pod.yaml`:

```sh
podman build -t data data
```

## What it does

1. Connects to MySQL and creates the `auditsector` database if needed.
2. Runs the SQL files in `SQL_FILES` order:
   `init_users.sql`, `init_schedules.sql`, `init_audits.sql`,
   `init_tag_data.sql`, `init_settings.sql`, `init_fetches.sql`.
3. Appends `init_data.sql` when `LOAD_DUMMY_DATA=true`.

It retries the connection up to 30 times with a 2 second delay, so it survives
being started before MySQL is ready. Startup order in the pod is not guaranteed,
which is why the retry loop exists.

Every statement is `CREATE TABLE IF NOT EXISTS`, so re-running against an
existing volume is safe but **will not migrate** a table whose definition changed.
This is the usual cause of `Unknown column` errors after a schema change: the
container starts, exits `0`, and the old table survives untouched. Remove the
MySQL volume for a clean rebuild (see the root `README.md`, *Stopping and
resetting*).

For databases that must keep their data, `data/migrations/scheduler_fetcher.py`
inspects an existing schema and can add the columns and keys the scheduler needs;
run it without arguments to review the plan, then with `--apply`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | — (required) | MySQL root password |
| `DB_HOST` | `127.0.0.1` | MySQL host; works in the pod thanks to the shared network namespace |
| `DB_NAME` | `auditsector` | Database to create and populate |
| `LOAD_DUMMY_DATA` | unset | `true` loads `init_data.sql` |

The container declares no `EXPOSE`d port: it is a client of MySQL, not a server.
Only the `db` container serves MySQL (port `3306`).

## Schema

| File | Tables |
|---|---|
| `init_users.sql` | `users` |
| `init_schedules.sql` | `schedules` (FK → `users`) |
| `init_audits.sql` | `audit_headers`, `tags`, `audit_tags` |
| `init_tag_data.sql` | Seed tags (the initial, open tag set) |
| `init_settings.sql` | `app_settings` (single row, `settings_id = 1`) |
| `init_fetches.sql` | `fetches` (one row per downloaded report URL) |
| `init_data.sql` | demo rows, including a seeded user for tests |

`audit_headers.audit_id` is `CHAR(36)` and has no default, so the writer must
supply a UUID; `audit_url` is `TEXT NOT NULL` and holds the link to the report
PDF. Tags, users and schedules keep auto-increment integer keys.

`init_tag_data.sql` runs on every deployment, not only with
`LOAD_DUMMY_DATA=true`: the tags are seed data, not demo data. It uses
`INSERT IGNORE` against the unique `tags.name`, so re-running it never
duplicates rows and never removes tags users have added.

`init_settings.sql` only creates the table; it inserts no rows. `GET /settings`
creates the single row from the column defaults on first read, so an empty table
is the expected state after a fresh init.

See `authentication/` for the shared Argon2 password verification helper and
`tests/README.md` for schema verification.

## Tests

`tests/` verifies the schema. `EXPECTED_TABLES` in `tests/test_schema.py`
lists `app_settings`, and `test_settings_columns` asserts the settings column
set (including `contact`).


## Updating an existing database for AW-98

Back up the database and stop the scanning worker first. The inspect-only default
of `migrations/scheduler_fetcher.py` prints the required changes; `--apply` performs
them and seeds missing predefined tags. It preserves existing records and numeric
IDs as text, and refuses unresolved orphan reports, duplicate fetch receipts, or
legacy download-only records that need review before reuse.
Initialization SQL alone does not update existing tables. See the scheduler README.
