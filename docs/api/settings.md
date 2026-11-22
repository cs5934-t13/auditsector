# GET / PUT /settings API Contract

## Purpose

Read and update the organization-wide text shown throughout the application.
The values are stored in the single-row `app_settings` table
(`data/scripts/init_settings.sql`) and are the source of truth for the header
locality, the "Forgot password?" message, the Help section on the Settings
page, and the footer's Contact column.

`organization_name` is plain text. `password_reset_message`, `general_help`, and
`contact` are **rich text**: a small, validated subset of HTML so an
administrator can apply formatting in the Settings editor.

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
    "password_reset_message": "<p>To reset your password, contact the administrators.</p>",
    "general_help": "<p>For help using Audit Sector, review the guidance below or contact your administrator.</p>",
    "contact": "<p>Contact us at <a href=\"mailto:team@auditsector.example\">team@auditsector.example</a>.</p>"
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
  "password_reset_message": "<p>Contact the <strong>help desk</strong>.</p>",
  "general_help": "<p>Start with Audit Reports.</p>",
  "contact": "<p><a href=\"mailto:helpdesk@example.gov\">helpdesk@example.gov</a></p>"
}
```

| Field | Type | Constraints |
|---|---|---|
| `organization_name` | string | plain text; non-empty, ≤ 2000 characters |
| `password_reset_message` | string | rich text; non-empty, ≤ 2000 characters |
| `general_help` | string | rich text; non-empty, ≤ 2000 characters |
| `contact` | string | rich text; non-empty, ≤ 2000 characters |

### Rich text

The three rich-text fields accept this subset of HTML and nothing else:

| Tag | Attributes |
|---|---|
| `p`, `br` | — |
| `strong`, `b`, `em`, `i`, `u` | — |
| `ul`, `ol`, `li` | — |
| `a` | `href` — must start with `http://`, `https://`, `mailto:`, `#`, or `/` |

Validation is a **reject**, not a rewrite: a value containing any other tag or
attribute is refused with `400 INVALID_SETTINGS` naming the offending construct.
That is deliberate — silently stripping markup would discard an administrator's
formatting and is where sanitizer bypasses hide.

Plain text remains valid (it has no tags), so rows written before rich text
existed still save. On read, the client converts a tag-free value to HTML so
line breaks survive, and re-sanitizes every value before rendering: a row edited
directly in the database cannot inject markup.

A visually empty value — `<p></p>`, `<p><br></p>`, `<p>&nbsp;</p>` — is rejected
the same way an empty string is.

The Settings editor also exposes an **HTML** view, so an administrator can paste
source directly. The client sanitizes that source when the field loses focus and
again before saving, so the request body still matches the table above; a value
the editor cannot repair (for example a list inside a paragraph) is rejected by
the rules in this section.

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
