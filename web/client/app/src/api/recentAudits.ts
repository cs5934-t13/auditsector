import {
  expectedRowCount,
  isAuditRow,
  isNonnegativeInteger,
  isPagination,
  isRecord,
  type Pagination,
} from './auditRow.ts';
import type { RecentAuditRecord } from '../content/recentReports.ts';

export interface RecentAuditsResponse {
  data: RecentAuditRecord[];
  pagination: Pagination;
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

function isResponse(
  value: unknown,
  page: number,
  limit: number,
): value is RecentAuditsResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !isPagination(value.pagination, page, limit) ||
    !value.data.every(isAuditRow)
  ) {
    return false;
  }

  return expectedRowCount(value.pagination, value.data as RecentAuditRecord[]);
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
