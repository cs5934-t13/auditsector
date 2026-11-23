import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import SectionPanel from './SectionPanel';
import { recentAuditColumns } from './recentAuditColumns';
import {
  fetchRecentAudits,
  RecentAuditsApiError,
  type RecentAuditsResponse,
} from '../api/recentAudits';
import { SCROLL_OFFSET } from '../content/layout';
import type { RecentAuditRecord } from '../content/recentReports';

interface RecentAuditsGridProps {
  /** How many reports to show. The homepage section is a summary, not a table. */
  limit?: number;
  sx?: SxProps<Theme>;
}

type LoadResult =
  | { data: RecentAuditsResponse; error?: never }
  | { error: RecentAuditsApiError; data?: never };

/**
 * Homepage "Recent audits" panel.
 *
 * Loads the newest reports from `GET /api/audits/recent`; nothing here is
 * placeholder data. Rows are the server's own records, including the risk level
 * and tags it now returns, and each title links to the report detail page.
 *
 * The full paginated view lives on the Audit Reports page; this panel shows a
 * single page and offers a link there instead of duplicating pagination.
 */
export default function RecentAuditsGrid({
  limit = 10,
  sx,
}: RecentAuditsGridProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchRecentAudits({ page: 1, limit }, { signal: controller.signal })
      .then((data) => {
        if (!ignore) setResult({ data });
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        setResult({
          error:
            failure instanceof RecentAuditsApiError
              ? failure
              : new RecentAuditsApiError('Unable to retrieve recent reports. Please try again.'),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [limit, attempt]);

  const rows: readonly RecentAuditRecord[] = result?.data?.data ?? [];
  const loading = result === null;

  return (
    <SectionPanel
      component="section"
      id="recent-audits"
      aria-labelledby="recent-audits-heading"
      aria-busy={loading}
      sx={[{ scrollMarginTop: SCROLL_OFFSET }, ...(sx ? (Array.isArray(sx) ? sx : [sx]) : [])]}
    >
      <Typography id="recent-audits-heading" variant="h5" component="h2">
        Recent audits
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {loading
          ? 'Loading the newest audit records.'
          : rows.length > 0
            ? `The ${rows.length === 1 ? 'most recent report' : `${rows.length} most recent reports`} across your sources, newest first.`
            : 'No reports have been scanned yet.'}
      </Typography>

      {result?.error ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">{result.error.message}</Alert>
          {result.error.status !== 401 && (
            <Button onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>
              Retry
            </Button>
          )}
        </Stack>
      ) : (
        <Box sx={{ width: '100%', minWidth: 0 }}>
          <DataGrid<RecentAuditRecord>
            rows={[...rows]}
            columns={recentAuditColumns}
            getRowId={(row) => row.audit_id}
            // Rows size to their wrapped title, so long report names stay
            // readable instead of truncating.
            getRowHeight={() => 'auto'}
            disableRowSelectionOnClick
            disableColumnMenu
            // The homepage panel is a summary: no pagination or footer, and the
            // grid sizes to the rows it was given.
            hideFooter
            rowCount={rows.length}
            columnHeaderHeight={48}
            loading={loading}
            slotProps={{
              loadingOverlay: {
                variant: 'circular-progress',
                noRowsVariant: 'circular-progress',
                role: 'status',
                'aria-label': 'Loading recent audits',
              },
            }}
            localeText={{ noRowsLabel: 'No audit records to display.' }}
            sx={{
              // MUI X draws its own borders; the surrounding panel already
              // provides one, so the grid keeps only the internal rules.
              border: 0,
              '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
              '& .MuiDataGrid-cell': {
                py: 1,
                whiteSpace: 'normal',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
              },
            }}
            aria-label="Recent audit reports"
          />
        </Box>
      )}
    </SectionPanel>
  );
}
