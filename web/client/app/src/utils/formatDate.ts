/**
 * Formats an ISO `YYYY-MM-DD` date for display.
 *
 * Parsed as UTC so the rendered day cannot shift backwards for users west of
 * Greenwich when the browser applies a local timezone offset.
 */
export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Formats a stored `YYYY-MM-DDTHH:MM:SS` **instant** in the viewer's time zone.
 *
 * The server stores and sends these as UTC without a suffix (the database runs
 * with `time_zone = SYSTEM` on a UTC container, and every writer uses
 * `UTC_TIMESTAMP()`). Appending `Z` states that, so `toLocaleString` converts
 * into the browser's zone instead of printing UTC as though it were local.
 *
 * Use this for moments in time — when a scan ran, when a row was inserted.
 * Do **not** use it for calendar dates such as `audit_date`, which describe a
 * day rather than an instant: converting those shifts the day for anyone west
 * of Greenwich. `formatDate`/`formatStoredDate` pin those to UTC for that reason.
 */
export function formatStoredDateTime(value: string): string {
  return formatInstant(value, { withZone: true });
}

/**
 * Compact variant for narrow table cells: local time, no zone abbreviation.
 *
 * A localized string with the zone name is too wide for a fixed-width grid
 * column, and the viewer's own zone is implied there.
 */
export function formatStoredDateTimeShort(value: string): string {
  return formatInstant(value, { withZone: false });
}

function formatInstant(value: string, { withZone }: { withZone: boolean }): string {
  const parsed = new Date(`${value}Z`);
  if (Number.isNaN(parsed.getTime())) {
    // Leave an unexpected value visible rather than silently showing a wrong time.
    return value;
  }
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' as const } : {}),
  });
}

/** Formats a stored datetime's date portion only, e.g. `Sep 15, 2026`. */
export function formatStoredDate(value: string): string {
  return formatDate(value.slice(0, 10));
}
