import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  deleteSchedule,
  fetchSchedules,
  ScheduleApiError,
  type Schedule,
} from '../api/schedules';
import { useAuth } from '../auth/AuthContext';
import {
  SCAN_STATUS_META,
  formatScheduleTime,
  lastRunLabel,
} from '../content/schedules';
import SectionPanel from './SectionPanel';

type LoadResult =
  | { data: Schedule[]; error?: never }
  | { error: ScheduleApiError; data?: never };

/** One schedule's status, explaining an unsupported source rather than hiding it. */
function StatusChip({ schedule }: { schedule: Schedule }) {
  const meta = SCAN_STATUS_META[schedule.scan_status];
  // A schedule can be flagged ACTIVE while its URL is unsupported (older rows);
  // the support flag is the authoritative answer, so it wins.
  const unsupported = !schedule.is_supported;
  const label = unsupported ? 'Not supported' : meta.label;
  const color = unsupported ? SCAN_STATUS_META.UNSUPPORTED.color : meta.color;

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        color,
        borderColor: color,
        bgcolor: 'transparent',
        fontWeight: 600,
      }}
      variant="outlined"
    />
  );
}

/** `source_link`, shortened for the table but readable as a whole link. */
function SourceLink({ href }: { href: string }) {
  let host = href;
  try {
    host = new URL(href).host;
  } catch {
    // A malformed URL renders as-is; the row is still meaningful with the status.
  }

  return (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ fontWeight: 600, wordBreak: 'break-word' }}
      >
        {host}
      </Link>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ wordBreak: 'break-all' }}
      >
        {href}
      </Typography>
    </Stack>
  );
}

interface ConfirmState {
  schedule: Schedule;
  submitting: boolean;
  error: string | null;
}

/**
 * Scan schedules: what the worker is watching, its last result, and next run.
 *
 * Delete is offered only to administrators, matching `DELETE /schedules/<id>`.
 * The server refuses to delete a schedule that still has reports (the audit
 * table is `ON DELETE RESTRICT`), so that case is explained in the dialog rather
 * than failing after the fact.
 */
export default function ScheduleTable({ sx }: { sx?: SxProps<Theme> }) {
  const { isAdmin, isAuthenticated, isChecking } = useAuth();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const controller = new AbortController();
    let ignore = false;
    setResult(null);

    fetchSchedules({ signal: controller.signal })
      .then((data) => {
        if (!ignore) setResult({ data });
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        setResult({
          error:
            failure instanceof ScheduleApiError
              ? failure
              : new ScheduleApiError('Unable to load schedules. Please try again.'),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [attempt, isAuthenticated]);

  const reload = useCallback(() => {
    setConfirm(null);
    setAttempt((value) => value + 1);
  }, []);

  const submitDelete = useCallback(async (schedule: Schedule) => {
    setRemoved(null);
    setConfirm({ schedule, submitting: true, error: null });
    try {
      await deleteSchedule(schedule.schedule_id);
      setRemoved(schedule.source_link);
      reload();
    } catch (failure) {
      setConfirm({
        schedule,
        submitting: false,
        error:
          failure instanceof ScheduleApiError
            ? failure.message
            : 'The schedule could not be deleted.',
      });
    }
  }, [reload]);

  const rows = result?.data ?? [];
  const loading = result === null && isAuthenticated;

  if (!isChecking && !isAuthenticated) {
    return null;
  }

  return (
    <SectionPanel
      component="section"
      id="scan-schedules"
      aria-labelledby="scan-schedules-heading"
      aria-busy={loading}
      sx={[{ scrollMarginTop: '96px' }, ...(Array.isArray(sx) ? sx : [sx ? [sx] : []])].flat()}
    >
      <Typography id="scan-schedules-heading" variant="h5" component="h2">
        Scan schedules
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {loading
          ? 'Loading scheduled sources.'
          : rows.length > 0
            ? 'Each source below is checked on its own schedule. A source marked “Not supported” has no scanner and is no longer retried.'
            : 'No sources are scheduled yet. Add one above to start scanning.'}
      </Typography>

      {removed && (
        <Alert severity="success" onClose={() => setRemoved(null)} sx={{ mb: 2 }}>
          Removed the schedule for {removed}.
        </Alert>
      )}

      {result?.error ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">{result.error.message}</Alert>
          {result.error.status !== 401 && (
            <Button onClick={reload}>Retry</Button>
          )}
        </Stack>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress aria-label="Loading scan schedules" />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Scan schedules">
            <TableHead>
              <TableRow>
                <TableCell scope="col">Source</TableCell>
                <TableCell scope="col">Frequency</TableCell>
                <TableCell scope="col">Status</TableCell>
                <TableCell scope="col">Last run</TableCell>
                <TableCell scope="col">Next run</TableCell>
                <TableCell scope="col" align="right">
                  Reports
                </TableCell>
                {isAdmin && (
                  <TableCell scope="col" align="right">
                    <Box component="span" sx={{ position: 'absolute', left: -9999 }}>
                      Actions
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((schedule) => {
                const name = schedule.source_link;
                return (
                  <TableRow key={schedule.schedule_id} hover>
                    <TableCell sx={{ maxWidth: 380 }}>
                      <SourceLink href={schedule.source_link} />
                    </TableCell>
                    <TableCell>{schedule.scan_frequency}</TableCell>
                    <TableCell>
                      <StatusChip schedule={schedule} />
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2">
                          {lastRunLabel(
                            schedule.last_run_status,
                            schedule.last_run_at !== null,
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatScheduleTime(schedule.last_run_at)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{formatScheduleTime(schedule.next_run_at)}</TableCell>
                    <TableCell align="right">{schedule.report_count}</TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <IconButton
                          aria-label={`Delete schedule for ${name}`}
                          size="small"
                          onClick={() =>
                            setConfirm({
                              schedule,
                              submitting: false,
                              error: null,
                            })
                          }
                          disabled={schedule.report_count > 0}
                          title={
                            schedule.report_count > 0
                              ? 'This schedule has reports and cannot be deleted.'
                              : 'Delete this schedule'
                          }
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => {
          if (!confirm?.submitting) setConfirm(null);
        }}
        aria-labelledby="delete-schedule-title"
      >
        <DialogTitle id="delete-schedule-title">Delete schedule?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: confirm?.error ? 2 : 0 }}>
            This removes the schedule for {confirm?.schedule.source_link}. Reports
            it has already collected are not deleted.
          </DialogContentText>
          {confirm?.error && <Alert severity="error">{confirm.error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={confirm?.submitting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={confirm?.submitting}
            onClick={() => confirm && submitDelete(confirm.schedule)}
          >
            {confirm?.submitting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionPanel>
  );
}
