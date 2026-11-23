/**
 * Display metadata for scan statuses.
 *
 * The statuses come from `utils/runStatus.ts`; this file only adds the
 * presentation details (labels, descriptions, colors) so the helpers stay
 * dependency-free and testable.
 *
 * Matches `audit_headers.run_status`:
 * `ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING'`.
 */
import type { RunStatus } from '../utils/runStatus';

export interface RunStatusMeta {
  status: RunStatus;
  /** Display label, e.g. "Completed". */
  label: string;
  /** One line explaining what the status means. */
  description: string;
  /**
   * Chip color. Never the only signal: the label text is always shown, so the
   * status is not conveyed by color alone.
   */
  color: string;
}

/** Metadata per status, keyed by the database value. */
export const RUN_STATUS_META: Record<RunStatus, RunStatusMeta> = {
  PENDING: {
    status: 'PENDING',
    label: 'Pending',
    description: 'Queued; the scan has not started yet.',
    color: '#4A5A64',
  },
  RUNNING: {
    status: 'RUNNING',
    label: 'Running',
    description: 'The source is being scanned right now.',
    color: '#0B4F6C',
  },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Completed',
    description: 'The scan finished and the report is available.',
    color: '#1E6B4F',
  },
  FAILED: {
    status: 'FAILED',
    label: 'Failed',
    description: 'The scan did not finish; details may be incomplete.',
    color: '#B3401F',
  },
};

/** Label used when a status is missing or unrecognised. */
export const UNKNOWN_RUN_STATUS_LABEL = 'Unknown';
/** Color used when a status is missing or unrecognised. */
export const UNKNOWN_RUN_STATUS_COLOR = '#7B848A';

/** Display label for a status, falling back to "Unknown". */
export function runStatusLabel(
  status: RunStatus | null | undefined,
): string {
  return status ? RUN_STATUS_META[status].label : UNKNOWN_RUN_STATUS_LABEL;
}

/** Color for a status, falling back to the neutral unknown color. */
export function runStatusColor(
  status: RunStatus | null | undefined,
): string {
  return status ? RUN_STATUS_META[status].color : UNKNOWN_RUN_STATUS_COLOR;
}

/** One-line explanation for a status, or the unknown explanation. */
export function runStatusDescription(
  status: RunStatus | null | undefined,
): string {
  return status
    ? RUN_STATUS_META[status].description
    : 'The scan status for this report is not known.';
}
