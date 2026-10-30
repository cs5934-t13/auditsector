# AuditSector

## Repository Structure
```
├── data: Data Layer
├── services: Application Layer
└── web: Presentation Layer
    ├── client: Web Front-End
    └── server: Web Back-End
```

## Development requirements

### Installing Podman

You can install either Podman Desktop (recommended) or the Podman CLI by itself:
- **[Podman Desktop](https://podman-desktop.io/)** ([installation instructions](https://podman-desktop.io/docs/installation)): This will install both the GUI and the CLI.
- **[Podman standalone CLI](https://podman.io/)** ([installation instructions](https://podman.io/docs/installation)): This includes only the CLI.

## Running locally

The project runs as a single Podman **pod**, so every container shares one
network namespace. That is what allows the client container to reach Flask at
`localhost:5000`, and Flask to reach MySQL at `127.0.0.1:3306`, without
publishing any port other than the client's.

```
Browser :8080 ──► client (nginx :80) ──/api/*──► server (flask :5000) ──► db (mysql :3306)
```

`pod.yaml` is the only complete run path: it starts all five containers and
injects the secrets that `server` and `data` require.

1. `cd` into the `auditsector` project root.
2. Build the client module
```
podman build -t client web/client
```
3. Build the server module
```
podman build -t server web/server
```
4. Build the services module
```
podman build -t services services
```
5. Build the data module as `db-init` — this tag must match `pod.yaml`
```
podman build -t db-init data
```
6. Update `secrets.yaml.template` with a MySQL Root Password and a Flask secret
   key, both encoded in base 64, and save as `secrets.yaml`
   - To convert a value to base 64, use `printf mypassword | base64 -i -`
7. Add the secrets to podman with `podman kube play secrets.yaml`
8. Remove any pod left over from an earlier run (name conflict), then run the pod
```
podman kube play --down pod.yaml
podman pod rm -f web
podman kube play --replace pod.yaml
```
9. The app should be available at http://localhost:8080/

### Verifying the pod

`podman ps -a --filter pod=web` should show `web-client`, `web-server`, `web-db`,
and `web-services` as `Up`, and `web-data` as `Exited (0)`.

`web-data` is a one-shot job that loads the schema and exits on success, so the
pod is reported as `Degraded` even when everything is working. Treat it as a
**failure only if `web-data` exits non-zero**, or if one of the long-running
containers is restarting.

```
web-client      Up
web-server      Up
web-db          Up
web-services    Up
web-data        Exited (0)     <-- expected
```

If a container keeps restarting, read its logs, for example `podman logs web-server`.
The server will not start without `FLASK_SECRET_KEY` and `MYSQL_ROOT_PASSWORD`.

### Stopping and resetting

```
podman kube play --down pod.yaml            # stop and remove the pod
podman volume rm 82a2ef700bc37dcb3ea3e2778cede5dd8edbf0d24c6f386b04e0215170d61187  # drop the MySQL data
podman secret rm mysql_root_password flask_secret_key                            # remove the secrets
```

The database lives in a persistent volume, so `--replace` alone keeps existing
data. Remove the volume when you want a clean schema and freshly seeded rows.

> Do not mix this flow with `podman pod create` / `podman run --pod web`. Those
> commands add unmanaged containers to the same pod, which then contend for the
> shared port 5000 and cause the pod to report `Degraded`. Note that `--down`
> only removes containers declared in `pod.yaml`; unmanaged ones survive and keep
> the pod alive, so use `podman pod rm -f web` to clear them.
