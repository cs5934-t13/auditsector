import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LaunchIcon from '@mui/icons-material/Launch';
import { fetchAuditReport, AuditReportApiError, type AuditReport } from '../api/auditReport';
import { useAuth } from '../auth/AuthContext';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import RiskLevelChip from '../components/RiskLevelChip';
import RunStatusChip from '../components/RunStatusChip';
import SectionPanel from '../components/SectionPanel';
import TagLinks from '../components/TagLinks';
import { runStatusLabel } from '../content/runStatuses';
import { isRunInProgress } from '../utils/runStatus';
import { formatStoredDate, formatStoredDateTime } from '../utils/formatDate';
import { ROUTES } from '../routes';
import { BODY_LINK_SX } from '../theme';

type LoadResult =
  | { auditId: string; report: AuditReport; error?: never }
  | { auditId: string; error: AuditReportApiError; report?: never };

/**
 * Audit report detail page.
 *
 * One report from `GET /api/audits/<audit_id>`: title, municipality, risk
 * level, scan status, summary, tags, and a link to the original document.
 * Metadata is rendered as a description list so the label/value pairing is
 * available to assistive technology rather than implied by layout.
 */
export default function AuditReportPage() {
  const { auditId = '' } = useParams<{ auditId: string }>();
  const { signOut } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const current = result?.auditId === auditId ? result : null;

  /**
   * Clears the previous outcome first, so a retry shows the loading skeleton
   * instead of the stale error while the request is in flight.
   */
  function retry() {
    setResult(null);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchAuditReport(auditId, { signal: controller.signal })
      .then((report) => {
        if (!ignore) setResult({ auditId, report });
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        const error =
          failure instanceof AuditReportApiError
            ? failure
            : new AuditReportApiError('Unable to load the audit report. Please try again.');
        setResult({ auditId, error });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [auditId, attempt]);

  const error = current?.error;
  const report = current?.report;

  return (
    <Container maxWidth="lg">
      <PageSection id="audit-report" labelledBy="audit-report-heading" spacing="both">
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          <Typography
            component={RouterLink}
            to={ROUTES.auditReports}
            variant="body2"
            sx={BODY_LINK_SX}
          >
            Audit Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {report?.title ?? 'Report'}
          </Typography>
        </Breadcrumbs>

        {error ? (
          <ReportError
            error={error}
            onRetry={retry}
            onSignIn={() => { void signOut(); }}
          />
        ) : report ? (
          <ReportBody report={report} />
        ) : (
          <ReportSkeleton />
        )}
      </PageSection>
    </Container>
  );
}

function ReportBody({ report }: { report: AuditReport }) {
  const status = report.runStatus;
  const pending = status !== null && isRunInProgress(status);

  return (
    <>
      <Typography id="audit-report-heading" variant="h3" component="h1" gutterBottom>
        {report.title}
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        sx={{ mb: 3 }}
      >
        <RiskLevelChip level={report.riskLevel} size="medium" />
        <RunStatusChip status={status} size="medium" />
      </Stack>

      <Stack spacing={3}>
        <SectionPanel component="section" aria-labelledby="summary-heading">
          <Typography id="summary-heading" variant="h5" component="h2" gutterBottom>
            Summary
          </Typography>
          {report.summary ? (
            // `white-space: pre-line` keeps the paragraph breaks the summarizer
            // emits instead of collapsing a whole report into one block.
            <Prose sx={{ whiteSpace: 'pre-line' }}>{report.summary}</Prose>
          ) : (
            <Typography variant="body1" color="text.secondary">
              {pending
                ? `No summary yet — this scan is ${runStatusLabel(status).toLowerCase()}. Check back when it completes.`
                : 'No summary is available for this report.'}
            </Typography>
          )}
        </SectionPanel>

        <SectionPanel component="section" aria-labelledby="details-heading">
          <Typography id="details-heading" variant="h5" component="h2" gutterBottom>
            Details
          </Typography>

          <Box
            component="dl"
            sx={{
              display: 'grid',
              gap: 2,
              m: 0,
              gridTemplateColumns: { xs: '1fr', sm: 'max-content 1fr' },
              columnGap: 3,
            }}
          >
            <DetailTerm>Municipality</DetailTerm>
            <DetailValue>
              {report.municipality || 'Not recorded'}
            </DetailValue>

            <DetailTerm>Audit date</DetailTerm>
            <DetailValue>{formatStoredDate(report.auditDate)}</DetailValue>

            <DetailTerm>Added</DetailTerm>
            <DetailValue>{formatStoredDateTime(report.createdAt)}</DetailValue>

            <DetailTerm>Scan status</DetailTerm>
            <DetailValue>{runStatusLabel(status)}</DetailValue>

            <DetailTerm>Tags</DetailTerm>
            <DetailValue>
              {report.tags.length > 0 ? (
                <TagLinks tags={report.tags.map((tag) => tag.name)} />
              ) : (
                'No tags'
              )}
            </DetailValue>

            <DetailTerm>Source document</DetailTerm>
            <DetailValue>
              {report.auditUrl ? (
                <Link
                  href={report.auditUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={BODY_LINK_SX}
                >
                  Open the original audit
                  <LaunchIcon
                    fontSize="inherit"
                    sx={{ ml: 0.5, verticalAlign: 'middle' }}
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                'Not recorded'
              )}
            </DetailValue>
          </Box>

          {report.tags.some((tag) => tag.description) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" component="h3" gutterBottom>
                Tag descriptions
              </Typography>
              <Box component="dl" sx={{ display: 'grid', gap: 1, m: 0 }}>
                {report.tags
                  .filter((tag) => tag.description)
                  .map((tag) => (
                    <Box key={tag.tag_id}>
                      <Typography component="dt" variant="subtitle2">
                        {tag.name}
                      </Typography>
                      <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                        {tag.description}
                      </Typography>
                    </Box>
                  ))}
              </Box>
            </>
          )}
        </SectionPanel>
      </Stack>

      <Button
        component={RouterLink}
        to={ROUTES.auditReports}
        variant="outlined"
        startIcon={<ArrowBackIcon />}
        sx={{ mt: 3 }}
      >
        All audit reports
      </Button>
    </>
  );
}

function DetailTerm({ children }: { children: ReactNode }) {
  return (
    <Typography component="dt" variant="subtitle2" sx={{ m: 0 }}>
      {children}
    </Typography>
  );
}

function DetailValue({ children }: { children: ReactNode }) {
  return (
    <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
      {children}
    </Typography>
  );
}

/** Placeholder shown while the report is loading. */
function ReportSkeleton() {
  return (
    <Box role="status" aria-live="polite" aria-label="Loading audit report">
      <Skeleton variant="text" sx={{ fontSize: '2.5rem', maxWidth: 640 }} />
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Skeleton variant="rounded" width={96} height={32} />
        <Skeleton variant="rounded" width={108} height={32} />
      </Stack>
      <Skeleton variant="rounded" height={180} />
    </Box>
  );
}

interface ReportErrorProps {
  error: AuditReportApiError;
  onRetry: () => void;
  onSignIn: () => void;
}

/**
 * Error state. Keeps the page heading so the document still has an `h1`, and
 * distinguishes "not found" from a retryable failure instead of offering a
 * retry that cannot succeed.
 */
function ReportError({ error, onRetry, onSignIn }: ReportErrorProps) {
  return (
    <>
      <Typography id="audit-report-heading" variant="h3" component="h1" gutterBottom>
        {error.notFound ? 'Audit report not found' : 'Audit report unavailable'}
      </Typography>

      <Alert severity={error.notFound ? 'warning' : 'error'} sx={{ mb: 2 }}>
        {error.message}
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {error.status === 401 ? (
          <Button variant="contained" onClick={onSignIn}>
            Sign in again
          </Button>
        ) : (
          !error.notFound && (
            <Button variant="contained" onClick={onRetry}>
              Retry
            </Button>
          )
        )}
        <Button
          component={RouterLink}
          to={ROUTES.auditReports}
          variant="outlined"
          startIcon={<ArrowBackIcon />}
        >
          All audit reports
        </Button>
      </Stack>
    </>
  );
}
