import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { Link as RouterLink } from 'react-router-dom';
import type { RecentAuditRecord } from '../content/recentReports';
import { auditReportPath } from '../routes';
import { BODY_LINK_SX } from '../theme';

/**
 * Renders a stored `YYYY-MM-DDTHH:MM:SS` value as a compact grid cell.
 *
 * Kept in the raw stored form (space instead of `T`) rather than localized,
 * because these columns are narrow and the sorting/scanning task is easier with
 * an unambiguous, fixed-width timestamp.
 */
function formatGridDateTime(value: string): string {
  return value.replace('T', ' ');
}

const columns: GridColDef<RecentAuditRecord>[] = [
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
    field: 'audit_date',
    headerName: 'Audit date',
    width: 190,
    valueFormatter: formatGridDateTime,
  },
  {
    field: 'created_at',
    headerName: 'Added',
    width: 190,
    valueFormatter: formatGridDateTime,
  },
];

function getAuditId(row: RecentAuditRecord): string | number {
  return row.audit_id;
}

function getRowHeight(): 'auto' {
  return 'auto';
}

interface RecentReportsTableProps {
  /** Records supplied in newest-first order by the caller. */
  rows: readonly RecentAuditRecord[];
  rowCount: number;
  loading: boolean;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
}

/** Read-only report table. Loading records is the caller's responsibility. */
export default function RecentReportsTable({
  rows,
  rowCount,
  loading,
  paginationModel,
  onPaginationModelChange,
}: RecentReportsTableProps) {
  return (
    <Box sx={{ height: 420, width: '100%', minWidth: 0 }}>
      <DataGrid<RecentAuditRecord>
        rows={rows}
        columns={columns}
        getRowId={getAuditId}
        getRowHeight={getRowHeight}
        disableRowSelectionOnClick
        disableColumnSorting
        disableColumnMenu
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        rowCount={rowCount}
        loading={loading}
        slotProps={{
          loadingOverlay: {
            variant: 'circular-progress',
            noRowsVariant: 'circular-progress',
            role: 'status',
            'aria-label': 'Loading recent reports',
          },
        }}
        pageSizeOptions={[10, 20, 50]}
        localeText={{ noRowsLabel: 'No audit records to display.' }}
        sx={{
          '& .MuiDataGrid-cell': {
            py: 1,
            whiteSpace: 'normal',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
          },
        }}
        aria-label="Recent audit records"
      />
    </Box>
  );
}
