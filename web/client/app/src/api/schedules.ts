/**
 * Client for `GET /schedules` and `DELETE /schedules/<id>`.
 *
 * The response is validated field by field rather than cast, matching the other
 * API clients in this folder: an unexpected shape raises a `SourceApiError`
 * with a user-facing message instead of letting a bad row reach the table.
 */

export type ScanStatus = 'ACTIVE' | 'UNSUPPORTED' | 'DISABLED'
export type RunStatus = 'SUCCESS' | 'ERROR' | null

export interface Schedule {
  schedule_id: number
  source_link: string
  scan_frequency: string
  scan_status: ScanStatus
  /** Whether a spider exists for this source, per the server's allow-list. */
  is_supported: boolean
  last_run_at: string | null
  last_run_status: RunStatus
  next_run_at: string | null
  created_at: string | null
  created_by: number | null
  created_by_username: string | null
  report_count: number
}

export class ScheduleApiError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'ScheduleApiError'
    this.status = details.status
    this.code = details.code
  }
}

interface RequestOptions {
  fetcher?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
}

const SCAN_STATUSES: readonly ScanStatus[] = ['ACTIVE', 'UNSUPPORTED', 'DISABLED']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isSchedule(value: unknown): value is Schedule {
  if (!isRecord(value)) return false
  return (
    typeof value.schedule_id === 'number'
    && Number.isSafeInteger(value.schedule_id)
    && value.schedule_id > 0
    && typeof value.source_link === 'string'
    && value.source_link.trim().length > 0
    && typeof value.scan_frequency === 'string'
    && SCAN_STATUSES.includes(value.scan_status as ScanStatus)
    && typeof value.is_supported === 'boolean'
    && isNullableString(value.last_run_at)
    && isNullableString(value.last_run_status)
    && isNullableString(value.next_run_at)
    && isNullableString(value.created_at)
    && typeof value.report_count === 'number'
    && Number.isSafeInteger(value.report_count)
    && value.report_count >= 0
  )
}

/** Extracts the error envelope's message and code, when the body is one. */
function errorDetails(body: unknown): { message?: string; code?: string } {
  if (!isRecord(body) || !isRecord(body.error)) return {}
  const { code, message } = body.error
  return {
    message: typeof message === 'string' && message.trim() ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
  }
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export async function fetchSchedules(
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions = {},
): Promise<Schedule[]> {
  const effective = requestSignal(signal, timeoutMs)
  let response: Response

  try {
    response = await fetcher('/api/schedules', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: effective,
    })
  } catch {
    const message = effective.aborted
      ? 'Loading schedules timed out. Please try again.'
      : 'Could not reach the schedule service.'
    throw new ScheduleApiError(message, { code: 'NETWORK_ERROR' })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const details = errorDetails(body)
    const fallback = response.status === 401
      ? 'Your session has expired. Please sign in again.'
      : 'The schedules could not be loaded.'
    throw new ScheduleApiError(details.message ?? fallback, {
      status: response.status,
      code: details.code,
    })
  }

  if (!isRecord(body) || !Array.isArray(body.data) || !body.data.every(isSchedule)) {
    throw new ScheduleApiError(
      'The server returned an unexpected schedule list.',
      { status: response.status, code: 'UNEXPECTED_RESPONSE' },
    )
  }

  return body.data
}

/**
 * Deletes one schedule.
 *
 * Resolves on `204`. A `409` means the schedule still has reports and the
 * server refused; that message is surfaced verbatim, because it names the count
 * and explains what the operator must do instead.
 */
export async function deleteSchedule(
  scheduleId: number,
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions = {},
): Promise<void> {
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
    throw new ScheduleApiError('Invalid schedule.', { code: 'INVALID_SCHEDULE' })
  }

  const effective = requestSignal(signal, timeoutMs)
  let response: Response

  try {
    response = await fetcher(`/api/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: effective,
    })
  } catch {
    const message = effective.aborted
      ? 'Deleting the schedule timed out.'
      : 'Could not reach the schedule service.'
    throw new ScheduleApiError(message, { code: 'NETWORK_ERROR' })
  }

  if (response.status === 204) return

  // A 204 has no body; every other status carries the error envelope when the
  // server could produce one, so an unparseable body is tolerated.
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const details = errorDetails(body)
  const fallback = response.status === 403
    ? 'Only an administrator can delete a schedule.'
    : response.status === 404
      ? 'That schedule no longer exists.'
      : response.status === 401
        ? 'Your session has expired. Please sign in again.'
        : 'The schedule could not be deleted.'
  throw new ScheduleApiError(details.message ?? fallback, {
    status: response.status,
    code: details.code,
  })
}
