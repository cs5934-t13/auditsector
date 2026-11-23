import {
  expectedRowCount,
  isAuditRow,
  isNonnegativeInteger,
  isPagination,
  isRecord,
  type Pagination,
} from './auditRow.ts';
import type { RecentAuditRecord } from '../content/recentReports.ts';

/**
 * Tag endpoints.
 *
 * - `fetchTags` → `GET /api/tags`: every tag with its report count, for the
 *   `/tags` index.
 * - `fetchTagAudits` → `GET /api/tags/<tag>/audits`: the reports carrying one
 *   tag, newest first, paginated.
 *
 * The tag detail response reuses the audit-row shape from `/audits/recent`, so
 * both pages can share the same table columns and row validation.
 */

/**
 * The tagging rule for a tag: the inclusion rule and the exclusion rule.
 *
 * Both are optional because they are stored on the tag row by the seed, and a
 * tag added by a user (or a database that predates the columns) has neither.
 */
export interface TagRule {
  /** What a report must substantially examine to carry the tag. */
  description: string | null;
  /** What nearby topic does *not* qualify on its own. */
  boundary: string | null;
}

/** One tag and how many distinct reports carry it. */
export interface TagSummary extends TagRule {
  tag_id: number;
  /** Display name, e.g. "Information Technology". */
  name: string;
  /** Number of distinct reports carrying the tag; `0` for an unused tag. */
  reportCount: number;
}

/** The tag a detail request resolved to. */
export interface ResolvedTag extends TagRule {
  tag_id: number;
  name: string;
}

/** Columns `GET /tags/<tag>/audits` can order by. */
export type TagAuditSort = 'title' | 'audit_date' | 'created_at' | 'risk_level';
export type SortOrder = 'asc' | 'desc';

export interface TagAuditsSort {
  sort: TagAuditSort;
  order: SortOrder;
}

export interface TagAuditsResponse {
  data: RecentAuditRecord[];
  /** Canonical tag row, so the page can show the server's display casing. */
  tag: ResolvedTag;
  pagination: Pagination;
  /** The ordering the server actually applied, which may differ from the request. */
  sort: TagAuditsSort;
}

export class TagsApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  /** True when the URL segment does not match any tag. */
  readonly notFound: boolean;

  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'TagsApiError';
    this.status = details.status;
    this.code = details.code;
    this.notFound = details.status === 404 || details.code === 'TAG_NOT_FOUND';
  }
}

interface RequestOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One tag as the wire format sends it, before field renaming. */
interface TagSummaryWire {
  tag_id: number;
  name: string;
  report_count: number;
  description: string | null;
  boundary: string | null;
}

/**
 * Rule text is either absent or a string. Forgiving about `undefined` so a
 * response from a database without the newer `boundary` column still parses.
 */
function isOptionalText(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function isTagSummary(value: unknown): value is TagSummaryWire {
  return (
    isRecord(value) &&
    typeof value.tag_id === 'number' &&
    Number.isSafeInteger(value.tag_id) &&
    value.tag_id > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    isNonnegativeInteger(value.report_count) &&
    isOptionalText(value.description) &&
    isOptionalText(value.boundary)
  );
}

function isResolvedTag(value: unknown): value is ResolvedTag {
  return (
    isRecord(value) &&
    typeof value.tag_id === 'number' &&
    Number.isSafeInteger(value.tag_id) &&
    value.tag_id > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    isOptionalText(value.description) &&
    isOptionalText(value.boundary)
  );
}

function isTagAuditsResponse(
  value: unknown,
  page: number,
  limit: number,
): value is TagAuditsResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !isResolvedTag(value.tag) ||
    !isPagination(value.pagination, page, limit) ||
    !value.data.every(isAuditRow)
  ) {
    return false;
  }

  return expectedRowCount(value.pagination, value.data as RecentAuditRecord[]);
}

