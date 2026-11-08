# GET /tags/{tag}/audits API Contract

## Status

Proposed contract for the tag detail page at `/tag/<tagname>`. The front-end
currently renders placeholder data; this documents the endpoint it expects once
implemented.

## Purpose

Returns the audit reports that carry a single tag, ordered newest first. Backs
the `/tag/<tagname>` page, whose slug is produced by lowercasing the tag name
and replacing non-alphanumeric runs with hyphens (`Information Technology` →
`information-technology`).

## Request

**Method:** `GET`
**Path:** `/tags/{tag}/audits`

### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tag` | string | Yes | Tag name or slug. A slug is matched case-insensitively and ignores diacritics, so a hand-typed URL resolves to the same page. |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | `1` | Page number to return. Must be 1 or greater. |
| `limit` | integer | No | `20` | Number of reports per page. Must be between 1 and 100. |

## Sort Order

Results are ordered by:

1. `report_date` descending, so the newest publication appears first.
2. `audit_id` descending when two reports share a publication date.

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
      "risk_level": "HIGH",
      "tags": ["Procurement", "Regulatory Compliance"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 2,
    "total_pages": 1
  }
}
```

`tags` carries every tag on each report, so rows can link to the report's other
tags without a second request.

`risk_level` is one of `INFO`, `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`
(`audit_headers.risk_level`), or `null` for a report that has not been
classified yet.

## Empty Response

A valid tag with no matching reports returns `200 OK` with an empty `data`
array. This is distinct from an unknown tag, which returns `404`.

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
