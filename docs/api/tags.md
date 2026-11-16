# Create a tag (AW-89)

`POST /api/tag` through NGINX; Flask route: `/tag`.
Requires the existing authenticated Flask session cookie.

Send JSON with a `name` string. Surrounding whitespace is trimmed; the stored
name must contain 1–100 characters, matching the existing database column.

```json
{"name": "Procurement"}
```

Success: **201 Created**.

```json
{"data": {"tag_id": 11, "name": "Procurement"}}
```

- **400 INVALID_TAG:** malformed/missing JSON, wrong name type, blank or too long.
- **401:** existing authentication response, `{"status":"failed","reason":"authentication required"}`.
- **409 TAG_EXISTS:** the database's unique-name constraint rejects a duplicate.
  Case/accent equivalence follows the database collation; no duplicate is inserted.
- **500 INTERNAL_SERVER_ERROR:** `Unable to create tag`; internal details are omitted.

400/409/500 use `{"error":{"code":"…","message":"…"}}`.
The JSON shape and 409 response are AW-89 implementation choices; the backlog
requires persistence and duplicate prevention without specifying those details.

This creates a flat tag in the existing table. It does not assign the tag to a
report, create a category hierarchy, or change the classifier's predefined list.
Existing `GET /api/tag` and `GET /api/tag/<tag_id>` remain available.

Focused tests (with existing server dependencies):
`PYTHONPATH=web/server/app FLASK_SECRET_KEY=test-only python3 -m unittest discover -s web/server/tests -p test_tags.py -v`.
The real-MySQL cases run inside AW-26's disposable runner and require its owned
run marker; they are skipped when running only the isolated unit checks.
