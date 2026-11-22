/**
 * Scan-status helpers.
 *
 * Mirrors `audit_headers.run_status`:
 * `ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING'`.
 *
 * Dependency-free and free of display data (like `utils/risk.ts`), so the
 * ordering-free membership rules can be unit-tested directly and reused by API
 * modules and components.
 */

/** Every scan status, in workflow order. */
export const RUN_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;

/** One of the database's scan statuses. */
export type RunStatus = (typeof RUN_STATUSES)[number];

/** True when `value` is one of the database's scan statuses. */
export function isRunStatus(value: unknown): value is RunStatus {
  return (
    typeof value === 'string' &&
    (RUN_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normalizes a status coming from outside the app (API, form input).
 *
 * Accepts either casing (`COMPLETED`, `completed`) and returns `null` for
 * anything unrecognised, so callers fall back to a neutral label instead of
 * rendering an arbitrary string.
 */
export function normalizeRunStatus(value: unknown): RunStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim().toUpperCase();
  return isRunStatus(token) ? token : null;
}

/**
 * True while a scan has not reached a result yet.
 *
 * Used to explain why a report has no summary instead of implying that the
 * summary is permanently missing.
 */
export function isRunInProgress(status: RunStatus): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}
