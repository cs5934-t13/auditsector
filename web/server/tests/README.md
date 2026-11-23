# AW-26: Add Source integration tests

These checks exercise the current Flask `app.py` and real MySQL initialized from
the repository's current SQL. They do not depend on the scheduler or fetcher.
The existing frontend Node tests cover URL validation and simulated API responses;
these tests add real login/cookies and database persistence checks.

## Run the automated checks

With Podman running, from the repository root:

```sh
python3 web/server/tests/run_sources_integration.py
```

Requires Python 3 and Podman on the host. No host Python packages are installed.
The runner builds the current server image using its existing Containerfile and
requirements. Its base `python` image and `docker.io/library/mysql:latest` must
already be available locally (`--pull=never`); dependency installation during a
build requires network access unless cached. These match the project's existing
images; no new database version is selected here.

Every run creates a uniquely named `aw26-*` pod, a fresh in-memory MySQL instance,
and generated test credentials. MySQL has no published port or persistent volume.
No container joins the normal `web` pod. `secrets.yaml`, existing accounts, the
normal application database, and its volumes are not read or changed.

The tests require a marker matching this run before writing to a database.
Initialization also refuses a nonempty database. Do not run `test_sources.py`
directly inside an application container or reuse the marker in another database.

The runner removes its pod and temporary image tags on success or failure. Normal
Ctrl-C also runs cleanup. If the process is forcibly killed or Podman stops,
inspect the printed `aw26-*` name and remove only that test pod after confirming
its `auditsector.aw26` label. Never remove `web` or prune volumes for these tests.

## Automated coverage

- Actual `/login` establishes the Flask session used by `/sources`.
- A successful save returns 201 and the four documented fields.
- An independent MySQL connection verifies that the exact returned schedule was
  committed with the session user's ID, source URL, and selected frequency.
- Omitted frequency defaults to WEEKLY; all four accepted values and mixed/lower
  case inputs persist in uppercase.
- Matching/empty deprecated `user` parameters work; a different user returns 403.
- Anonymous requests, spoofed username headers/query/body, invalid cookies, and
  the cookie after logout cannot insert a schedule.
- Missing/invalid source, invalid frequency, and a deleted session user produce
  documented validation errors without inserting rows.
- Injected connection and commit failures produce a generic 500 without an
  inserted schedule. The real database is not stopped to simulate failures.
- Repeating a URL cannot insert a duplicate or change its frequency. The test
  deliberately does not prescribe an undocumented duplicate status code.

Fixtures remove schedules belonging to their own generated user IDs and then
those users. The runner checks for zero users, schedules, and audits before
optional browser setup, then removes the entire owned test environment. An outer
test transaction alone would not undo inserts committed by the API.

## Browser check through the real proxy and login

```sh
python3 web/server/tests/run_sources_integration.py --browser
```

This first runs the automated suite, builds the current frontend with its existing
Containerfile, and starts NGINX and Flask in the test pod. Choose a temporary test
password at the hidden terminal prompt; never paste it into a report or chat.
The account `aw26_browser` exists only in this test database. The runner binds
HTTP to `127.0.0.1:18082`; use `--port` if that port is occupied.

To include the Vite development proxy in the flow, start a separate terminal:

```sh
cd web/client/app
VITE_API_TARGET=http://127.0.0.1:18082 npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Open `http://127.0.0.1:5176/audits`, or use the built frontend directly at
`http://127.0.0.1:18082/audits`. Sign in with the temporary account. This is real
password login, session cookies, NGINX, Flask, and MySQL; no session injection or
success-response mocks are needed.

1. Enter `hello` and save. Expect the inline URL error and no saved schedule.
2. Cancel. Expect an empty URL and WEEKLY frequency.
3. Save a unique `.invalid` URL with WEEKLY. Expect a confirmation with that URL
   and frequency. Repeat with a different URL and MONTHLY.
4. Independently inspect MySQL through the printed test-server container, replacing
   `AW26_SERVER_NAME` below with its actual name:

   ```sh
   podman exec -w /aw26/tests AW26_SERVER_NAME python -c "from test_sources import assert_owned_database, query; assert_owned_database(); print(query('SELECT s.schedule_id, u.username, s.source_link, s.scan_frequency FROM schedules s JOIN users u ON u.user_id = s.created_by ORDER BY s.schedule_id'))"
   ```

5. Retry an already saved URL. With the current schema it must not add a second
   row or change the first row. Verify error feedback and preserved input.
6. Cancel, sign out, and reopen `/audits`. Expect the sign-in page. The automated
   no-cookie request checks separately establish that unauthorized writes fail.
7. Stop the separate Vite process if started, then Ctrl-C the test runner. It
   removes the test pod, including all browser records and the temporary account.

Client error/timeout handling also has simulated-response coverage in
`web/client/app/tests/sources-api.test.mjs`. Browser checks are manual and must be
reported separately from automated integration tests.

## Acceptance gaps to keep visible

The uploaded backlog's Add Source integration criterion additionally mentions
visibility in a sources list. Current main has neither a GET sources-list endpoint
nor a sources-list UI. These tests establish form confirmation and persistence;
they cannot demonstrate list visibility after reload. That item requires a team
acceptance decision or a separate list feature, and is not silently waived by a
passing suite. The existing saved schedule remains in MySQL after a page reload;
the form confirmation is transient UI state.

Current initialization SQL makes `schedules.source_link` unique, but the API
contract does not define a duplicate response. The current backend maps duplicate
inserts to its generic database-error response. Data integrity is tested; a more
specific duplicate policy remains a team/API decision. A 409 is a possible future
choice, not a requirement introduced by this test ticket.

The isolated environment uses current initialization SQL. It does not migrate an
older local `web-db` whose schema may differ. Results against the fresh schema
must not be presented as evidence that an older database has been upgraded.


## Recorded verification — November 11, 2026

Verified from main commit `4d4567a00ce709f7937769dc3457e31382ecd6e2`:

- All 13 automated integration tests passed in two separate fresh pods. Each run
  confirmed zero remaining fixture users, schedules, and audits before teardown.
- Main's existing 69 frontend tests and ESLint passed. The production frontend
  and server images built successfully using their current Containerfiles; the
  frontend build includes TypeScript checking.
- Real browser login through Vite (5176) -> NGINX (18082) -> Flask -> MySQL passed.
  WEEKLY and MONTHLY submissions returned 201 and were independently verified in
  MySQL under `aw26_browser`.
- Invalid browser input showed the inline error, generated no POST /api/sources
  request in NGINX logs, and left the schedules table empty.
- Cancel cleared the URL and restored WEEKLY. Editing the URL cleared previous
  success feedback.
- A duplicate returned the current generic 500, preserved the input, and neither
  inserted a row nor changed the existing frequency. Editing the URL and saving
  again recovered successfully.
- All three successful browser-created schedules persisted after page reload.
  The confirmation itself cleared, as expected for transient form state.
- A real no-cookie HTTP POST through NGINX returned 401 and inserted no schedule.
  Browser sign-out followed by reopening /audits reached the sign-in page.
- All owned test pods were removed, including their in-memory databases and
  browser records. Temporary test credentials and Vite process were removed.
  The normal application containers remained running.

These results do not demonstrate a sources-list UI, change the duplicate-response
contract, or migrate the normal database. Those limitations remain as described
above. AW-105 was still a separate review branch, so it was not included here.
