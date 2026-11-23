/**
 * Display metadata for scan schedules.
 *
 * Kept separate from the component so labels, colors, and explanations live in
 * one place, matching `content/riskLevels.ts` and `content/frequencies.ts`.
 */
import type { ScanStatus } from '../api/schedules'
import { formatStoredDateTimeShort } from '../utils/formatDate'

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
    label: 'Stopped',
    description:
      'The scanner can no longer collect this source, so it is no longer retried. The last error says why; delete the schedule or replace it with a supported URL.',
    color: '#B3401F',
  },
  DISABLED: {
    label: 'Paused',
    description: 'Scanning is paused for this source.',
    color: '#4A5A64',
  },
}

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

/**
 * Formats a schedule timestamp in the viewer's time zone, or a dash when absent.
 *
 * The API sends UTC without a suffix, so this converts rather than printing the
 * stored value: a scan that ran at 16:15 UTC should read as 10:15 to someone in
 * Chicago. Calendar dates (`audit_date`) are handled separately, because those
 * must not be shifted.
 */
export function formatScheduleTime(value: string | null): string {
  if (!value) return '—'
  return formatStoredDateTimeShort(value)
}

/** One line describing what a running scan is doing, for every signed-in user. */
export function runProgressLabel(schedule: {
  is_running: boolean
  run_total: number | null
  run_downloaded: number
  run_processed: number
}): string | null {
  if (!schedule.is_running) return null

  const { run_total: total, run_downloaded: downloaded, run_processed: processed } =
    schedule

  // Before the index is parsed there is no denominator: say so rather than
  // showing a bar that can only ever be wrong.
  if (total === null) {
    return downloaded > 0
      ? `Finding reports… ${downloaded} downloaded`
      : 'Finding reports…'
  }
  if (processed < total && downloaded < total) {
    return `Downloading reports… ${downloaded} of ${total}`
  }
  return `Processing reports… ${processed} of ${total}`
}

/** Percentage complete for a determinate bar, or `null` while it is unknown. */
export function runProgressPercent(schedule: {
  is_running: boolean
  run_total: number | null
  run_processed: number
}): number | null {
  if (!schedule.is_running || !schedule.run_total) return null
  return Math.min(100, Math.round((schedule.run_processed / schedule.run_total) * 100))
}
