import { normalizeRiskLevel } from '../utils/risk.ts';
import { isStoredDateTime } from '../utils/storedDateTime.ts';
import type { RecentAuditRecord } from '../content/recentReports.ts';

/**
 * Shared validation for the audit-row shape returned by the list endpoints.
 *
 * `GET /audits/recent` and `GET /tags/<tag>/audits` return the same row object,
 * so the checks live here rather than being duplicated in each API module and
 * allowed to drift apart.
 *
 * Dependency-free apart from the helpers it already uses, so it can be imported
 * by the Node test runner as well as the browser bundle.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * True when `value` is one audit row.
 *
 * `risk_level` is nullable, but a value that is present and unrecognised is a
 * contract violation: normalizing it to "Not rated" would hide the drift.
 */
export function isAuditRow(value: unknown): value is RecentAuditRecord {
  if (!isRecord(value)) return false;

  const validId =
    typeof value.audit_id === 'string'
      ? value.audit_id.trim().length > 0
      : isNonnegativeInteger(value.audit_id) && value.audit_id > 0;

  return (
    validId &&
    typeof value.title === 'string' &&
    isStoredDateTime(value.audit_date) &&
    isStoredDateTime(value.created_at) &&
    (value.risk_level === null || normalizeRiskLevel(value.risk_level) !== null) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0)
  );
}

/** The `pagination` block shared by every paginated endpoint. */
export interface Pagination {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

/**
 * True when `value` is a consistent pagination block for the requested page.
 *
 * `total_pages` is re-derived from `total_items` and `limit` so a server that
 * reports an impossible page count is treated as a broken response rather than
 * driving the pager into a bad state.
 */
export function isPagination(
  value: unknown,
  page: number,
  limit: number,
): value is Pagination {
  if (!isRecord(value)) return false;

  return (
    value.page === page &&
    value.limit === limit &&
    isNonnegativeInteger(value.total_items) &&
    isNonnegativeInteger(value.total_pages) &&
    value.total_pages === Math.ceil(value.total_items / limit)
  );
}

/**
 * Number of rows a consistent page should contain.
 *
 * Used together with `isPagination` to reject a page whose row count does not
 * match its own totals, and to catch duplicate ids (which break Data Grid keys).
 */
export function expectedRowCount(
  pagination: Pagination,
  rows: readonly RecentAuditRecord[],
): boolean {
  const expected = Math.max(
    0,
    Math.min(
      pagination.limit,
      pagination.total_items - (pagination.page - 1) * pagination.limit,
    ),
  );
  if (rows.length !== expected) return false;

  // Grid row keys must be unique, including mixed legacy/string identifiers.
  const ids = rows.map((row) => String(row.audit_id));
  return new Set(ids).size === ids.length;
}
