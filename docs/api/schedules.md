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
| `last_run_at` | string or `null` | Start of the last run, `YYYY-MM-DDTHH:MM:SS` UTC. |
| `last_run_status` | string or `null` | `SUCCESS` or `ERROR`. |
| `last_error_code` | string or `null` | Stable reason code: `UNSUPPORTED_SOURCE`, `SOURCE_UNREADABLE`, `SCAN_TIMEOUT`, or `SCAN_FAILED`. |
| `last_error` | string or `null` | A short sentence for end users, composed from `last_error_code`. `null` after a success. |
| `last_error_detail` | string or `null` | **Administrators only.** The worker's raw message, for diagnostics. Absent for other roles. |
| `is_running` | boolean | True while a scan is in flight. |
| `run_started_at` | string or `null` | When the in-flight run began; `null` when idle. |
| `run_total` | number or `null` | Reports the source listed, once its index is parsed. |
| `run_downloaded` | number | PDFs fetched in the current run. |
| `run_processed` | number | Reports committed in the current run. |

### Live progress

While a scan runs, `is_running` is true and the four `run_*` fields describe it.
Three phases are possible, in order:

1. **Finding reports** — `run_total` is `null` because the collection page has
   not been parsed yet. The client should show an indeterminate bar.
2. **Downloading** — `run_total` is known; `run_downloaded` climbs.
3. **Processing** — `run_processed` climbs toward `run_total`.

All four are cleared when the run ends, so a stale progress bar never outlives
its run. Clients should poll about every 15 seconds **only while `is_running` is
true** for any schedule.

Live counters and the raw `last_error_detail` are administrator diagnostics; the
`is_running` flag and the derived sentence are for every signed-in user.

### Failure reporting

A failure is described three ways, for three audiences:

- `last_error_code` — stable and switchable. Clients can vary behaviour without
  parsing prose.
- `last_error` — a sentence written for a person, e.g. *"We couldn't read reports
  from this source. It will try again shortly."* It states the consequence, not
  the subprocess.
- `last_error_detail` — the worker's own message, which may name internal paths.
  Returned only when the session's **current** role is `ADMIN`.

The raw worker text is never used as the user-facing sentence. Previously it was,
which surfaced strings like `Command '['/services/fetcher/.venv/bin/python', ...]'
returned non-zero exit status 1`.
| `next_run_at` | string or `null` | When the worker will scan next. |
| `created_at` | string or `null` | When the schedule was registered. |
| `created_by` | number or `null` | `users.user_id` of the creator. |
| `created_by_username` | string or `null` | Resolved creator name, `null` if the user is gone. |
| `report_count` | number | Reports this schedule has produced. |

### Scan status

`ACTIVE` schedules are scanned. `UNSUPPORTED` means the scheduler **parked** it:
no spider can handle the source, so it is not retried. `DISABLED` is reserved for
an operator pause.

**This endpoint does not report whether a URL is supported.** `POST /sources`
refuses unsupported sources, so a stored schedule is scannable by construction;
there is no allow-list to re-evaluate here. The only way a stored schedule becomes
unsupported is a source being dropped from `supported_sources.py` later, and that
surfaces as `scan_status: "UNSUPPORTED"` with the worker's reason in `last_error`.

Clients should key their status display off `scan_status` and show `last_error`
when present, rather than deriving support from the URL.

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

The allow-list is `supported_sources.py` at the repository root, shared with the
scheduler so the API and the worker cannot disagree. It currently covers fourteen
sources; see that file for the authoritative list and matching rules. A summary:

| Source | URL |
|---|---|
| Seattle City Auditor | `https://www.seattle.gov/city-auditor/reports` |
| Portland — Audit Reports Online | `https://www.portland.gov/auditor/audit-services/about-us/audit-reports-online` |
| Portland — Audit Services | `https://www.portland.gov/auditor/audit-services` |
| Portland eFiles records | `https://efiles.portlandoregon.gov/record` (and `/record/...`) |
| Tulsa Internal Audit | `https://www.cityoftulsa.org/government/internal-audit-reports` |
| Clark County WA Auditor | `https://clark.wa.gov/auditor/auditor-documents` |
| Denver Auditor's Office | `…/Auditors-Office/Audit-Services/Audit-Reports` |
| King County WA Auditor | `…/auditors-office/reports-papers` |
| Arizona Auditor General — Maricopa | `https://www.azauditor.gov/counties/maricopa-county` |
| Sacramento City Auditor | `https://www.cityofsacramento.gov/auditor` |
| San Diego City Auditor | `https://www.sandiego.gov/auditor/reports` |
| San Francisco City Services Auditor | `https://www.sf.gov/information--city-services-auditor` |
| San José City Auditor | `https://www.sanjoseca.gov/your-government/appointees/city-auditor/audit-reports-4828` |
| Virginia Beach City Auditor | `https://auditor.virginiabeach.gov/` |

Adding a source is one entry in `supported_sources.py`; both the worker and the UI
pick it up, so the "Not supported" badge stays accurate.

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
