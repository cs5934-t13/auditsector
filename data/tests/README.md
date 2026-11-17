# Database Testing

To ensure your database is properly running in the web pod, you can run the following command.  
<br>

**The base containers [server, client, services, data] must be built prior to testing, and podman must be actively running.**  
<br>

You can then run the following command to automatically execute tests:
```
podman run --rm --restart=no --pod web \
  -e MYSQL_ROOT_PASSWORD="$(podman exec web-db printenv MYSQL_ROOT_PASSWORD)" \
  -v ./data/tests:/app:Z \
  -v ./data/authentication:/authentication:Z \
  localhost/db-test:latest
```
<br>

If `localhost/db-test:latest` does not exist yet, build it from the repository root:
```
podman build -f data/tests/Containerfile.test -t db-test data
```
<br>

### Notes on the command

- `-v ./data/tests:/app:Z` **replaces** the image's `/app` with the host copy, so
  test edits take effect without a rebuild. The image only installs
  `tests/requirements.txt` and the `authentication/` helper.
- The second mount provides `authorization.py`, which `test_schema.py` imports.
- `MYSQL_ROOT_PASSWORD` is read from the running `web-db` container, so the tests
  use the same credentials as the pod.
- The `:Z` suffix relabels the host directory for SELinux (Fedora/RHEL hosts);
  it is harmless on macOS.

<br>

The tests will verify the following:
- Database is running and accessible
- All auditsector tables are created
- Table relationships are instantiated
- Duplicate entries cannot be inserted