import Box from '@mui/material/Box';
import { DataGrid, type GridPaginationModel } from '@mui/x-data-grid';
import type { RecentAuditRecord } from '../content/recentReports';
import { recentAuditColumns } from './recentAuditColumns';

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
        columns={recentAuditColumns}
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
