# POST /sources API Contract

## Purpose

Add a single URL for audit publications to the databsae, requires specification of scanning frequency.

## Request

**Method:** `POST`  
**Path:** `/sources`

### Query Parameters

| Parameter | Type     | Required |  Default | Description                                            |
| --------- | -------- | -------: | -------: | ------------------------------------------------------ |
| user      | `string` |      Yes |   `None` | The user creating this schedule                        |
| source    | `string` |      Yes |   `None` | Link to publication site                               |
| frequency | `enum`   |       No | `WEEKLY` | Frequency of scraping (HOURLY, DAILY, WEEKLY, MONTHLY) |

## Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "schedule_id": 1,
      "created_by": 3,
      "source_link": "www.google.com",
      "scan_frequency": "MONTHLY"
    }
  ]
}
```

## Error Responses

### Invalid arguments

If no user or source is given, API will return `400: Bad Request` with appropriate error code. Example will use USER, however equivalent errors will exist for SOURCE.

```json
{
  "error": {
    "code": "MISSING_USER",
    "message": "No user given in API call."
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
    "message": "page must be at least 1 and limit must be between 1 and 100"
  }
}
```
