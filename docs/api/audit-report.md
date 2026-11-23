# GET /audits/{audit_id} API Contract

## Purpose

Returns a single audit report by its identifier, including the summary, risk
level, scan status, and tags. Backs the report detail page at
`/audits/<audit_id>` (`web/client/app/src/pages/AuditReportPage.tsx`), which the
titles in the recent-reports grid link to.

## Request

**Method:** `GET`
**Path:** `/audits/{audit_id}`

### Authentication

Requires an authenticated Flask session. The client must send the session
cookie established by a successful login. An unauthenticated request returns
`401`, and the page shows a "Sign in again" action.

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `audit_id` | string | Yes | `audit_headers.audit_id`. Current schema uses a UUID string; legacy, unmigrated databases return an integer, which the endpoint serializes as a string. |

## Successful Response

**Status:** `200 OK`

```json
{
  "data": {
    "audit_id": "00000000-0000-4000-8000-000000000042",
    "schedule_id": 7,
    "title": "Emergency Communications Audit",
    "municipality": "Portland",
    "audit_url": "https://example.gov/audits/emergency-comms.pdf",
    "audit_date": "2026-09-15T00:00:00",
    "risk_level": "MEDIUM",
    "run_status": "COMPLETED",
    "summary": "The audit identified staffing and training challenges.",
    "created_at": "2026-09-30T14:25:00",
    "tags": [
      {
        "tag_id": 6,
        "name": "Human Resources",
        "description": null
      }
    ]
  }
}
```

### Response Fields

| Field | JSON Type | Database Source | Description |
|---|---|---|---|
| `audit_id` | string | `audit_headers.audit_id` | Opaque report identifier. Always a string, even for legacy integer ids. |
| `schedule_id` | number or `null` | `audit_headers.schedule_id` | Schedule that produced the record. |
| `title` | string | `audit_headers.title` | Report title. |
| `municipality` | string | `audit_headers.muni` | Reporting municipality; the wire name differs from the column name. |
| `audit_url` | string | `audit_headers.audit_url` | Link to the original audit document. |
| `audit_date` | string | `audit_headers.audit_date` | Publication date of the report, read from the PDF. |
| `risk_level` | string or `null` | `audit_headers.risk_level` | One of `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, or `null` when the report has not been classified. Assigned by the fetcher's classifier from the report's own findings. |
| `run_status` | string or `null` | `audit_headers.run_status` | One of `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`. |
| `summary` | string or `null` | `audit_headers.summary` | AI-generated summary; `null` until the scan produces one. |
| `created_at` | string | `audit_headers.created_at` | Record insertion time. |
| `tags` | array | `audit_tags` joined to `tags` | Every tag on the report, ordered by `tags.name`. Each item carries `tag_id`, `name`, and a nullable `description`. |

### Dates and Times

`audit_date` and `created_at` use `YYYY-MM-DDTHH:MM:SS`. Both columns are MySQL
`DATETIME` values without timezone information, and the response preserves the
stored values without adding a UTC suffix or offset.

`audit_date` is the report's **publication date**, not the crawl time. The
fetcher fills it from the page-1 masthead (for example `April 16, 2020` or
`MARCH 2023`), then from the PDF's `CreationDate` metadata. A month-and-year
masthead yields the first of that month. Only when the PDF states no date at all
is the crawl time stored, so a report published without a date is
indistinguishable from the old behaviour for that row.

`created_at` is when the fetcher inserted the row. The two differ whenever the
report was published before it was scanned, which is the normal case.

## Error Responses

### Unknown Report

**Status:** `404 Not Found`

```json
{
  "error": {
    "code": "AUDIT_NOT_FOUND",
    "message": "Audit report not found."
  }
}
```

The page renders a "Audit report not found" state with a link back to the report
list and no retry action, since retrying cannot succeed.

### Authentication Required

**Status:** `401 Unauthorized`

```json
{
  "status": "failed",
  "reason": "authentication required"
}
```

### Database Failure

**Status:** `500 Internal Server Error`

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to retrieve audit report."
  }
}
```
