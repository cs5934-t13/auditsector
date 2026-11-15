# GET /audits/risk-over-time API Contract

## Status

Proposed contract for the homepage "Risk levels over time" chart. The front-end
currently renders placeholder data (`web/client/app/src/content/riskActivity.ts`);
this documents the endpoint it expects once implemented.

## Purpose

Returns the number of audit reports per risk level for each period in a date
range, ordered oldest to newest. Backs the stacked bar chart on the signed-in
homepage, which complements `GET /audits/recent` ("Reports scanned over time")
by showing how severe the scanned reports are, not just how many there are.

Risk levels match `audit_headers.risk_level`:
`ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL`.

## Request

**Method:** `GET`
**Path:** `/audits/risk-over-time`
**Auth:** Session required. An unauthenticated call returns `401`.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `start_date` | date string | Yes | None | First included report publication date, `YYYY-MM-DD`. |
| `end_date` | date string | Yes | None | Last included report publication date, `YYYY-MM-DD`. |
| `interval` | enum | No | `MONTH` | Bucket size: `DAY`, `WEEK`, or `MONTH`. |

Both dates must be valid calendar dates and `start_date` must be on or before
`end_date`. Both boundaries are inclusive.

The range filters report publication dates (`audit_headers.audit_date`), not
scan dates, so the series lines up with the reports' own timelines.

### Example Request

```
GET /audits/risk-over-time?start_date=2026-01-01&end_date=2026-07-31&interval=MONTH
```

## Counting and Sort Order

Reports are grouped into buckets by publication date and by `risk_level`. Each
report contributes to exactly one level: its own, or the `null` bucket when it
has not been classified.

Results are ordered by bucket start date ascending. Every bucket in the range is
included, with zeros for levels that had no reports, so the client never has to
fill gaps.

`total` is the sum of the five level counts, i.e. every report in the bucket
including unclassified ones.

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "period": "2026-01",
      "label": "Jan",
      "total": 42,
      "counts": {
        "INFO": 16,
        "LOW": 14,
        "MEDIUM": 9,
        "HIGH": 3,
        "CRITICAL": 0,
        "UNRATED": 0
      }
    },
    {
      "period": "2026-02",
      "label": "Feb",
      "total": 58,
      "counts": {
        "INFO": 21,
        "LOW": 19,
        "MEDIUM": 13,
        "HIGH": 4,
        "CRITICAL": 1,
        "UNRATED": 0
      }
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `period` | string | Bucket start, `YYYY-MM-DD` for `DAY`/`WEEK` and `YYYY-MM` for `MONTH`. Sortable and timezone-free. |
| `label` | string | Short display label for the x axis (for example `Jan`). |
| `total` | integer | Reports in the bucket across all levels, including unclassified. |
| `counts` | object | Per-level report counts. `UNRATED` counts reports whose `risk_level` is `NULL` and is charted separately from the five levels. |

## Empty Response

A range with no reports returns `200 OK` with one entry per bucket, all counts
zero. An invalid range returns `400` rather than an empty array, so "no data" is
never confused with a bad request.

```json
{
  "data": []
}
```

`data: []` is returned only when the range contains no buckets at all.

## Error Responses

### Invalid Date Range

**Status:** `400 Bad Request`

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "start_date must be on or before end_date"
  }
}
```

### Invalid Interval

**Status:** `400 Bad Request`

```json
{
  "error": {
    "code": "INVALID_INTERVAL",
    "message": "interval must be one of DAY, WEEK, MONTH"
  }
}
```

### Internal Server Error

**Status:** `500 Internal Server Error`

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to aggregate audit risk levels"
  }
}
```

## Acceptance Criteria

- Path, method, and query parameters are defined.
- Buckets are ordered oldest to newest and include periods with no reports.
- Per-level counts sum to `total`, and unclassified reports are counted
  separately as `UNRATED` rather than dropped.
- Successful, empty, and error responses are documented.
- The contract is reviewed by the team before implementation begins.
