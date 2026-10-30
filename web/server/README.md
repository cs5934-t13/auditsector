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

| Browser request | Flask route |
|---|---|
| `GET /api/` | `/` — hello page |
| `GET /api/test` | `/test` |
| `POST /api/login` | `/login` |
| `POST /api/logout` | `/logout` |
| `POST /api/sources` | `/sources` |

`/login` returns `{"status": "approved"}` on success and
`{"status": "failed"}` with `401` otherwise. `GET /settings` and `PUT /settings`
are not implemented yet, so the client falls back to its default copy.

## Local development

```sh
cd web/server/app
pip install -r requirements.txt
FLASK_SECRET_KEY=dev-only MYSQL_ROOT_PASSWORD=dev-only flask run --port 5000
```

The Vite dev server proxies `/api` to this port with the same prefix stripping
(see `web/client/app/vite.config.ts`), so the front-end behaves identically in
development and in the pod.
