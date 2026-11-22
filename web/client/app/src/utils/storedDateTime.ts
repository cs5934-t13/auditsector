/**
 * Stored-datetime validation.
 *
 * `audit_headers.audit_date` and `created_at` are MySQL `DATETIME` columns, and
 * the server serializes them as `YYYY-MM-DDTHH:MM:SS` with no timezone suffix.
 * API modules must validate that shape before trusting a response, because a
 * `Z` suffix or a short date would mean the server changed its contract and the
 * formatting helpers would silently misrender it.
 *
 * Dependency-free, so every API module and its unit tests can share one rule.
 */

const STORED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * True when `value` is a stored `YYYY-MM-DDTHH:MM:SS` datetime.
 *
 * The calendar value is checked by round-tripping through `Date`, so impossible
 * dates (`2026-02-30`) and out-of-range times (`25:00`) are rejected instead of
 * rolling over into the next day.
 */
export function isStoredDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !STORED_DATE_TIME.test(value)) {
    return false;
  }

  // Appending `Z` only makes the string parseable; the comparison below checks
  // the stored components, so no timezone conversion affects the result.
  const parsed = new Date(`${value}Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value
  );
}
