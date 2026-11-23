# Schedules API Contract

## Purpose

Lists the audit sources the scanner is watching, and lets an administrator remove
one. These endpoints close a gap where schedules were write-only: `POST /sources`
created them, but nothing could read them back, so the UI could not show what was
scheduled or why a source produced no reports.

## Authentication

Both endpoints require an authenticated Flask session.

`DELETE` additionally requires the `ADMIN` role, checked against the live user
record rather than the session snapshot.

## GET /schedules

Returns every schedule, newest first. Not paginated: sources are registered
deliberately and are expected to number in the tens.

### Successful Response

**Status:** `200 OK`

```json
{
  "data": [
    {
      "schedule_id": 1,
      "source_link": "https://www.seattle.gov/city-auditor/reports",
      "scan_frequency": "WEEKLY",
      "scan_status": "ACTIVE",
      "is_supported": true,
      "last_run_at": "2026-11-23T01:22:24",
      "last_run_status": "SUCCESS",
      "next_run_at": "2026-11-30T01:21:59",
      "created_at": "2026-11-23T01:01:16",
      "created_by": 1,
      "created_by_username": "ferguszo",
      "report_count": 84
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `schedule_id` | number | Schedule identifier. |
| `source_link` | string | The collection URL being scanned. |
| `scan_frequency` | string | `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, or `ARCHIVE`. |
| `scan_status` | string | `ACTIVE`, `UNSUPPORTED`, or `DISABLED`. |
| `is_supported` | boolean | Whether any spider can collect this URL. |
| `last_run_at` | string or `null` | Start of the last run, `YYYY-MM-DDTHH:MM:SS` UTC. |
| `last_run_status` | string or `null` | `SUCCESS` or `ERROR`. |
| `next_run_at` | string or `null` | When the worker will scan next. |
| `created_at` | string or `null` | When the schedule was registered. |
| `created_by` | number or `null` | `users.user_id` of the creator. |
| `created_by_username` | string or `null` | Resolved creator name, `null` if the user is gone. |
| `report_count` | number | Reports this schedule has produced. |

### Scan status

`ACTIVE` schedules are scanned. `UNSUPPORTED` means no spider can handle the
source URL, so the scheduler has **parked** it: it is not retried, because
retrying a permanently unsupported URL only floods the log. `DISABLED` is reserved
for an operator pause.

`is_supported` is derived from the same allow-list the scheduler uses. A schedule
can be `ACTIVE` with `is_supported: false` in older data; the client treats the
flag as authoritative and shows "Not supported".

### Error Responses

**`401 Unauthorized`** — no authenticated session.

```json
{ "status": "failed", "reason": "authentication required" }
```

**`500 Internal Server Error`** — the database could not be read.

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Unable to retrieve schedules."
  }
}
```

## DELETE /schedules/&lt;schedule_id&gt;

Removes one schedule. **Administrator only.**

### Successful Response

**Status:** `204 No Content` — empty body.

### Reports are never deleted

`audit_headers.schedule_id` is `ON DELETE RESTRICT`. A schedule that has produced
reports cannot be deleted while those reports exist, because deleting the schedule
would otherwise orphan or destroy audit history. That refusal is reported as
`409`, with the count, so the operator knows what is blocking it.

To remove such a schedule, the reports must be dealt with first. Deleting audit
reports is a separate, destructive operation and is not performed automatically.

### Error Responses

**`401 Unauthorized`** — no authenticated session.

**`403 Forbidden`** — the session's current role is not `ADMIN`.

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Administrator access is required."
  }
}
```

**`404 Not Found`** — no schedule with that id.

```json
{
  "error": {
    "code": "SCHEDULE_NOT_FOUND",
    "message": "No such schedule."
  }
}
```

**`409 Conflict`** — the schedule still has reports.

```json
{
  "error": {
    "code": "SCHEDULE_IN_USE",
    "message": "This schedule has 84 report(s) and cannot be deleted while they exist."
  }
}
```

**`500 Internal Server Error`** — the delete could not be applied.

## Supported sources

Only these URLs can be scanned:

| Source | URL |
|---|---|
| Seattle City Auditor | `https://www.seattle.gov/city-auditor/reports` |
| Portland eFiles records | `https://efiles.portlandoregon.gov/record` (and `/record/...`) |

Registering any other URL succeeds but parks the schedule as `UNSUPPORTED` on its
first run.

## Acceptance Criteria

- `GET /schedules` returns one entry per schedule with `scan_status` and
  `report_count`, or `401` when unauthenticated.
- `DELETE` returns `401` when unauthenticated, `403` for a non-admin, `404` for an
  unknown id, `409` when reports exist, and `204` only when the schedule had no
  reports.
- A schedule whose source is unsupported stops being retried and reports
  `scan_status: "UNSUPPORTED"` with `is_supported: false`.
