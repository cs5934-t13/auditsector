# User Management API Contract

## Purpose

Create, read, edit and archive the accounts that can sign in to Audit Sector.
Two audiences share one implementation:

- **Administrators** manage every account: add people, change any property
  without changing the `user_id`, archive (soft-delete) an account, and restore
  it later.
- **Regular users** manage their own account: name, e-mail, username and
  password.

Archiving never deletes a row. The account is set to `INACTIVE`, which blocks
sign-in immediately (`POST /login` rejects any account that is not `ACTIVE`)
while keeping historical references such as `schedules.created_by` valid.

**The signed-in administrator's own account is protected.** They cannot change
their own role away from `ADMIN`, and cannot archive or deactivate themselves,
through any endpoint. This prevents an administrator from accidentally locking
themselves (and possibly everyone) out of the admin area.

## Authorization summary

| Endpoint | Anonymous | Analyst | Admin |
|---|---|---|---|
| `GET /user` | 401 | 403 | 200 (list) |
| `POST /user` | 401 | 403 | 201 (created) |
| `GET /user/<id>` | 401 | 200 only for self, else 403 | 200 |
| `PUT /user/<id>` | 401 | 200 only for self (profile fields only) | 200 |
| `DELETE /user/<id>` | 401 | 403 | 200 (archived) |
| `POST /user/<id>/restore` | 401 | 403 | 200 (active) |
| `GET /profile` | 401 | 200 | 200 |
| `PUT /profile` | 401 | 200 (profile fields only) | 200 |

The role used for these decisions is re-read from the database on every request
(see `@admin_required` in `web/server/app/app.py`), so a demotion or archive
takes effect immediately rather than when the cookie expires.

## The user object

Every response returns the same shape, wrapped in `data`. `password_hash` is
never selected and never returned.

```json
{
  "data": {
    "user_id": 2,
    "first_name": "Avery",
    "last_name": "Smith",
    "email": "asmith@example.gov",
    "username": "asmith",
    "user_role": "ANALYST",
    "user_status": "ACTIVE",
    "created_at": "2026-01-02T03:04:05",
    "updated_at": "2026-01-02T03:04:05"
  }
}
```

| Field | Notes |
|---|---|
| `user_id` | Immutable. Assigned by the database; never accepted in a payload. |
| `user_role` | `ADMIN` or `ANALYST`. Accepts `role` as an alias on input. |
| `user_status` | `ACTIVE` or `INACTIVE` (archived). Accepts `status` as an alias. |

## `GET /user`

**Auth:** session + `ADMIN`.

Lists accounts. Archived accounts are omitted unless
`?include_inactive=true` is passed, which the Manage Users screen does so it can
offer a Restore action.

```json
{ "data": [ { "user_id": 1, "username": "admin", "...": "..." } ] }
```

## `POST /user`

**Auth:** session + `ADMIN`.

```json
{
  "first_name": "Avery",
  "last_name": "Smith",
  "email": "asmith@example.gov",
  "username": "asmith",
  "password": "initial-password",
  "user_role": "ANALYST",
  "user_status": "ACTIVE"
}
```

All seven fields are required; `first_name`/`last_name`/`email`/`username` must
be non-blank and within the column limits (100/100/255/100). The password is
hashed with Argon2 before it is stored.

**Status:** `201 Created` — the stored user object.

| Status | Code | Meaning |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not an administrator. |
| 409 | `USER_ALREADY_EXISTS` | Username or e-mail already taken. |
| 422 | `INVALID_USER` | A field is missing, blank, too long, or not in the enum. |

## `PUT /user/<id>`

**Auth:** session. Administrators may edit anyone; an analyst may edit only
themselves and only profile fields.

Any subset of `first_name`, `last_name`, `email`, `username`, `password`,
`user_role`, `user_status`. Omitted fields are left untouched. `user_id` is
taken from the URL only, so a payload cannot move a record to another id. An
empty payload is rejected with `422`.

Rules:

- An analyst sending `user_role` or `user_status` gets `403`, so they cannot
  promote or reactivate themselves.
- An administrator cannot demote or archive their own account (`422`), which
  would otherwise lock them out of the admin area. This holds for both input
  spellings (`user_role`/`role`, `user_status`/`status`) and on `PUT /profile`
  as well as `PUT /user/<self>`, since both share one implementation.
- When an analyst changes their own password, `current_password` is required
  (`422 CURRENT_PASSWORD_REQUIRED`) and must match
  (`422 INVALID_CURRENT_PASSWORD`). An administrator resetting somebody else's
  password does not need it.

**Status:** `200 OK` — the updated user object.

## `DELETE /user/<id>`

**Auth:** session + `ADMIN`.

Archives the account by setting `user_status` to `INACTIVE`. The row and its
history are kept.

**Status:** `200 OK`

```json
{ "data": { "user_id": 2, "user_status": "INACTIVE" } }
```

| Status | Code | Meaning |
|---|---|---|
| 404 | `USER_NOT_FOUND` | No active user with that id. |
| 422 | `INVALID_USER` | Attempted to archive the signed-in account. |

## `POST /user/<id>/restore`

**Auth:** session + `ADMIN`. Sets an archived account back to `ACTIVE`.

**Status:** `200 OK` — `{ "data": { "user_id": 2, "user_status": "ACTIVE" } }`.
Returns `404 USER_NOT_FOUND` when the account is not archived.

## `GET /profile` and `PUT /profile`

**Auth:** session (any role).

Self-service equivalents of `GET /user/<self>` and `PUT /user/<self>`. They
share the same implementation, so an analyst cannot reach admin-only fields by
switching endpoints. Use `/profile` when the caller does not know their own
`user_id`; the client does exactly that on the Settings page.

`PUT /profile` with a new `username` updates the session's stored username, so
the session stays valid after a self-rename.

## Notes

- The prefix `/api` is added by the browser and stripped by nginx; the paths
  above are the Flask routes.
- Client code: `web/client/app/src/api/users.ts` (requests) and
  `web/client/app/src/utils/users.ts` (types and validation).
- Admin screen: `/settings/users` (`pages/ManageUsersPage.tsx`). Self-service
  form: the top of the Settings page (`components/AccountSettingsForm.tsx`).
