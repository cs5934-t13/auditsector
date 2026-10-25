import { getSourceUrlError } from '../components/sourceUrl.ts'

export type SourceFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export type SavedSource = {
  schedule_id: number
  created_by: number
  source_link: string
  scan_frequency: SourceFrequency
}

export class SourceApiError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message)
    this.name = 'SourceApiError'
    this.status = details.status
    this.code = details.code
  }
}

type CreateSourceOptions = {
  fetcher?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSavedSource(value: unknown): value is SavedSource {
  return isRecord(value)
    && typeof value.schedule_id === 'number'
    && Number.isSafeInteger(value.schedule_id) && value.schedule_id > 0
    && typeof value.created_by === 'number'
    && Number.isSafeInteger(value.created_by) && value.created_by > 0
    && typeof value.source_link === 'string' && value.source_link.trim().length > 0
    && ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(String(value.scan_frequency))
}

export async function createSource(
  input: { user: string; sourceUrl: string },
  { fetcher = fetch, timeoutMs = 15_000, signal }: CreateSourceOptions = {},
): Promise<SavedSource> {
  const user = input.user.trim()
  if (!user) throw new SourceApiError('Sign in before adding a source.', { code: 'MISSING_USER' })
  const validationError = getSourceUrlError(input.sourceUrl)
  if (validationError) throw new SourceApiError(validationError, { code: 'INVALID_SOURCE' })

  // The approved contract specifies POST query parameters, not a JSON body.
  // Omit frequency so AW-73 can add its selector independently (default: WEEKLY).
  const query = new URLSearchParams({ user, source: input.sourceUrl.trim() })
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  let response: Response

  try {
    response = await fetcher(`/api/sources?${query}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: requestSignal,
    })
  } catch {
    const message = timeoutSignal.aborted
      ? 'The request timed out.'
      : requestSignal.aborted
        ? 'The request was cancelled.'
        : 'Could not reach the source service.'
    throw new SourceApiError(`${message} Saving could not be confirmed; check before trying again.`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null
    const code = error && typeof error.code === 'string' ? error.code : undefined
    const fallback = response.status === 404
      ? 'The source endpoint is not available.'
      : response.status === 401 || response.status === 403
        ? 'Your request was not authorized. Please sign in again.'
        : 'The source could not be saved. Please try again later.'
    const message = error && typeof error.message === 'string' && error.message.trim()
      ? error.message
      : fallback
    throw new SourceApiError(message, { status: response.status, code })
  }

  // The contract says 200; AW-22's acceptance criterion says 201. Support both.
  if ((response.status === 200 || response.status === 201)
    && isRecord(body) && Array.isArray(body.data)
    && body.data.length === 1 && isSavedSource(body.data[0])) {
    return body.data[0]
  }

  throw new SourceApiError(
    'The server returned an unexpected response. The source may have been saved; check before trying again.',
    { status: response.status, code: 'UNEXPECTED_RESPONSE' },
  )
}
