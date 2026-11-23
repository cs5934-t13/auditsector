/**
 * Display metadata for scan schedules.
 *
 * Kept separate from the component so labels, colors, and explanations live in
 * one place, matching `content/riskLevels.ts` and `content/frequencies.ts`.
 */
import type { ScanStatus } from '../api/schedules'

export interface ScanStatusMeta {
  label: string
  /** One line explaining what the status means for the operator. */
  description: string
  color: string
}

/** Metadata per `schedules.scan_status` value. */
export const SCAN_STATUS_META: Record<ScanStatus, ScanStatusMeta> = {
  ACTIVE: {
    label: 'Active',
    description: 'The scanner will run this source on its schedule.',
    color: '#1E6B4F',
  },
  UNSUPPORTED: {
    label: 'Not supported',
    description:
      'No scanner supports this source, so it is no longer retried. Delete it, or replace it with a supported URL.',
    color: '#B3401F',
  },
  DISABLED: {
    label: 'Paused',
    description: 'Scanning is paused for this source.',
    color: '#4A5A64',
  },
}

/** Label used when a source is parked because no scanner supports it. */
export const UNSUPPORTED_SOURCE_LABEL = 'Not supported'

/** Short, human-readable summary of a run outcome. */
export function lastRunLabel(
  status: 'SUCCESS' | 'ERROR' | null,
  hasRun: boolean,
): string {
  if (!hasRun) return 'Never run'
  if (status === 'SUCCESS') return 'Succeeded'
  if (status === 'ERROR') return 'Failed'
  return 'Unknown'
}

/** Formats a server timestamp for display, or a dash when absent. */
export function formatScheduleTime(value: string | null): string {
  if (!value) return '—'
  // The API emits `YYYY-MM-DDTHH:MM:SS` without a zone, and the value is UTC.
  // Render it as-is rather than shifting it into the browser's zone, so the
  // table matches what the scheduler recorded.
  return value.replace('T', ' ').replace(/:\d{2}$/, '')
}
