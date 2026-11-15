/**
 * Display metadata for audit report risk levels.
 *
 * The levels and their order come from `utils/risk.ts`; this file only adds the
 * presentation details (labels, short descriptions, colors) so the helpers stay
 * dependency-free and testable.
 *
 * Matches `audit_headers.risk_level`:
 * `ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL`.
 */
import { RISK_LEVELS, type RiskLevel } from '../utils/risk';

export interface RiskLevelMeta {
  level: RiskLevel;
  /** Display label, e.g. "Medium". */
  label: string;
  /** One line explaining what the level means. */
  description: string;
  /**
   * Color for chips and chart series. Never the only signal: every surface
   * also shows the label text, so the level is not conveyed by color alone.
   */
  color: string;
}

/** Metadata per level, keyed by the database value. */
export const RISK_LEVEL_META: Record<RiskLevel, RiskLevelMeta> = {
  INFO: {
    level: 'INFO',
    label: 'Informational',
    description: 'Noted for awareness; no action required.',
    color: '#4A5A64',
  },
  LOW: {
    level: 'LOW',
    label: 'Low',
    description: 'Minor observations that can be handled in normal course.',
    color: '#1E6B4F',
  },
  MEDIUM: {
    level: 'MEDIUM',
    label: 'Medium',
    description: 'Findings that warrant a planned response.',
    color: '#A15C00',
  },
  HIGH: {
    level: 'HIGH',
    label: 'High',
    description: 'Significant findings needing prompt attention.',
    color: '#B3401F',
  },
  CRITICAL: {
    level: 'CRITICAL',
    label: 'Critical',
    description: 'Severe findings that need immediate action.',
    color: '#8C1D18',
  },
};

/** Every level, least to most severe — the order used by charts and selectors. */
export const RISK_LEVEL_OPTIONS: readonly RiskLevelMeta[] = RISK_LEVELS.map(
  (level) => RISK_LEVEL_META[level],
);

/** Label used when a report has no `risk_level` yet. */
export const UNRATED_RISK_LABEL = 'Not rated';

/** Color used when a report has no `risk_level` yet. */
export const UNRATED_RISK_COLOR = '#7B848A';

/** Display label for a level, falling back to "Not rated". */
export function riskLevelLabel(level: RiskLevel | null | undefined): string {
  return level ? RISK_LEVEL_META[level].label : UNRATED_RISK_LABEL;
}

/** Color for a level, falling back to the neutral unrated color. */
export function riskLevelColor(level: RiskLevel | null | undefined): string {
  return level ? RISK_LEVEL_META[level].color : UNRATED_RISK_COLOR;
}

/** One-line explanation for a level, or the unrated explanation. */
export function riskLevelDescription(
  level: RiskLevel | null | undefined,
): string {
  return level
    ? RISK_LEVEL_META[level].description
    : 'This report has not been assigned a risk level.';
}
