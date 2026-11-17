import type { RecentAuditRecord } from '../content/recentReports.ts';

export interface RecentAuditsResponse {
  data: RecentAuditRecord[];
  pagination: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}

export class RecentAuditsApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'RecentAuditsApiError';
    this.status = details.status;
    this.code = details.code;
  }
}

interface RequestOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStoredDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  // Check the calendar value without converting the string used for display.
  const date = new Date(`${value}Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === value;
}

function isAudit(value: unknown): value is RecentAuditRecord {
  if (!isRecord(value)) return false;
  const validId = typeof value.audit_id === 'string'
    ? value.audit_id.trim().length > 0
    : isNonnegativeInteger(value.audit_id) && value.audit_id > 0;
  return validId
    && typeof value.title === 'string'
    && isStoredDateTime(value.audit_date)
    && isStoredDateTime(value.created_at);
}

function isResponse(value: unknown, page: number, limit: number): value is RecentAuditsResponse {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) {
    return false;
  }
  const pagination = value.pagination;
  if (pagination.page !== page || pagination.limit !== limit
    || !isNonnegativeInteger(pagination.total_items)
    || !isNonnegativeInteger(pagination.total_pages)
    || pagination.total_pages !== Math.ceil(pagination.total_items / limit)
    || !value.data.every(isAudit)) {
    return false;
  }
  const expectedRows = Math.max(0, Math.min(limit, pagination.total_items - (page - 1) * limit));
  // Grid row keys must be unique, including mixed legacy/string identifiers.
  const ids = value.data.map((row: RecentAuditRecord) => String(row.audit_id));
  return value.data.length === expectedRows && new Set(ids).size === ids.length;
}

function requestFailure(timeout: AbortSignal, signal: AbortSignal): RecentAuditsApiError {
  if (timeout.aborted) {
    return new RecentAuditsApiError('Loading recent reports timed out. Please try again.', {
      code: 'REQUEST_TIMEOUT',
    });
  }
  if (signal.aborted) {
    return new RecentAuditsApiError('Loading recent reports was cancelled.', {
      code: 'REQUEST_ABORTED',
    });
  }
  return new RecentAuditsApiError('Could not reach the report service. Please try again.', {
    code: 'NETWORK_ERROR',
  });
}

export async function fetchRecentAudits(
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions = {},
): Promise<RecentAuditsResponse> {
  if (!isNonnegativeInteger(page) || page < 1
    || !isNonnegativeInteger(limit) || limit < 1 || limit > 100) {
    throw new RecentAuditsApiError('Invalid recent reports pagination.', {
      code: 'INVALID_PAGINATION',
    });
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  let response: Response;
  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    response = await fetcher(`/api/audits/recent?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: requestSignal,
    });
  } catch {
    throw requestFailure(timeout, requestSignal);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (requestSignal.aborted) throw requestFailure(timeout, requestSignal);
    body = null;
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message = response.status === 401
      ? 'Sign in to view recent reports.'
      : error && typeof error.message === 'string' && error.message.trim()
        ? error.message
        : 'Unable to retrieve recent reports. Please try again.';
    throw new RecentAuditsApiError(message, {
      status: response.status,
      code: error && typeof error.code === 'string' ? error.code : undefined,
    });
  }

  if (response.status !== 200 || !isResponse(body, page, limit)) {
    throw new RecentAuditsApiError('The report service returned an unexpected response. Please try again.', {
      status: response.status,
      code: 'UNEXPECTED_RESPONSE',
    });
  }
  return body;
}
