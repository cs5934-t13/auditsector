import Link from '@mui/material/Link';
import type { GridColDef } from '@mui/x-data-grid';
import { Link as RouterLink } from 'react-router-dom';
import RiskLevelChip from './RiskLevelChip';
import TagLinks from './TagLinks';
import type { RecentAuditRecord } from '../content/recentReports';
import { auditReportPath } from '../routes';
import { BODY_LINK_SX } from '../theme';

/**
 * Renders a stored `YYYY-MM-DDTHH:MM:SS` value as a compact grid cell.
 *
 * Kept in the raw stored form (space instead of `T`) rather than localized,
 * because these columns are narrow and scanning a fixed-width timestamp is
 * easier than reading a long localized string.
 */
function formatGridDateTime(value: string): string {
  return value.replace('T', ' ');
}

/**
 * Columns shared by every recent-audits grid.
 *
 * The homepage panel and the paginated Audit Reports table render the same
 * server shape, so the definitions live here rather than being duplicated and
 * allowed to drift.
 */
export const recentAuditColumns: GridColDef<RecentAuditRecord>[] = [
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 260,
    // The title is the row's link to the report detail page. A real anchor
    // (rather than a row click handler) keeps the grid keyboard accessible,
    // openable in a new tab, and announced as a link.
    renderCell: ({ row }) => (
      <Link component={RouterLink} to={auditReportPath(row.audit_id)} sx={BODY_LINK_SX}>
        {row.title}
      </Link>
    ),
  },
  {
    field: 'risk_level',
    headerName: 'Risk level',
    width: 124,
    // Sort by severity rather than alphabetically; the server already orders by
    // recency, so this only matters when a user sorts this column.
    sortComparator: (a, b) => riskRankOf(a) - riskRankOf(b),
    renderCell: ({ row }) => <RiskLevelChip level={row.risk_level} />,
  },
  {
    field: 'tags',
    headerName: 'Tags',
    flex: 1,
    minWidth: 170,
    sortable: false,
    renderCell: ({ row }) =>
      row.tags.length > 0 ? <TagLinks tags={row.tags} /> : null,
  },
  {
    field: 'audit_date',
    headerName: 'Audit date',
    width: 190,
    valueFormatter: (value: string) => formatGridDateTime(value),
  },
  {
    field: 'created_at',
    headerName: 'Added',
    width: 190,
    valueFormatter: (value: string) => formatGridDateTime(value),
  },
];

/** Severity rank, so unrated sorts below INFO. */
function riskRankOf(level: RecentAuditRecord['risk_level']): number {
  return level ? ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(level) + 1 : 0;
}
