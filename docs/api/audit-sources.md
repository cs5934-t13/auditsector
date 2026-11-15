# POST /sources API Contract

## Purpose

Save an audit-source URL and its scan frequency as a schedule.

## Request

**Method:** `POST`
**Backend path:** `/sources`
**Browser-facing path:** `/api/sources`

### Authentication

Requires a signed-in Flask session. The backend uses the session's
username to determine the schedule's creator.

The browser must send the session cookie with the request.
A username stored in Session Storage does not authenticate the request.

### Query Parameters

| Parameter | Type | Required | Default | Description |
| --------- | ---- | -------- | ------- | ----------- |
| user | string | No | Session username | Deprecated. Omit it; a nonempty value must match the signed-in username. |
| source | string | Yes | None | Audit-source URL using HTTP or HTTPS. |
| frequency | string | No | WEEKLY | HOURLY, DAILY, WEEKLY, or MONTHLY. Case-insensitive. |

An empty `user` parameter is treated as omitted.

### Browser Example

Run after signing in through the same origin:

```javascript
const response = await fetch(
  '/api/sources?' + new URLSearchParams({
    source: 'https://example.com/audits',
  }),
  {
    method: 'POST',
    credentials: 'same-origin',
  },
);

const result = await response.json();
```

## Successful Response

**Status:** `201 Created`

```json
{
  "data": [
    {
      "schedule_id": 1,
      "created_by": 3,
      "source_link": "https://example.com/audits",
      "scan_frequency": "WEEKLY"
    }
  ]
}
```

`created_by` is the database ID of the signed-in user.

This response confirms the schedule was saved. It does not confirm
that a scan has run.

## Error Responses

### Authentication Required

**Status:** `401 Unauthorized`

```json
{
  "reason": "authentication required",
  "status": "failed"
}
```

### Conflicting Username

**Status:** `403 Forbidden`

Returned when a nonempty optional `user` parameter differs from the session username.

```json
{
  "error": {
    "code": "USER_MISMATCH",
    "message": "The 'user' parameter must match the signed-in user."
  }
}
```

### Missing Source

**Status:** `400 Bad Request`

```json
{
  "error": {
    "code": "MISSING_SOURCE",
    "message": "No source given in API call."
  }
}
```

Other validation errors return `400 Bad Request`:

| Code | Meaning |
| ---- | ------- |
| INVALID_SOURCE | Source must be a valid HTTP or HTTPS URL. |
| INVALID_FREQUENCY | Frequency must be HOURLY, DAILY, WEEKLY, or MONTHLY. |
| INVALID_USER | The session username no longer exists in the database. |

### Internal Server Error

Database failures return `500 Internal Server Error`.
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to connect to or update the database."
  }
}
```
