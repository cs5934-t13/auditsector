# Database Testing

To ensure your database is properly running in the web pod, you can run the following command.  
<br>

**The base containers [server, client, services, data] must be built prior to testing, and podman must be actively running.**  
<br>

You can then run the following command to automatically execute tests:
```
podman run --rm --pod web \
  -e MYSQL_ROOT_PASSWORD="$(podman exec web-db printenv MYSQL_ROOT_PASSWORD)" \
  -v ./data/tests:/app:Z \
  localhost/db-test:latest
```
<br>

The tests will verify the following:
- Database is running and accessible
- All auditsector tables are created
- Table relationships are instantiated
- Duplicate entries cannot be inserted