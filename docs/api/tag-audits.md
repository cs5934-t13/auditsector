# GET /tags/{tag}/audits API Contract

## Status

Implemented. Powers the tag detail page (`web/client/app/src/pages/TagPage.tsx`)
via `web/client/app/src/api/tags.ts`. Tests: `web/server/app/test_tags_api.py`
and `web/client/app/tests/tags-api.test.mjs`.

## Purpose

Returns the audit reports that carry a single tag, ordered newest first. Backs
the `/tag/<tagname>` page, whose slug is produced by lowercasing the tag name
and replacing non-alphanumeric runs with hyphens (`Information Technology` →
`information-technology`).

The response also echoes the resolved tag, so the page can render the server's
display casing instead of guessing it from the URL.

## Request

**Method:** `GET`
**Path:** `/tags/{tag}/audits`

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tag` | string | Yes | Tag name or slug. Resolution applies the same normalization as the client's `tagSlug()`: NFKD-normalize, strip combining marks (`Sécurité` → `securite`), lower-case, collapse non-alphanumeric runs to one hyphen. A hand-typed URL therefore resolves to the same page. |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | `1` | Page number to return. Must be 1 or greater. |
| `limit` | integer | No | `20` | Number of reports per page. Must be between 1 and 100. |

## Sort Order

Results are ordered by:

1. `audit_date` descending, so the newest report appears first.
2. `audit_id` descending when two reports share a date. With UUID identifiers
   this is a deterministic tiebreak, not insertion order.

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "audit_id": "00000000-0000-4000-8000-000000000042",
      "title": "FY 2026 Procurement Audit",
      "audit_date": "2026-09-15T00:00:00",
      "created_at": "2026-09-30T14:25:00",
      "risk_level": "MEDIUM",
      "tags": ["Procurement", "Regulatory Compliance"]
    }
  ],
  "tag": {
    "tag_id": 10,
    "name": "Regulatory Compliance",
    "description": "Specific laws, regulations or externally mandated standards are an explicit objective or substantial testing focus.",
    "boundary": "Internal policy or contract testing alone does not qualify. Label scope, including compliant findings; do not infer illegality."
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 2,
    "total_pages": 1
  }
}
```

Each entry in `data` is the same row shape `GET /audits/recent` returns, so both
lists share one table implementation and one validator
(`web/client/app/src/api/auditRow.ts`).

| Field | Type | Meaning |
|---|---|---|
| `audit_id` | string or legacy number | Opaque report identifier. |
| `title` | string | Report title. |
| `audit_date` | string | Stored audit date and time, `YYYY-MM-DDTHH:MM:SS`. |
| `created_at` | string | Record insertion time, same format. |
| `risk_level` | string or `null` | `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, or `null` when unclassified. |
| `tags` | array of strings | Every tag on the report, ordered by name, so tags are navigable without a second request. |

`tag` echoes the resolved tag: `tag_id`, display `name`, and the tagging rule
(`description` = inclusion, `boundary` = exclusion). The rule travels with the
response so the page can explain what the tag means above the list it selected,
without a second request. Either field may be `null`.

## Empty Response

A valid tag with no matching reports returns `200 OK` with an empty `data`
array. This is distinct from an unknown tag, which returns `404`.

```json
{
  "data": [],
  "tag": {
    "tag_id": 1,
    "name": "Inventory",
    "description": "Stock, consumable supplies and non-capital small equipment: counts, custody, distribution and safeguarding.",
    "boundary": "Includes small durable items below the fixed-asset threshold; exclude capital-asset lifecycle planning."
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 0,
    "total_pages": 0
  }
}
```

A page past the end behaves the same way: `200` with empty `data` and the real
totals, so the client can step back to the last populated page.

## Error Responses

### Unknown Tag

**Status:** `404 Not Found`

```json
{
  "error": {
    "code": "TAG_NOT_FOUND",
    "message": "No tag matches \"does-not-exist\""
  }
}
```

The page renders a "Tag not found" state with links to known tags.

### Invalid Pagination

**Status:** `400 Bad Request`

```json
{
  "error": {
    "code": "INVALID_PAGINATION",
    "message": "page must be at least 1 and limit must be between 1 and 100"
  }
}
```

### Not Authenticated

**Status:** `401 Unauthorized`

### Internal Server Error

**Status:** `500 Internal Server Error`

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to retrieve audits for tag"
  }
}
```

## Related Endpoint

`GET /tags/top` (see `tags-top.md`) lists the most common tags with report
counts and is the natural source for the `/tags` index.
