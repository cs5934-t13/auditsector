/**
 * Risk-level helpers.
 *
 * Dependency-free and free of app data (like `utils/tags.ts`), so the ordering
 * and scoring rules can be unit-tested directly and reused by both the data
 * layer and the charts.
 *
 * Mirrors the database: `audit_headers.risk_level` is
 * `ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')` and nullable, so every
 * helper accepts `null` for a report that has not been classified yet.
 */

/** Risk levels, least to most severe. The order is the severity order. */
export const RISK_LEVELS = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

/** One of the database's risk levels. */
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** A report count per risk level. */
export type RiskCounts = Record<RiskLevel, number>;

const RISK_LEVEL_SET = new Set<string>(RISK_LEVELS);

/** Numeric score for a level: `1` for INFO through `5` for CRITICAL. */
export function riskScore(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level) + 1;
}

/**
 * Sort rank for a level, where an unclassified report ranks below INFO.
 *
 * Used to order rows by severity and to place "Not rated" reports first in an
 * ascending sort instead of scattering them alphabetically among the levels.
 */
export function riskRank(level: RiskLevel | null | undefined): number {
  return level ? riskScore(level) : 0;
}

/** Orders two levels by severity, unclassified first. */
export function compareRiskLevels(
  a: RiskLevel | null | undefined,
  b: RiskLevel | null | undefined,
): number {
  return riskRank(a) - riskRank(b);
}

/**
 * Normalizes a level coming from outside the app (API, database, form input).
 *
 * Accepts either casing (`INFO`, `info`, `Info`) and the long form
 * `INFORMATIONAL`. Anything unrecognised — including `null` and empty strings —
 * becomes `null`, so callers render "Not rated" instead of an arbitrary string.
 */
export function normalizeRiskLevel(value: unknown): RiskLevel | null {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim().toUpperCase();
  if (!token) {
    return null;
  }

  if (token === 'INFORMATIONAL') {
    return 'INFO';
  }

  return RISK_LEVEL_SET.has(token) ? (token as RiskLevel) : null;
}

/** An all-zero count for every level, so callers can add into it in place. */
export function emptyRiskCounts(): RiskCounts {
  return { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}

/**
 * Counts reports per risk level.
 *
 * Also returns `unrated`, the number of reports with no level, because those
 * are excluded from the per-level counts but still matter for a total.
 */
export function countRiskLevels(
  reports: readonly { riskLevel?: RiskLevel | null }[],
): { counts: RiskCounts; unrated: number } {
  const counts = emptyRiskCounts();
  let unrated = 0;

  for (const report of reports) {
    const level = normalizeRiskLevel(report.riskLevel);
    if (level) {
      counts[level] += 1;
    } else {
      unrated += 1;
    }
  }

  return { counts, unrated };
}

/** Adds several per-level count objects together, e.g. periods into totals. */
export function sumRiskCounts(list: readonly RiskCounts[]): RiskCounts {
  const total = emptyRiskCounts();

  for (const counts of list) {
    for (const level of RISK_LEVELS) {
      total[level] += counts[level];
    }
  }

  return total;
}

/** Number of reports represented by `counts`. */
export function totalRiskCounts(counts: RiskCounts): number {
  return RISK_LEVELS.reduce((sum, level) => sum + counts[level], 0);
}

/** Reports at HIGH or CRITICAL, the levels that need attention. */
export function highRiskCount(counts: RiskCounts): number {
  return counts.HIGH + counts.CRITICAL;
}

/**
 * Mean score (1–5) across a per-level count, or `null` when there is nothing
 * rated to average.
 */
export function averageRiskScoreOfCounts(counts: RiskCounts): number | null {
  const rated = totalRiskCounts(counts);
  if (rated === 0) {
    return null;
  }

  const sum = RISK_LEVELS.reduce(
    (acc, level) => acc + riskScore(level) * counts[level],
    0,
  );

  return sum / rated;
}

/**
 * Mean score (1–5) across the reports that have a risk level. Unclassified
 * reports are skipped rather than counted as zero, and a set with no rated
 * reports averages to `null`.
 */
export function averageRiskScore(
  reports: readonly { riskLevel?: RiskLevel | null }[],
): number | null {
  return averageRiskScoreOfCounts(countRiskLevels(reports).counts);
}
