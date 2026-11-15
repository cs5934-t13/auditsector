import type { ReactNode } from 'react';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SectionPanel from './SectionPanel';
import RiskLevelChip from './RiskLevelChip';
import TagLinks from './TagLinks';
import type { RecentAudit } from '../content/recentAudits';
import { formatDate } from '../utils/formatDate';
import { compareRiskLevels } from '../utils/risk';
import { LINK_ACCENT } from '../theme';

/**
 * Columns. `flex` and `minWidth` keep long titles readable and stop the date
 * and tag columns from being squeezed to unreadable widths.
 */
const columns: GridColDef<RecentAudit>[] = [
  {
    field: 'date',
    headerName: 'Date',
    width: 130,
    valueFormatter: (value: RecentAudit['date']) => formatDate(value),
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 260,
  },
  {
    field: 'riskLevel',
    headerName: 'Risk level',
    width: 124,
    // Sort by severity (INFO → CRITICAL), not alphabetically, so the most
    // urgent reports group together. Unrated reports sort below INFO.
    sortComparator: (a, b) => compareRiskLevels(a, b),
    renderCell: ({ row }) => <RiskLevelChip level={row.riskLevel} />,
  },
  {
    field: 'tags',
    headerName: 'Tags',
    flex: 1,
    minWidth: 170,
    sortable: false,
    renderCell: ({ row }) => <TagLinks tags={row.tags} />,
  },
];

interface AuditReportsTableProps {
  /** Heading text; the page supplies its own, so this is often omitted. */
  title?: string;
  /** Supporting line beneath the heading. */
  description?: ReactNode;
  /** Element id for the heading, so a page can name its section by it. */
  headingId?: string;
  /** Heading level. Defaults to `h2`; use `h2` inside a page whose `h1` is above. */
  headingComponent?: 'h2' | 'h3';
  /** Rows to show, newest first. */
  rows: readonly RecentAudit[];
  /** Accessible name for the grid. */
  ariaLabel: string;
  /** Shown in place of the grid when there are no rows. */
  emptyMessage: string;
  sx?: SxProps<Theme>;
}

/**
 * Read-only audit report table used by the homepage and tag pages.
 *
 * Presentational only: callers own the heading copy, the rows, and the empty
 * state. Accessibility mirrors the homepage grid — the Data Grid implements the
 * `grid` role and keyboard navigation itself, so it only needs a label.
 */
export default function AuditReportsTable({
  title,
  description,
  headingId,
  headingComponent = 'h2',
  rows,
  ariaLabel,
  emptyMessage,
  sx,
}: AuditReportsTableProps) {
  return (
    <SectionPanel sx={sx}>
      {title && (
        <Typography
          id={headingId}
          variant="h5"
          component={headingComponent}
          gutterBottom
        >
          {title}
        </Typography>
      )}
      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: title ? 0 : 0.5, mb: 2 }}
        >
          {description}
        </Typography>
      )}

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      ) : (
        <DataGrid
          rows={[...rows]}
          columns={columns}
          getRowId={(row) => row.id}
          // Rows are read-only: clicking one selects nothing and opens nothing.
          disableRowSelectionOnClick
          disableColumnMenu
          // No pagination or footer at this size; the grid should size to its rows.
          hideFooter
          rowHeight={56}
          columnHeaderHeight={48}
          sx={{
            // MUI X draws its own borders; the surrounding panel already
            // provides one, so the grid keeps only the internal rules.
            border: 0,
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'action.hover',
            },
            '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible':
              {
                outline: `2px solid ${LINK_ACCENT}`,
                outlineOffset: -2,
              },
            // Long titles wrap rather than truncating, so the full report name
            // is always visible to sighted users.
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'normal',
              lineHeight: 1.35,
              py: 1,
            },
          }}
          aria-label={ariaLabel}
        />
      )}
    </SectionPanel>
  );
}
