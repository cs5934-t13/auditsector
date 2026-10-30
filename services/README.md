# Application Layer

The `services` container is a long-running worker placeholder. `Containerfile`
builds from `ghcr.io/astral-sh/uv:debian-slim`, copies the whole directory to
`/services`, and runs `services/test/test.py`.

## Build and run

```sh
podman build -t services services
podman run --pod web -d --name web-services services
```

## Current behaviour

`test/test.py` is a stub: it prints `Debian is running` every 10 seconds and does
nothing else. It is started by `pod.yaml` so the container is present in the pod,
but it is **not required for the web UI** — the client, server, and database do
all the work.

```
services/
├── Containerfile
└── test/test.py      # placeholder loop
```

When the scanning workers are implemented, they belong here: this layer is meant
to read due rows from `schedules` and process each `source_link` at its
`scan_frequency`.
