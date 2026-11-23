import Box from '@mui/material/Box';
import {
  DataGrid,
  type GridPaginationModel,
  type GridSortModel,
} from '@mui/x-data-grid';
import type { RecentAuditRecord } from '../content/recentReports';
import { recentAuditColumns } from './recentAuditColumns';

function getAuditId(row: RecentAuditRecord): string | number {
  return row.audit_id;
}

function getRowHeight(): 'auto' {
  return 'auto';
}

interface RecentReportsTableProps {
  /** Records supplied in the server's order by the caller. */
  rows: readonly RecentAuditRecord[];
  rowCount: number;
  loading: boolean;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  /**
   * Server-side sorting. Omit both props to keep the grid unsorted, which is
   * what the homepage panel does.
   *
   * Sorting has to happen on the server here: the grid only holds one page, so
   * sorting client-side would reorder 20 rows and look broken.
   */
  sortModel?: GridSortModel;
  onSortModelChange?: (model: GridSortModel) => void;
}

/** Read-only report table. Loading records is the caller's responsibility. */
export default function RecentReportsTable({
  rows,
  rowCount,
  loading,
  paginationModel,
  onPaginationModelChange,
  sortModel,
  onSortModelChange,
}: RecentReportsTableProps) {
  const sortable = onSortModelChange !== undefined;
  return (
    <Box sx={{ height: 420, width: '100%', minWidth: 0 }}>
      <DataGrid<RecentAuditRecord>
        rows={rows}
        columns={recentAuditColumns}
        getRowId={getAuditId}
        getRowHeight={getRowHeight}
        disableRowSelectionOnClick
        // Sorting is server-driven when a handler is supplied; otherwise the
        // grid would offer a control that cannot work.
        sortingMode={sortable ? 'server' : 'client'}
        disableColumnSorting={!sortable}
        sortModel={sortable ? (sortModel ?? []) : undefined}
        onSortModelChange={sortable ? onSortModelChange : undefined}
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
