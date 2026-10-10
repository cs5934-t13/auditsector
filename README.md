# AuditSector

## Repository Structure
```
├── data: Data Layer
├── services: Application Layer
└── web: Presentation Layer
    ├── client: Web Front-End
    └── server: Web Back-End
```

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
1. Update secrets.yaml.template with a MySQL Root Password encoded in base 64 and save as secrets.yaml
2. Add the secrets to podman with `podman kube play secrets.yaml`
3. Run the pod with `podman kube --replace pod.yaml`
4. The app should be available at [[http://localhost:8080/]]
