import type { SxProps, Theme } from '@mui/material/styles';
import AuditReportsTable from './AuditReportsTable';
import { RECENT_AUDITS, type RecentAudit } from '../content/recentAudits';

interface RecentAuditsGridProps {
  /** Rows to show, newest first. Defaults to the placeholder data. */
  rows?: readonly RecentAudit[];
  sx?: SxProps<Theme>;
}

/**
 * Homepage "Recent audits" panel.
 *
 * A thin wrapper around `AuditReportsTable` that supplies the homepage copy.
 * Tag pages use the table directly with their own heading and rows.
 */
export default function RecentAuditsGrid({
  rows = RECENT_AUDITS,
  sx,
}: RecentAuditsGridProps) {
  return (
    <AuditReportsTable
      title="Recent audits"
      description={
        rows.length
          ? `The ${rows.length} most recent reports across your sources, newest first.`
          : 'No reports have been scanned yet.'
      }
      rows={rows}
      ariaLabel="Recent audit reports"
      emptyMessage="No reports have been scanned yet."
      sx={sx}
    />
  );
}
