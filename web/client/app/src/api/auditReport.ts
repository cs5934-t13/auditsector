import { isStoredDateTime } from '../utils/storedDateTime.ts';
import { isRunStatus, type RunStatus } from '../utils/runStatus.ts';
import { normalizeRiskLevel, type RiskLevel } from '../utils/risk.ts';

/**
 * A single audit report from `GET /api/audits/<audit_id>`.
 *
 * The response is validated field by field rather than cast, so a contract
 * change surfaces as a handled error instead of a page that renders empty
 * fields or crashes on `undefined`.
 */
export interface AuditReportTag {
  tag_id: number;
  /** Display name, e.g. "Human Resources". */
  name: string;
  /** Optional tag description; `null` when the tag has none. */
  description: string | null;
}

export interface AuditReport {
  /** Opaque identifier; the endpoint returns it as a string. */
  audit_id: string;
  /** Schedule that produced this report; `null` for imported records. */
  scheduleId: number | null;
  title: string;
  /** Reporting municipality, e.g. "Portland". */
  municipality: string;
  /** Link to the original audit document; empty when none was recorded. */
  auditUrl: string;
  /** Stored publication/report date, `YYYY-MM-DDTHH:MM:SS`. */
  auditDate: string;
  /** Classified level, or `null` when the report has not been classified. */
  riskLevel: RiskLevel | null;
  /** Pipeline status of the scan that produced the record. */
  runStatus: RunStatus | null;
  /** AI-generated summary; `null` until the scan produces one. */
  summary: string | null;
  /** Stored record-creation time, `YYYY-MM-DDTHH:MM:SS`. */
  createdAt: string;
  /** Every tag on the report, ordered by name by the server. */
  tags: readonly AuditReportTag[];
}

export class AuditReportApiError extends Error {
  /** HTTP status, or `undefined` for a network/timeout failure. */
  readonly status?: number;
  /** Machine-readable code from the server's error envelope. */
  readonly code?: string;
  /** True when the identifier does not match any report. */
  readonly notFound: boolean;

  constructor(
    message: string,
    details: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = 'AuditReportApiError';
    this.status = details.status;
    this.code = details.code;
    this.notFound = details.status === 404 || details.code === 'AUDIT_NOT_FOUND';
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTag(value: unknown): value is AuditReportTag {
  return (
    isRecord(value) &&
    typeof value.tag_id === 'number' &&
    Number.isSafeInteger(value.tag_id) &&
    value.tag_id > 0 &&
    isNonEmptyString(value.name) &&
    (value.description === null || typeof value.description === 'string')
  );
}

/**
 * Optional text fields that the server may legitimately return as `null` or an
 * empty string. Both are normalized to `null` so the UI has one empty case.
 */
function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value.trim() || null : undefined;
}

function parseReport(value: unknown): AuditReport | null {
  if (!isRecord(value)) {
    return null;
  }

  const summary = optionalText(value.summary);
  const municipality = optionalText(value.muni ?? value.municipality);
  const auditUrl = optionalText(value.audit_url ?? value.auditUrl);

  // `undefined` from `optionalText` means the field was present but not a
  // string, which is a contract violation rather than a missing value.
  if (summary === undefined || municipality === undefined || auditUrl === undefined) {
    return null;
  }

  const tags = value.tags;
  if (!Array.isArray(tags) || !tags.every(isTag)) {
    return null;
  }

  if (
    !isNonEmptyString(value.audit_id) ||
    !isNonEmptyString(value.title) ||
    !isStoredDateTime(value.audit_date ?? value.auditDate) ||
    !isStoredDateTime(value.created_at ?? value.createdAt)
  ) {
    return null;
  }

  const scheduleId = value.schedule_id ?? value.scheduleId;
  if (
    scheduleId !== null &&
    scheduleId !== undefined &&
    !(typeof scheduleId === 'number' && Number.isSafeInteger(scheduleId) && scheduleId > 0)
  ) {
    return null;
  }

  const rawStatus = value.run_status ?? value.runStatus;
  if (rawStatus !== null && rawStatus !== undefined && !isRunStatus(rawStatus)) {
    return null;
  }

  // `risk_level` is nullable, but a value that is present and unrecognised is a
  // contract violation. Normalizing it to "Not rated" would hide the drift.
  const rawRisk = value.risk_level ?? value.riskLevel;
  const riskLevel = normalizeRiskLevel(rawRisk);
  if (rawRisk !== null && rawRisk !== undefined && riskLevel === null) {
    return null;
  }

  return {
    audit_id: value.audit_id,
    scheduleId:
      typeof scheduleId === 'number' ? scheduleId : null,
    title: value.title.trim(),
    municipality: municipality ?? '',
    auditUrl: auditUrl ?? '',
    auditDate: (value.audit_date ?? value.auditDate) as string,
    riskLevel,
    runStatus: isRunStatus(rawStatus) ? rawStatus : null,
    summary,
    createdAt: (value.created_at ?? value.createdAt) as string,
    tags,
  };
}

function requestFailure(timeout: AbortSignal, signal: AbortSignal): AuditReportApiError {
  if (timeout.aborted) {
    return new AuditReportApiError(
      'Loading the audit report timed out. Please try again.',
      { code: 'REQUEST_TIMEOUT' },
    );
  }
  if (signal.aborted) {
    return new AuditReportApiError(
      'Loading the audit report was cancelled.',
      { code: 'REQUEST_ABORTED' },
    );
  }
  return new AuditReportApiError(
    'Could not reach the report service. Please try again.',
    { code: 'NETWORK_ERROR' },
  );
}

/**
 * Fetches one audit report by id.
 *
 * @throws {AuditReportApiError} On an invalid id, a failed request, a
 *   malformed response, or when no report matches (`error.notFound`).
 */
export async function fetchAuditReport(
  auditId: string,
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions = {},
): Promise<AuditReport> {
  const trimmedId = auditId.trim();
  if (!trimmedId) {
    throw new AuditReportApiError('An audit report id is required.', {
      code: 'INVALID_AUDIT_ID',
    });
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    response = await fetcher(`/api/audits/${encodeURIComponent(trimmedId)}`, {
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

  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const errorCode = error && typeof error.code === 'string' ? error.code : undefined;

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Sign in to view this audit report.'
        : response.status === 404
          ? 'That audit report could not be found.'
          : error && isNonEmptyString(error.message)
            ? error.message
            : 'Unable to load the audit report. Please try again.';
    throw new AuditReportApiError(message, { status: response.status, code: errorCode });
  }

  const report = isRecord(body) ? parseReport(body.data) : null;
  if (response.status !== 200 || report === null) {
    throw new AuditReportApiError(
      'The report service returned an unexpected response. Please try again.',
      { status: response.status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  return report;
}
