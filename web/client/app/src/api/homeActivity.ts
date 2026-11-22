import { RISK_LEVELS, type RiskCounts } from '../utils/risk.ts';

/**
 * Homepage activity endpoints.
 *
 * Both charts on the signed-in homepage are fed by aggregates over
 * `audit_headers`, so they share one module: the request, error envelope, and
 * response validation are identical apart from the per-bucket shape.
 *
 * - `fetchRiskOverTime` → `GET /api/audits/risk-over-time`
 * - `fetchScanActivity` → `GET /api/audits/scan-activity`
 *
 * Buckets are keyed on `audit_date` for risk (the report's own timeline) and on
 * `created_at` for scans (when the fetcher inserted the record).
 */

/** One bucket of the risk chart, chart-ready. */
export interface RiskActivityPoint extends RiskCounts {
  /** Bucket start, e.g. `2026-01`. Stable key; use `label` for display. */
  period: string;
  /** Short x-axis label from the server, e.g. `Jan`. */
  label: string;
  /** Reports with no `risk_level`; excluded from the five stacked bands. */
  unrated: number;
  /** Every report in the bucket, including unrated ones. */
  total: number;
}

/** One bucket of the scan chart, chart-ready. */
export interface ScanActivityPoint {
  /** Bucket start, e.g. `2026-01`. Stable key; use `label` for display. */
  period: string;
  /** Short x-axis label from the server, e.g. `Jan`. */
  label: string;
  /** Reports inserted during the bucket. */
  scans: number;
}

export type ActivityInterval = 'DAY' | 'WEEK' | 'MONTH';

export interface ActivityRange {
  /** First day included, `YYYY-MM-DD`. Omit for the server default range. */
  startDate?: string;
  /** Last day included, `YYYY-MM-DD`. Omit for the server default range. */
  endDate?: string;
  interval?: ActivityInterval;
}

export class HomeActivityApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'HomeActivityApiError';
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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Every bucket needs a stable key and a non-empty axis label. */
function isBucketHeader(value: Record<string, unknown>): boolean {
  return (
    typeof value.period === 'string' &&
    value.period.trim().length > 0 &&
    typeof value.label === 'string' &&
    value.label.trim().length > 0
  );
}

function parseRiskPoint(value: unknown): RiskActivityPoint | null {
  if (!isRecord(value) || !isBucketHeader(value) || !isCount(value.total)) {
    return null;
  }

  const counts = value.counts;
  if (!isRecord(counts)) {
    return null;
  }

  const point: RiskActivityPoint = {
    period: value.period as string,
    label: value.label as string,
    unrated: 0,
    total: value.total,
    INFO: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  for (const level of RISK_LEVELS) {
    if (!isCount(counts[level])) return null;
    point[level] = counts[level];
  }

  if (!isCount(counts.UNRATED)) return null;
  point.unrated = counts.UNRATED;

  // The bands plus the unrated remainder must account for the bucket exactly;
  // otherwise the chart's bar height would contradict its own total.
  const accounted = RISK_LEVELS.reduce((sum, level) => sum + point[level], point.unrated);
  return accounted === point.total ? point : null;
}

function parseScanPoint(value: unknown): ScanActivityPoint | null {
  if (
    !isRecord(value) ||
    !isBucketHeader(value) ||
    !isCount(value.total)
  ) {
    return null;
  }

  return {
    period: value.period as string,
    label: value.label as string,
    scans: value.total,
  };
}

/** True when the buckets are strictly ascending by `period`, as the chart needs. */
function isAscending<T extends { period: string }>(points: readonly T[]): boolean {
  return points.every((point, index) => index === 0 || points[index - 1].period < point.period);
}

function buildQuery({ startDate, endDate, interval }: ActivityRange): string {
  const query = new URLSearchParams();
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  if (interval) query.set('interval', interval);
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

function requestFailure(
  timeout: AbortSignal,
  signal: AbortSignal,
  what: string,
): HomeActivityApiError {
  if (timeout.aborted) {
    return new HomeActivityApiError(`Loading ${what} timed out. Please try again.`, {
      code: 'REQUEST_TIMEOUT',
    });
  }
  if (signal.aborted) {
    return new HomeActivityApiError(`Loading ${what} was cancelled.`, {
      code: 'REQUEST_ABORTED',
    });
  }
  return new HomeActivityApiError(`Could not reach the report service. Please try again.`, {
    code: 'NETWORK_ERROR',
  });
}

/**
 * Shared request/validation pipeline for both activity endpoints.
 *
 * `parse` returns `null` for a bucket that does not match the contract, which
 * makes the whole response invalid rather than silently dropping rows.
 */
async function fetchActivity<TPoint extends { period: string }>(
  path: string,
  what: string,
  parse: (value: unknown) => TPoint | null,
  range: ActivityRange,
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions,
): Promise<TPoint[]> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    response = await fetcher(`${path}${buildQuery(range)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: requestSignal,
    });
  } catch {
    throw requestFailure(timeout, requestSignal, what);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (requestSignal.aborted) throw requestFailure(timeout, requestSignal, what);
    body = null;
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message =
      response.status === 401
        ? `Sign in to view ${what}.`
        : error && typeof error.message === 'string' && error.message.trim()
          ? error.message
          : `Unable to load ${what}. Please try again.`;
    throw new HomeActivityApiError(message, {
      status: response.status,
      code: error && typeof error.code === 'string' ? error.code : undefined,
    });
  }

  if (response.status !== 200 || !isRecord(body) || !Array.isArray(body.data)) {
    throw new HomeActivityApiError(
      'The report service returned an unexpected response. Please try again.',
      { status: response.status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  const points = body.data.map(parse);
  if (points.some((point) => point === null) || !isAscending(points as TPoint[])) {
    throw new HomeActivityApiError(
      'The report service returned an unexpected response. Please try again.',
      { status: response.status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  return points as TPoint[];
}

/**
 * Per-risk-level report counts per bucket, oldest first.
 *
 * Every bucket in the range is returned by the server, empty ones included, so
 * the caller never has to fill gaps.
 */
export function fetchRiskOverTime(
  range: ActivityRange = {},
  options: RequestOptions = {},
): Promise<RiskActivityPoint[]> {
  return fetchActivity('/api/audits/risk-over-time', 'risk levels over time', parseRiskPoint, range, options);
}

/** Reports added per bucket, oldest first. */
export function fetchScanActivity(
  range: ActivityRange = {},
  options: RequestOptions = {},
): Promise<ScanActivityPoint[]> {
  return fetchActivity('/api/audits/scan-activity', 'scan activity', parseScanPoint, range, options);
}
