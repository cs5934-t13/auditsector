# GET /audits/recent API Contract

## Purpose

Returns a paginated list of the most recently scanned audit reports, ordered from newest to oldest.

## Request

**Method:** `GET`  
**Path:** `/audits/recent`

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `page` | integer | No | `1` | Page number to return. Must be 1 or greater. |
| `limit` | integer | No | `20` | Number of audits per page. Must be between 1 and 100. |

## Sort Order

Results are ordered by:

1. `scanned_at` in descending order, so the newest scan appears first.
2. `audit_id` in descending order when two audits have the same `scanned_at` value.

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "audit_id": 42,
      "title": "FY 2026 Procurement Audit",
      "auditing_office": "Office of Internal Audit",
      "report_date": "2026-09-15",
      "scanned_at": "2026-09-30T14:25:00Z",
      "source_url": "https://example.gov/audits/procurement-2026.pdf",
      "risk_level": "HIGH"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 47,
    "total_pages": 3
  }
}
```

### Fields

| Field | Type | Meaning |
|---|---|---|
| `audit_id` | integer | Stable report identifier. |
| `title` | string | Report title. |
| `auditing_office` | string | Office that published the report. |
| `report_date` | date string | Publication date, `YYYY-MM-DD`. |
| `scanned_at` | timestamp | When the scan stored this report (UTC). |
| `source_url` | string | Link to the published report. |
| `risk_level` | enum or null | One of `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, matching `audit_headers.risk_level`. `null` means the report is scanned but not yet classified; the client renders it as "Not rated". |


## Empty Response

If no audits exist, the endpoint still returns `200 OK` with an empty `data` array.

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

### Invalid Pagination

Returns `400 Bad Request` when `page` or `limit` is outside its allowed range.

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
## Questions for Team Review

1. Do the proposed response fields match the audit database schema?
2. Should this endpoint require an authenticated user?
3. Should results be scoped to the authenticated user’s organization?
4. Is `scanned_at` the correct definition of “recent,” rather than `report_date`?
5. Is page-based pagination preferred, or should the API use cursor-based pagination?

## Acceptance Criteria

- The endpoint path and HTTP method are defined.
- Results are sorted by scan date from newest to oldest.
- Pagination inputs and defaults are defined.
- Successful, empty, and error responses are documented.
- Example request and response data are included.
- The contract is reviewed by the team before implementation begins.