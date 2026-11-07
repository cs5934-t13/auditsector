# GET / PUT /settings API Contract

## Purpose

Read and update the organization-wide text shown throughout the application.
The values are stored in the single-row `app_settings` table
(`data/scripts/init_settings.sql`) and are the source of truth for the header
locality, the "Forgot password?" message, and the Help section on the Settings
page.

## GET /settings

**Method:** `GET`  
**Path:** `/settings`  
**Auth:** None. The sign-in page shows the organization name and reset message
before a session exists.

### Successful Response

**Status:** `200 OK`

```json
{
  "data": {
    "organization_name": "City of Alexandria",
    "password_reset_message": "To reset your password, contact the administrators.",
    "general_help": "For help using AuditSector, review the guidance below or contact your administrator."
  }
}
```

If the row does not exist yet it is created from the column defaults on first
read, so this endpoint never returns an empty object.

## PUT /settings

**Method:** `PUT`  
**Path:** `/settings`  
**Auth:** Session required, role `ADMIN`. Missing session returns `401`;
a non-admin session returns `403 FORBIDDEN`.

### Request Body

Any subset of the fields below. Unknown fields and an entirely empty body are
rejected rather than silently ignored.

```json
{
  "organization_name": "City of Alexandria",
  "password_reset_message": "Contact the help desk.",
  "general_help": "Start with Audit Reports."
}
```

| Field | Type | Constraints |
|---|---|---|
| `organization_name` | string | non-empty, ≤ 2000 characters |
| `password_reset_message` | string | non-empty, ≤ 2000 characters |
| `general_help` | string | non-empty, ≤ 2000 characters |

### Successful Response

**Status:** `200 OK` — the full settings object after the update, in the same
shape as `GET /settings`.

### Error Responses

```json
{
  "error": {
    "code": "INVALID_SETTINGS",
    "message": "'organization_name' must not be empty."
  }
}
```

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Administrator access is required."
  }
}
```

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to connect to or update the database."
  }
}
```

## Notes

- The prefix `/api` is added by the browser and stripped by nginx; see
  `web/server/README.md`. The paths above are the Flask routes.
- The role used for authorization comes from the session, which is populated at
  login. A role change in the database takes effect on the next sign-in.
- The client (`web/client/app/src/api/settings.ts`) accepts the response either
  wrapped in `data` or as a bare object.
