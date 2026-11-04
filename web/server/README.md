# Web Back-End

The web/server container runs a flask application from the /app folder. 

As a standalone app, it runs on <http://localhost:5000>.

Within the pod, it runs on localhost:5000, but the client nginx server proxies it to <http://localhost:8080/api>.

## Why `localhost` works

Podman pods share a single network namespace, so every container in the pod sees
the same loopback interface. That is why nginx can proxy to
`http://localhost:5000` with no published port for this container, and why
`get_db_connection()` in `app/hello.py` can reach MySQL at `127.0.0.1:3306`.
Outside a pod, neither of those addresses resolves to a sibling container.

## Required environment variables

The application fails at import time or on the first request without these:

| Variable | Used by | Behaviour when missing |
|---|---|---|
| `FLASK_SECRET_KEY` | `app.secret_key` | `KeyError` at startup — the process exits |
| `MYSQL_ROOT_PASSWORD` | `get_db_connection()` | `KeyError` on the first database request |

`pod.yaml` supplies both from Podman secrets. To run the container by hand:

```sh
podman run --pod web -d --name web-server \
  -e FLASK_SECRET_KEY=dev-only \
  -e MYSQL_ROOT_PASSWORD=dev-only \
  localhost/server:latest
```

Database host and name are currently hard-coded in `get_db_connection()`
(`127.0.0.1`, database `auditsector`), unlike the data layer, which reads
`DB_HOST` and `DB_NAME`.

## Routes

`proxy_pass http://localhost:5000/;` in `web/client/web.conf` **strips** the
`/api/` prefix, so the Flask routes have no prefix:

| Browser request | Flask route | Auth |
|---|---|---|
| `GET /api/` | `/` — hello page | none |
| `GET /api/test` | `/test` | none |
| `POST /api/login` | `/login` | none |
| `POST /api/logout` | `/logout` | none |
| `GET /api/session` | `/session` | none (reports signed-in state) |
| `GET /api/settings` | `/settings` | none |
| `PUT /api/settings` | `/settings` | session + `ADMIN` |
| `POST /api/sources` | `/sources` | session |

`/login` returns `{"status": "approved", "role": "ADMIN" | "ANALYST"}` on
success and `{"status": "failed"}` otherwise. Roles come from `user_role` on
the `users` table; inactive accounts are rejected with `403` even when the
password is correct.

### `GET /session` is the source of truth

The client must not derive the signed-in user or their role from anything it
stores in the browser: `sessionStorage` is writable from developer tools, so a
forged `role: "ADMIN"` would render administrator screens. Instead the client
calls `/session` on load and trusts only the answer:

```json
{ "data": { "authenticated": true, "username": "ferguszo", "role": "ADMIN" } }
```

```json
{ "data": { "authenticated": false } }
```

The role is re-read from the database on every call rather than taken from the
session cookie, so a role change or deactivation applies immediately and also
invalidates the session when the account is no longer `ACTIVE`.

### Authorization

Two decorators in `hello.py`:

| Decorator | Rejects with | Used by |
|---|---|---|
| `@login_required` | `401` when there is no session | `/sources` |
| `@admin_required` | `401` without a session, `403` when the *current* role is not `ADMIN` | `PUT /settings` |

`@admin_required` re-reads `user_role` and `user_status` from the database on
every request rather than trusting the session snapshot taken at login. Using
the snapshot would let a demoted or deactivated administrator keep writing until
their cookie expired — up to `PERMANENT_SESSION_LIFETIME` (8 hours). A
deactivated or deleted account has its session cleared and receives `401`.

`/sources` takes the schedule owner from `session["username"]`. The `?user=`
parameter is deprecated: if supplied it must match the signed-in user, otherwise
the request fails with `403 USER_MISMATCH`. Before this, any unauthenticated
caller could create a schedule attributed to any user.

**What is not possible**, all verified against a real `ANALYST` session:

- Naming an admin via `?user=`, a JSON `username`/`role` field, a spoofed
  `session` cookie, or `X-Forwarded-User` / `X-Remote-User` headers → `403`.
- Tampering with the session cookie → signature fails, request is anonymous.
- Logging in as another user requires that user's password; there is no way to
  request a role at login (a `role` field in the login body is ignored).

### Prefix stripping and `X-Forwarded-Prefix`

The trailing `/` in `proxy_pass http://localhost:5000/;` is what strips the
prefix: nginx replaces the matched location (`/api/`) with `/`. Removing that
slash would forward `/api/login` unchanged, which 404s against the routes above.

Because the app never sees `/api`, it cannot build correct absolute URLs on its
own. nginx therefore reports the stripped prefix, and `hello.py` wraps the WSGI
app in `ProxyFix(app.wsgi_app, x_prefix=1)`:

```nginx
proxy_set_header X-Forwarded-Prefix /api;
```

That makes `request.script_root` equal `/api` and makes `url_for()` produce
`/api/login` instead of `/login`. Verified behaviour:

| Context | `request.script_root` | `url_for("login_user")` |
|---|---|---|
| Directly on port 5000 (no header) | `""` | `/login` |
| Behind nginx / Vite (header set) | `/api` | `/api/login` |

So `redirect()` and `url_for()` are safe to use — they emit URLs the browser
can follow. The Vite dev proxy sets the same header (`vite.config.ts`).

Only `x_prefix` is enabled in `ProxyFix`. Enabling `x_for` or `x_host` would let
an untrusted caller spoof its own address or host, since there is no
`trusted_proxies` allow-list here.

### Error responses

An `HTTPException` handler in `hello.py` returns JSON for API requests and
leaves normal page loads alone (`_wants_json()` checks `request.script_root`):

```json
{ "error": { "code": "NOT_FOUND", "message": "The requested URL was not found on the server." } }
```

This matters because `fetchAppSettings()` and `LoginCard` call `response.json()`.
Before this handler, a typo such as `/api/loginn` returned `index.html` as
`200 text/html`, and the client reported a `SyntaxError` instead of a real
HTTP failure.

### Known limitation: sessions cannot be revoked

Flask's default sessions are **client-side and signed, not stored**. `POST
/logout` clears the cookie in the browser, but a cookie captured before logout
remains valid until it expires (`PERMANENT_SESSION_LIFETIME`, 8 hours) because
there is no server-side record to invalidate. Verified by replaying a
pre-logout cookie against `/session`.

Consequences:

- Signing out does not protect a user whose cookie was already stolen.
- Changing your password does not terminate existing sessions.

Fixes, in increasing order of effort: a `session_version` integer column
compared on each request; a server-side session store (Redis, a MySQL table);
or Flask-Session. `_current_role()` is the natural place to add the version
check, since it already runs per request.

## Local development

```sh
cd web/server/app
pip install -r requirements.txt
FLASK_SECRET_KEY=dev-only MYSQL_ROOT_PASSWORD=dev-only flask run --port 5000
```

The Vite dev server proxies `/api` to this port with the same prefix stripping
(see `web/client/app/vite.config.ts`), so the front-end behaves identically in
development and in the pod.
