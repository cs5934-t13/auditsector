# GET /tags/top API Contract

## Status

Proposed contract for AW-197. Pending team review before implementation in AW-198.

## Purpose

Returns the most common individual tags across audit reports published within a specified date range, including each tag's category.

Each tag's report_count is the number of distinct matching audit reports containing that tag. A report contributes at most once to each tag's count.

## Request

**Method:** `GET`
**Path:** `/tags/top`

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `start_date` | date string | Yes | None | First included report publication date, in `YYYY-MM-DD` format. |
| `end_date` | date string | Yes | None | Last included report publication date, in `YYYY-MM-DD` format. |
| `limit` | integer | No | `10` | Maximum number of results. Must be between 1 and 100. |

Both dates must be valid calendar dates. `start_date` must be on or before `end_date`. Both boundaries are inclusive; equal dates select one day.

The range filters report publication dates, not scan dates. This assumes publication dates are stored as calendar dates without timezone conversion; the database field and type require team confirmation.

No request body is required.

### Example Request

GET /tags/top?start_date=2026-09-01&end_date=2026-09-30&limit=10

## Counting and Sort Order

Results are grouped by category and tag. The same tag text in different categories represents separate results.

For each category/tag pair, report_count counts distinct audit reports whose publication dates fall within the requested range. Repeated occurrences of that tag in one report count only once.

Only tags with a positive report_count are returned.

Results are ordered by:

1. report_count descending.
2. Category name alphabetically when counts tie.
3. Tag name alphabetically when counts and categories tie.

The limit is applied after counting and sorting. Ties do not increase the number of results beyond the requested limit.

## Successful Response

**Status:** `200 OK`
**Content-Type:** `application/json`

Each result contains:

| Field | Type | Meaning |
|---|---|---|
| `category` | string | Category containing the tag. |
| `tag` | string | Tag name. |
| `report_count` | integer | Number of distinct matching reports containing the tag. |

Example values below are illustrative.

```json
{
  "data": [
    {
      "category": "content",
      "tag": "procurement",
      "report_count": 18
    },
    {
      "category": "content",
      "tag": "cybersecurity",
      "report_count": 12
    }
  ]
}
```

## Empty Response

If no tags match the date range, return `200 OK` with an empty array.

```json
{
  "data": []
}
```

## Authentication and Scope

Authentication is required

Requests with missing or invalid authentication return `401 Unauthorized`.

For the current MVP, results are not filtered by the authenticated user's organization. Counts are calculated across reports in the application's dataset that match the requested date range.

The authentication mechanism must follow the team's shared authentication design; this contract does not define a new mechanism.

Organization scoping may be reconsidered after feedback from the City's IT team.

## Error Responses

All error responses use this JSON structure:

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "start_date must be on or before end_date"
  }
}
```

The message explains the specific failure.

| HTTP Status | Code | Condition |
|---|---|---|
| `400 Bad Request` | `INVALID_DATE_RANGE` | Either date is missing, empty, incorrectly formatted, or not a valid calendar date; or start_date is after end_date. |
| `400 Bad Request` | `INVALID_LIMIT` | A supplied limit is empty or is not an integer between 1 and 100. |
| `401 Unauthorized` | `UNAUTHORIZED` | Authentication is missing or invalid. |
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | An unexpected server failure prevents retrieving results. |

For `UNAUTHORIZED`, the message is "Authentication required".

For `INTERNAL_SERVER_ERROR`, the message is "Unable to retrieve top tags". Internal implementation details are not returned.