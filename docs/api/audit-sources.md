# POST /sources API Contract

## Purpose

Add a single URL for audit publications to the database. Requires specification
of scanning frequency.

## Request

**Method:** `POST`  
**Path:** `/sources`  
**Auth:** Session required. An unauthenticated call returns `401`.

The schedule owner is taken from the **session**, not from the request. This
prevents a caller from attributing a schedule to another user.

### Query Parameters

| Parameter | Type     | Required |  Default | Description                                            |
| --------- | -------- | -------: | -------: | ------------------------------------------------------ |
| user      | `string` |       No |  session | Deprecated. If given it must match the signed-in user, otherwise `403 USER_MISMATCH` is returned. |
| source    | `string` |      Yes |   `None` | Link to publication site (must be an http/https URL)   |
| frequency | `enum`   |       No | `WEEKLY` | Frequency of scraping (HOURLY, DAILY, WEEKLY, MONTHLY) |

## Successful Response

**Status:** `201 Created`

```json
{
  "data": [
    {
      "schedule_id": 1,
      "created_by": 3,
      "source_link": "https://example.gov/audits",
      "scan_frequency": "MONTHLY"
    }
  ]
}
```

## Error Responses

### Not authenticated

**Status:** `401 Unauthorized`

```json
{
  "status": "failed",
  "reason": "authentication required"
}
```

### Invalid arguments

If no source is given, the API returns `400: Bad Request` with an appropriate
error code.

```json
{
  "error": {
    "code": "MISSING_SOURCE",
    "message": "No source given in API call."
  }
}
```

### User mismatch

Passing a `user` that is not the signed-in user is rejected.

**Status:** `403 Forbidden`

```json
{
  "error": {
    "code": "USER_MISMATCH",
    "message": "The 'user' parameter must match the signed-in user."
  }
}
```

or

```json
{
  "error": {
    "code": "INVALID_USER",
    "message": "Given user not found in database."
  }
}
```

### Internal Server Error

If the database is unreachable, then a `500: Internal Server Error` will be returned.

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to connect to or update the database."
  }
}
```
