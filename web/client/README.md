# Web Front-End

The React client lives in `app/`. See `app/README.md` for development and checks.

Build from the repository root using `podman build -t client web/client`.
The Containerfile installs dependencies and builds React in a Node 24 stage,
then copies only the output into nginx. nginx listens on port 80 and forwards
`/api/*` to Flask at `localhost:5000/*`, removing the `/api` prefix.
The deployment relies on the existing shared pod network.
