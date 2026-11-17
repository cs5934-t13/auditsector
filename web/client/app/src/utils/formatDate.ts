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
