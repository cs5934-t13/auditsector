# GET /tags API Contract

## Purpose

Returns every tag with the number of distinct audit reports carrying it. Backs
the `/tags` index page (`web/client/app/src/pages/TagsPage.tsx`).

This is the aggregate the index needs. It replaced the older `GET /tag` and
`GET /tag/<tag_id>` endpoints, which returned raw `tags` table rows with no
counts and had no callers.

## Request

**Method:** `GET`
**Path:** `/tags`
**Auth:** Session required. An unauthenticated call returns `401`.

No query parameters. The response is small (one row per tag), so it is not
paginated.

A trailing slash (`/tags/`) is accepted and returns the same response.

## Ordering

Tags are ordered alphabetically by `name`, with `tag_id` as the tiebreak.

Name order is what a reader scanning the `/tags` index expects. Ordering by
`tag_id` (the previous behaviour) showed insertion order instead, which is
meaningless on the page and pushed a newly added tag to the end regardless of
where its name falls.

Matching is done by MySQL's collation, so the result follows the database's
case-insensitive comparison rather than byte order. The `tag_id` tiebreak only
matters for two names that collate equal (differing only in case or trailing
spaces), which keeps the response stable across requests.

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "tag_id": 1,
      "name": "Inventory",
      "report_count": 0,
      "description": "Stock, consumable supplies and non-capital small equipment: counts, custody, distribution and safeguarding.",
      "boundary": "Includes small durable items below the fixed-asset threshold; exclude capital-asset lifecycle planning."
    },
    {
      "tag_id": 2,
      "name": "Fixed Assets",
      "report_count": 1,
      "description": "Acquisition, records, maintenance or disposal of capital assets over $5,000, including major infrastructure.",
      "boundary": "Threshold follows supplied business-process list. Non-capital equipment alone does not qualify. Construction delivery uses Capital Projects."
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `tag_id` | integer | `tags.tag_id`. |
| `name` | string | Display name, e.g. `Information Technology`. |
| `report_count` | integer | Distinct reports carrying the tag. Repeated `audit_tags` rows cannot inflate it (`COUNT(DISTINCT audit_id)`). |
| `description` | string or `null` | The **inclusion** rule: what a report must substantially examine to carry the tag. `null` for a tag added by a user. |
| `boundary` | string or `null` | The **exclusion** rule: what nearby topic does not qualify on its own, and which tag to use instead. `null` when absent. |

`description` and `boundary` are seeded from `data/scripts/init_tag_data.sql`.
They are returned as `null` rather than omitted so the client has one empty
case; a database that predates the `boundary` column simply returns `null` for
every tag until it is re-initialized.

Tags with no reports are included with `report_count: 0`. The tag set is open —
users can create a tag before any report uses it — so omitting empty tags would
hide valid destinations from the index.

An empty `tags` table returns `200 OK` with `"data": []`.

## Error Responses

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
    "message": "Unable to retrieve tags."
  }
}
```

## Related Endpoints

- `GET /tags/<tag>/audits` — the reports carrying one tag (see
  `tag-audits.md`).
