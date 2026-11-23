# Database Testing

To ensure your database is properly running in the web pod, you can run the following command.  
<br>

**The base containers [server, client, services, data] must be built prior to testing, and podman must be actively running.**  
<br>

You can then run the following command to automatically execute tests:
```
podman run --rm --restart=no --pod web \
  -e MYSQL_ROOT_PASSWORD="$(podman exec web-db printenv MYSQL_ROOT_PASSWORD)" \
  -v ./data/tests:/app:Z \
  -v ./data/authentication:/authentication:Z \
  -v ./data/scripts:/scripts:Z \
  localhost/db-test:latest
```
<br>

If `localhost/db-test:latest` does not exist yet, build it from the repository root:
```
podman build -f data/tests/Containerfile.test -t db-test data
```
<br>

### Notes on the command

- `-v ./data/tests:/app:Z` **replaces** the image's `/app` with the host copy, so
  test edits take effect without a rebuild. The image only installs
  `tests/requirements.txt` and the `authentication/` helper.
- The `authentication/` mount provides `authorization.py`, which `test_schema.py`
  imports.
- The `scripts/` mount provides `db_init.py`, which `test_db_init.py` imports via
  `sys.path`. That test resolves the scripts directory relative to its own
  location (`parents[1] / "scripts"`), which is `/scripts` once the tests are
  mounted at `/app`. Without this mount that module fails at collection with
  `ModuleNotFoundError: No module named 'db_init'`.
- `MYSQL_ROOT_PASSWORD` is read from the running `web-db` container, so the tests
  use the same credentials as the pod.
- The `:Z` suffix relabels the host directory for SELinux (Fedora/RHEL hosts);
  it is harmless on macOS.

### `requirements.txt`

This file lists only what the tests import: `pytest`, `PyMySQL`, `argon2-cffi`
(for `authentication/authorization.py`) and `cryptography`, pinned so PyMySQL's
TLS stack stays on a patched release. Keep it curated rather than pasting a
`pip freeze` of your machine: a previous version was a full Fedora freeze that
included `@ file:///builddir/...` packages, which made the image unbuildable.

### Schema drift

The tests run against the pod's live `auditsector` database. `init_*` scripts use
`CREATE TABLE IF NOT EXISTS`, so they never migrate a table that already exists.
A long-lived `db-volume` can therefore lack newer columns (for example
`audit_url` and `muni`) and the suite will fail with `Unknown column`. Rebuild the
volume before assuming a code bug (see the root `README.md`, *Stopping and
resetting*).

### Primary keys are UUIDs

`audit_headers.audit_id` is `CHAR(36)` with no default, so an insert must supply
one and `cur.lastrowid` cannot be used to read it back. Test fixtures generate a
`uuid4()` string instead. Tags, users and schedules still use auto-increment
integer keys.

<br>

The tests will verify the following:
- Database is running and accessible
- All auditsector tables are created
- Table relationships are instantiated
- Duplicate entries cannot be inserted
- Inserts, updates, and deletes behave as the schema's constraints require

The suite covers `test_audits.py`, `test_schedules.py`, `test_schema.py`,
`test_users.py`, and `test_db_init.py` (which checks SQL directory resolution and
needs no database connection).