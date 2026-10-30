# Data Layer

The data container initialises the MySQL schema and optionally seeds demo rows.
It is a **one-shot job**: it runs `scripts/db_init.py`, exits, and the pod keeps
running. Do not expect it to stay up.

## Build

The tag must match `pod.yaml`, which references `localhost/db-init:latest`:

```sh
podman build -t db-init data
```

## What it does

1. Connects to MySQL and creates the `auditsector` database if needed.
2. Runs `scripts/init_users.sql`, `scripts/init_schedules.sql`, and
   `scripts/init_audits.sql` in that order.
3. Appends `scripts/init_data.sql` when `LOAD_DUMMY_DATA=true`.

It retries the connection up to 30 times with a 2 second delay, so it survives
being started before MySQL is ready. Startup order in the pod is not guaranteed,
which is why the retry loop exists.

Every statement is `CREATE TABLE IF NOT EXISTS`, so re-running against an
existing volume is safe but **will not migrate** a table whose definition changed.
Remove the MySQL volume for a clean rebuild (see the root `README.md`).

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | — (required) | MySQL root password |
| `DB_HOST` | `127.0.0.1` | MySQL host; works in the pod thanks to the shared network namespace |
| `DB_NAME` | `auditsector` | Database to create and populate |
| `LOAD_DUMMY_DATA` | unset | `true` loads `init_data.sql` |

The container does not declare an `EXPOSE`d port and is not reachable from the
host; only the `db` container serves MySQL.

## Schema

| File | Tables |
|---|---|
| `init_users.sql` | `users` |
| `init_schedules.sql` | `schedules` (FK → `users`) |
| `init_audits.sql` | `audit_headers`, `tags`, `audit_tags` |
| `init_data.sql` | demo rows, including a seeded user for tests |

See `authentication/` for the shared Argon2 password verification helper and
`tests/README.md` for schema verification.
