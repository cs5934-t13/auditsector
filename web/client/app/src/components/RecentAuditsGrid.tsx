import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SectionPanel from './SectionPanel';
import { RECENT_AUDITS, type RecentAudit } from '../content/recentAudits';
import { LINK_ACCENT } from '../theme';

/**
 * Formats an ISO `YYYY-MM-DD` date for display.
 *
 * Parsed as UTC so the rendered day cannot shift backwards for users west of
 * Greenwich when the browser applies a local timezone offset.
 */
function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Columns. `flex` and `minWidth` let long titles wrap-free with a horizontal
 * scroll only when the panel is too narrow, and keep the date/category columns
 * from being squeezed to unreadable widths.
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
    field: 'categories',
    headerName: 'Categories',
    flex: 1,
    minWidth: 200,
  },
];

interface RecentAuditsGridProps {
  /** Rows to show, newest first. Defaults to the placeholder data. */
  rows?: readonly RecentAudit[];
  sx?: SxProps<Theme>;
}

/**
 * Recent audit reports, as an MUI X Data Grid.
 *
 * Deliberately configured as a read-only list, not an editing surface: the grid
 * only renders data the app already has.
 *
 * Accessibility: the grid is labelled via `aria-label`. The Data Grid implements
 * the `grid` role and keyboard navigation itself, so no extra markup is needed.
 */
export default function RecentAuditsGrid({
  rows = RECENT_AUDITS,
  sx,
}: RecentAuditsGridProps) {
  return (
    <SectionPanel sx={sx}>
      <Typography variant="h5" component="h2">
        Recent audits
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {rows.length
          ? `The ${rows.length} most recent reports across your sources, newest first.`
          : 'No reports have been scanned yet.'}
      </Typography>

      <DataGrid
        rows={rows}
        columns={columns}
        // Rows are read-only: clicking one selects nothing and opens nothing.
        disableRowSelectionOnClick
        disableColumnMenu
        // No pagination or footer at this size; the grid should size to its rows.
        hideFooter
        // `autoHeight` would size to content but forbids a fixed height, so the
        // grid gets an explicit row-based height instead.
        rowHeight={56}
        columnHeaderHeight={48}
        sx={{
          // MUI X draws its own borders; the surrounding panel already provides
          // one, so the grid keeps only the internal rules.
          border: 0,
          '& .MuiDataGrid-columnHeaders': {
            bgcolor: 'action.hover',
          },
          '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible':
            {
              outline: `2px solid ${LINK_ACCENT}`,
              outlineOffset: -2,
            },
          // Long titles wrap rather than truncating, so the full report name is
          // always visible to sighted users.
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'normal',
            lineHeight: 1.35,
            py: 1,
          },
        }}
        aria-label="Recent audit reports"
      />
    </SectionPanel>
  );
}
