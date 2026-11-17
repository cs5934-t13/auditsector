import Box from '@mui/material/Box';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { RecentAuditRecord } from '../content/recentReports';

function formatStoredDateTime(value: string): string {
  return value.replace('T', ' ');
}

const columns: GridColDef<RecentAuditRecord>[] = [
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 260,
  },
  {
    field: 'audit_date',
    headerName: 'Audit date',
    width: 190,
    valueFormatter: formatStoredDateTime,
  },
  {
    field: 'created_at',
    headerName: 'Added',
    width: 190,
    valueFormatter: formatStoredDateTime,
  },
];

function getAuditId(row: RecentAuditRecord): number {
  return row.audit_id;
}

function getRowHeight(): 'auto' {
  return 'auto';
}

interface RecentReportsTableProps {
  /** Records supplied in newest-first order by the caller. */
  rows: readonly RecentAuditRecord[];
}

/** Read-only report table. Loading records is the caller's responsibility. */
export default function RecentReportsTable({
  rows,
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
        initialState={{
          pagination: { paginationModel: { page: 0, pageSize: 20 } },
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
