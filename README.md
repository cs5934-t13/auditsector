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

1. `cd` into the `auditsector` project root.
2. Build the client module 
```
podman build -t client /web/client
```
3. Build the server module
```
podman build -t server /web/server
```
4. Build the services module
```
podman built -t services /services
```
5. Update secrets.yaml.template with a MySQL Root Password encoded in base 64 and save as secrets.yaml
6. Add the secrets to podman with `podman kube play secrets.yaml`
7. Run the pod with `podman kube --replace pod.yaml`
8. The app should be available at http://localhost:8080/
