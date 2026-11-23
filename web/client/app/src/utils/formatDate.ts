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
 * Formats a stored `YYYY-MM-DDTHH:MM:SS` datetime for display.
 *
 * The server sends these without a timezone, so they are treated as stored
 * values rather than converted to the viewer's local zone — the same rule the
 * API modules use to validate them. Time is shown to the minute, which is the
 * precision a human needs from a scan timestamp.
 */
export function formatStoredDateTime(value: string): string {
  const parsed = new Date(`${value}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** Formats a stored datetime's date portion only, e.g. `Sep 15, 2026`. */
export function formatStoredDate(value: string): string {
  return formatDate(value.slice(0, 10));
}
