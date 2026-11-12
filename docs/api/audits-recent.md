# GET /audits/recent API Contract

## Purpose

Returns a paginated list of the most recently added audit records, ordered by record creation time from newest to oldest.

“Recent” refers to `audit_headers.created_at`, the time the database record was inserted. It does not establish when the report was scanned or when processing completed.

## Contract Revision

This revision aligns the endpoint with the current `audit_headers` database schema.

Changes from the original AW-102 contract:

- Replace scan-time ordering with record-creation-time ordering.
- Return `audit_date` and `created_at` instead of `report_date` and `scanned_at`.
- Omit `auditing_office` and `source_url`, which the current audit table does not store.
- Document session authentication and the existing authentication error response.

The merged AW-103 implementation uses this definition of recency and these four response fields. AW-105 aligns the example below and identifier type with the current implementation and schema; it does not add response fields.

## Request

**Method:** `GET`  
**Path:** `/audits/recent`

### Authentication

Requires an authenticated Flask session.

The client must send the session cookie established by a successful login. A username supplied by the client does not authenticate the request.

Results are not filtered by user or organization for the MVP.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `page` | integer | No | `1` | Page number to return. Must be 1 or greater. |
| `limit` | integer | No | `20` | Number of audit records per page. Must be between 1 and 100. |

An omitted parameter uses its default. A supplied value that is empty, is not an integer, or is outside its allowed range returns `400 Bad Request`.

### Example Request

```http
GET /audits/recent?page=1&limit=20
```

## Sort Order

Results are ordered by:

1. `created_at` in descending order, so the most recently added record appears first.
2. `audit_id` in descending order when two records have the same `created_at` value.

With UUID identifiers, the second key provides deterministic ordering; it does not imply insertion order within a timestamp tie.

## Response Fields

Each item in `data` contains:

| Field | JSON Type | Database Source | Description |
|---|---|---|---|
| `audit_id` | string or legacy number | `audit_headers.audit_id` | Opaque record identifier. Current initialization SQL uses a UUID string; older, unmigrated databases return an integer. |
| `title` | string | `audit_headers.title` | Stored audit title. |
| `audit_date` | string | `audit_headers.audit_date` | Stored audit date and time. This contract does not establish that it is the publication date. |
| `created_at` | string | `audit_headers.created_at` | Date and time the audit record was inserted. |

Date and time values use `YYYY-MM-DDTHH:MM:SS`.

Both columns are MySQL `DATETIME` values without timezone information. Responses preserve the stored values without adding a UTC suffix or timezone offset.

## Pagination

The response includes:

| Field | Description |
|---|---|
| `page` | Requested page number, or the default. |
| `limit` | Requested page size, or the default. |
| `total_items` | Total number of audit records before pagination. |
| `total_pages` | `total_items / limit`, rounded up; zero when no records exist. |

The offset is `(page - 1) * limit`.

A page beyond the available results returns `200 OK` with an empty `data` array and the actual pagination totals.

## Successful Response

**Status:** `200 OK`

The example shows the last page when 41 records exist and the page size is 20.

```json
{
  "data": [
    {
      "audit_id": "00000000-0000-4000-8000-000000000042",
      "title": "FY 2026 Procurement Audit",
      "audit_date": "2026-09-15T00:00:00",
      "created_at": "2026-09-30T14:25:00"
    }
  ],
  "pagination": {
    "page": 3,
    "limit": 20,
    "total_items": 41,
    "total_pages": 3
  }
}
```

An earlier example included office, publication date, scan time, source URL, and risk level. The endpoint does not return those fields; adding them requires a separate backend/contract change.

## Empty Response

If no audit records exist, the endpoint returns `200 OK` with an empty `data` array.

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 0,
    "total_pages": 0
  }
}
```

## Error Responses

### Authentication Required

Returns `401 Unauthorized` when the request has no authenticated Flask session. Authentication is checked before pagination validation.

The response follows the existing `login_required` decorator:

```json
{
  "status": "failed",
  "reason": "authentication required"
}
```

### Invalid Pagination

Returns `400 Bad Request` when a supplied `page` or `limit` is empty, is not an integer, or is outside its allowed range.

```json
{
  "error": {
    "code": "INVALID_PAGINATION",
    "message": "page must be at least 1 and limit must be between 1 and 100"
  }
}
```

### Internal Server Error

Returns `500 Internal Server Error` when the server cannot retrieve the audit records.

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to retrieve recent audits"
  }
}
```

Database credentials, SQL statements, and internal exception details must not appear in the response.

## MVP Scope

- Read audit records from `audit_headers`.
- Require session authentication.
- Return records across users without organization filtering.
- Include records regardless of `run_status`.
- Use record creation time to determine recency.
- Do not return auditing office, report URL, summaries, or tags.

## Acceptance Criteria

- Authenticated requests return `200 OK` with `data` and `pagination`.
- Unauthenticated requests return the documented `401` response.
- Default pagination is page 1 with a limit of 20.
- Invalid pagination returns the documented `400` response.
- Results are ordered by `created_at DESC`, then `audit_id DESC`.
- Each result contains exactly the four documented response fields.
- Date and time values use the documented format without an assumed timezone.
- Pagination totals reflect the full audit record count.
- An empty database returns empty `data` and zero totals.
- A page beyond the available results returns empty `data` and actual totals.
- Database retrieval failures return the documented `500` response.
- Examples agree with the four fields returned by the merged AW-103 endpoint.
