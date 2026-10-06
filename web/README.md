# Presentation Layer

## Local building and deployment

The client and server containers can be deployed in a single Podman pod.

### Installing Podman

You can install either Podman Desktop (recommended) or the Podman CLI by itself:
- **[Podman Desktop](https://podman-desktop.io/)** ([installation instructions](https://podman-desktop.io/docs/installation)): This will install both the GUI and the CLI.
- **[Podman standalone CLI](https://podman.io/)** ([installation instructions](https://podman.io/docs/installation)): This includes only the CLI.

### Building and running the AuditSector web module

These instructions use the CLI. Once the container images are built, you can also use the Podman Desktop GUI to create the pod and run the images in it.

1. `cd` into the `auditsector` project root.
2. Build the client module 
```
podman build -t client /web/client
```
3. Build the server module
```
podman build -t server /web/server
```
4. Create the pod that directs the host's port 8080 to the pod's port 80 
```
podman pod create -p 8080:80 web
```
5. Start the client module inside the web pod in detached mode
```
podman run --pod web -d client
```
6. Start the server module inside the web pod in detached mode
```
podman run --pod web -d server
```
7. Now that client and server are running, you can access the application in your browser at [http://localhost:8080].
