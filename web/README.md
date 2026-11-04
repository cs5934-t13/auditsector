# Presentation Layer

## Local building and deployment

The client and server containers can be deployed in a single Podman pod.

### Installing Podman

You can install either Podman Desktop (recommended) or the Podman CLI by itself:
- **[Podman Desktop](https://podman-desktop.io/)** ([installation instructions](https://podman-desktop.io/docs/installation)): This will install both the GUI and the CLI.
- **[Podman standalone CLI](https://podman.io/)** ([installation instructions](https://podman.io/docs/installation)): This includes only the CLI.

### Building and running the AuditSector web module

These instructions use the CLI. Once the container images are built, you can also use the Podman Desktop GUI to create the pod and run the images in it.

The client and server communicate over the pod's shared network namespace: nginx
proxies `/api/` to `http://localhost:5000/`, which resolves to the Flask container
because all containers in a pod share one loopback interface. Requirements for
each service are listed in the table below.

| Service | Image | Listens on | Needs |
|---|---|---|---|
| client | `localhost/client:latest` | `80` (published as host `8080`) | nothing |
| server | `localhost/server:latest` | `5000` | `FLASK_SECRET_KEY`, `MYSQL_ROOT_PASSWORD`, a running `db` |
| db | `docker.io/library/mysql:latest` | `3306` | `MYSQL_ROOT_PASSWORD` |

```
Browser :8080 ──► client (nginx :80) ──/api/*──► server (flask :5000) ──► db (mysql :3306)
```

> **The web module needs a database.** `web/server/app/hello.py` reads
> `FLASK_SECRET_KEY` at import time and opens a MySQL connection using
> `MYSQL_ROOT_PASSWORD`. Starting the server on its own fails immediately with
> `KeyError: 'FLASK_SECRET_KEY'`, and even with the secrets set, login returns a
> server error because there is nothing at `127.0.0.1:3306`. Use the root
> `README.md` flow (`podman kube play pod.yaml`), which starts the front-end, the
> back-end, and the database together.

## Running the full stack (recommended)

From the `auditsector` project root:

1. Build the images. The data image must be tagged `db-init` to match `pod.yaml`.
```
podman build -t client web/client
podman build -t server web/server
podman build -t services services
podman build -t db-init data
```
2. Create `secrets.yaml` from `secrets.yaml.template`, supplying **both**
   `mysql_password` and `secret_key` as base 64, then load it. Encode with
   `printf '%s' value | base64` — `echo` adds a newline that becomes part of the
   password.
```
podman kube play secrets.yaml
podman secret ls          # expect mysql_root_password AND flask_secret_key
```
3. Run the pod. This binds host port `8080` to the client container's port `80`.
```
podman kube play --replace pod.yaml
```
4. Access the application at <http://localhost:8080>.

## Running only the client and server (no database)

This is useful for front-end work, but sign-in will not work. Build your own
secrets and pass them with `-e`:

1. `cd` into the `auditsector` project root.
2. Build the client and server modules
```
podman build -t client web/client
podman build -t server web/server
```
3. Create the pod that directs the host's port 8080 to the pod's port 80
```
podman pod create --name web -p 8080:80
```
4. Start the client module inside the web pod in detached mode
```
podman run --pod web -d --name web-client client
```
5. Start the server module inside the web pod in detached mode. Both secrets are
   required, even for this reduced setup.
```
podman run --pod web -d --name web-server \
  -e FLASK_SECRET_KEY=dev-only \
  -e MYSQL_ROOT_PASSWORD=dev-only \
  server
```
6. Now that client and server are running, you can access the static app in your
   browser at <http://localhost:8080>. Requests under `/api/` are proxied to the
   server, but any endpoint that touches MySQL will fail.

To tear this down:
```
podman pod rm -f web
```