function requestFailure(
  timeout: AbortSignal,
  signal: AbortSignal,
  what: string,
): TagsApiError {
  if (timeout.aborted) {
    return new TagsApiError(`Loading ${what} timed out. Please try again.`, {
      code: 'REQUEST_TIMEOUT',
    });
  }
  if (signal.aborted) {
    return new TagsApiError(`Loading ${what} was cancelled.`, {
      code: 'REQUEST_ABORTED',
    });
  }
  return new TagsApiError('Could not reach the report service. Please try again.', {
    code: 'NETWORK_ERROR',
  });
}

/**
 * Issues one request and returns the parsed JSON body.
 *
 * Throws a `TagsApiError` for a transport failure, a non-2xx response, or a
 * body that is not JSON; the caller decides what a valid body looks like.
 */
async function requestJson(
  path: string,
  what: string,
  { fetcher = fetch, timeoutMs = 15_000, signal }: RequestOptions,
): Promise<{ status: number; body: unknown }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    response = await fetcher(path, {
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
    throw new TagsApiError(message, {
      status: response.status,
      code: error && typeof error.code === 'string' ? error.code : undefined,
    });
  }

  return { status: response.status, body };
}

/**
 * Every tag with its report count, in server order (alphabetical by name).
 *
 * The client renders the list as received: sorting again here would hide a
 * regression in the endpoint and could disagree with the server's collation.
 *
 * Tags with no reports are included, because they are still valid destinations
 * on the `/tags` index.
 */
export async function fetchTags(
  options: RequestOptions = {},
): Promise<TagSummary[]> {
  const { status, body } = await requestJson('/api/tags', 'tags', options);

  if (status !== 200 || !isRecord(body) || !Array.isArray(body.data)
    || !body.data.every(isTagSummary)) {
    throw new TagsApiError(
      'The report service returned an unexpected response. Please try again.',
      { status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  const tags = body.data.map((tag: TagSummaryWire) => ({
    tag_id: tag.tag_id,
    name: tag.name,
    reportCount: tag.report_count,
    description: tag.description ?? null,
    boundary: tag.boundary ?? null,
  }));

  // Duplicate names would make the index ambiguous (and break React keys).
  const names = tags.map((tag) => tag.name);
  if (new Set(names).size !== names.length) {
    throw new TagsApiError(
      'The report service returned an unexpected response. Please try again.',
      { status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  return tags;
}

/**
 * Reports carrying one tag, newest first.
 *
 * `tag` may be the display name or the client's slug; the server normalizes it
 * the same way `tagSlug()` does, so either form resolves.
 *
 * @throws {TagsApiError} With `error.notFound` when no tag matches.
 */
export async function fetchTagAudits(
  tag: string,
  {
    page = 1,
    limit = 20,
    sort,
    order,
  }: { page?: number; limit?: number; sort?: TagAuditSort; order?: SortOrder } = {},
  options: RequestOptions = {},
): Promise<TagAuditsResponse> {
  const segment = tag.trim();
  if (!segment) {
    throw new TagsApiError('A tag name is required.', { code: 'INVALID_TAG' });
  }
  if (!isNonnegativeInteger(page) || page < 1
    || !isNonnegativeInteger(limit) || limit < 1 || limit > 100) {
    throw new TagsApiError('Invalid tag audit pagination.', {
      code: 'INVALID_PAGINATION',
    });
  }

  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  // Omitted rather than defaulted, so the server's default stays authoritative.
  if (sort) query.set('sort', sort);
  if (order) query.set('order', order);
  const path = `/api/tags/${encodeURIComponent(segment)}/audits?${query}`;
  const { status, body } = await requestJson(
    path,
    `audits tagged ${segment}`,
    options,
  );

  if (status !== 200 || !isTagAuditsResponse(body, page, limit)) {
    throw new TagsApiError(
      'The report service returned an unexpected response. Please try again.',
      { status, code: 'UNEXPECTED_RESPONSE' },
    );
  }

  return {
    data: body.data,
    tag: {
      tag_id: body.tag.tag_id,
      name: body.tag.name,
      description: body.tag.description ?? null,
      boundary: body.tag.boundary ?? null,
    },
    pagination: body.pagination,
    // Read from the response, not echoed from the request: the server may have
    // rejected an unknown column and applied its default.
    sort: body.sort ?? { sort: 'audit_date', order: 'desc' },
  };
}
