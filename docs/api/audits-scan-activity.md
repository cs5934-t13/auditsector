# GET /audits/scan-activity API Contract

## Purpose

Returns the number of audit records added per time bucket, ordered oldest to
newest. Powers the homepage "Reports scanned over time" chart
(`web/client/app/src/components/ScanActivityChart.tsx`).

Buckets count `audit_headers.created_at`, the moment the fetcher inserted the
record. `audit_headers` has no completed-at column and `run_status` is a
current-state flag rather than history, so the insertion time is the closest
available proxy for a scan time. This endpoint therefore answers "how many
records were added", not "how many PDFs were downloaded".

## Request

**Method:** `GET`
**Path:** `/audits/scan-activity`
**Auth:** Session required. An unauthenticated call returns `401`.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `start_date` | date string | No | 12 months ago | First included day, `YYYY-MM-DD`. |
| `end_date` | date string | No | End of the current month | Last included day, `YYYY-MM-DD`. |
| `interval` | enum | No | `MONTH` | Bucket size: `DAY`, `WEEK`, or `MONTH` (case-insensitive). |

Omitting both dates yields the last 12 months including the current one. Both
boundaries are inclusive. Week buckets start on Monday. A range spanning more
than 1000 buckets returns `400`.

### Example Request

```
GET /audits/scan-activity?start_date=2026-01-01&end_date=2026-07-31&interval=MONTH
```

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    { "period": "2026-01", "label": "Jan", "total": 42 },
    { "period": "2026-02", "label": "Feb", "total": 58 }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `period` | string | Bucket start, `YYYY-MM-DD` for `DAY`/`WEEK` and `YYYY-MM` for `MONTH`. Stable key, sortable, timezone-free. |
| `label` | string | Short x-axis label (`Jan`, or `Mar 9` for `DAY`/`WEEK`). |
| `total` | integer | Audit records added during the bucket. |

Every bucket in the range is returned, including buckets with `total: 0`, so the
client never fills gaps. `data` is never empty for a valid range.

## Error Responses

### Invalid Range or Interval

**Status:** `400 Bad Request`

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "interval must be one of DAY, WEEK, MONTH"
  }
}
```

The same code covers an unparseable date, a reversed range, and an oversized
range; the `message` names the offending parameter.

### Authentication Required

**Status:** `401 Unauthorized`

```json
{
  "status": "failed",
  "reason": "authentication required"
}
```

### Internal Server Error

**Status:** `500 Internal Server Error`

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to aggregate scan activity."
  }
}
```
