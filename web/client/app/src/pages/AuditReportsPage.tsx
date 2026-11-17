import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { fetchRecentAudits, RecentAuditsApiError, type RecentAuditsResponse } from '../api/recentAudits';
import { useAuth } from '../auth/AuthContext';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import FeatureCard from '../components/FeatureCard';
import FeatureGrid from '../components/FeatureGrid';
import PageSection from '../components/PageSection';
import RecentReportsTable from '../components/RecentReportsTable';
import ScanFrequencyForm from '../components/ScanFrequencyForm';
import SectionPanel from '../components/SectionPanel';

const features = [
  {
    icon: <HistoryOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Most recent',
    description:
      'Records appear newest first by when they were added to Audit Sector.',
  },
  {
    icon: <ErrorOutlineOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Risk level',
    description:
      'Each report shows its risk level — informational, low, medium, high, or critical.',
  },
  {
    icon: <AssessmentOutlinedIcon color="primary" fontSize="large" aria-hidden="true" />,
    title: 'Scan status',
    description:
      'See whether a report is pending, running, completed, or failed to scan.',
  },
];

/** Audit reports: scan scheduling and recent records from the authenticated API. */
export default function AuditReportsPage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection id="audit-reports" labelledBy="audit-reports-heading">
        <Typography
          id="audit-reports-heading"
          variant="h3"
          component="h1"
          gutterBottom
        >
          Audit Reports
        </Typography>

        <FeatureGrid>
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </FeatureGrid>

        <ScanFrequencyForm />

        <RecentReportsSection key={user?.username ?? 'anonymous'} />
      </PageSection>
    </Container>
  );
}

type LoadResult =
  | { requestKey: string; data: RecentAuditsResponse; error?: never }
  | { requestKey: string; error: RecentAuditsApiError; data?: never };

function RecentReportsSection() {
  const { signOut } = useAuth();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });
  const [rowCount, setRowCount] = useState(0);
  const [requestVersion, setRequestVersion] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const { page, pageSize } = paginationModel;
  const requestKey = `${page}:${pageSize}:${requestVersion}`;
  const currentResult = result?.requestKey === requestKey ? result : null;
  const loading = currentResult === null;
  const error = currentResult?.error;

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    fetchRecentAudits({ page: page + 1, limit: pageSize }, { signal: controller.signal })
      .then((data) => {
        if (ignore) return;
        setRowCount(data.pagination.total_items);
        setResult({ requestKey, data });
        const lastPage = Math.max(0, data.pagination.total_pages - 1);
        if (page > lastPage) {
          setPaginationModel({ page: lastPage, pageSize });
        }
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        const error = failure instanceof RecentAuditsApiError
          ? failure
          : new RecentAuditsApiError('Unable to retrieve recent reports. Please try again.');
        setResult({ requestKey, error });
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [page, pageSize, requestKey]);

  function changePage(next: GridPaginationModel) {
    const nextPage = next.pageSize === pageSize ? next.page : 0;
    if (page === nextPage && pageSize === next.pageSize) return;
    setPaginationModel({ page: nextPage, pageSize: next.pageSize });
    // Returning quickly to an earlier page is still a new request.
    setRequestVersion((value) => value + 1);
  }

  return (
    <SectionPanel
      component="section"
      aria-labelledby="recent-reports-heading"
      aria-busy={loading}
      sx={{ mt: 3, minWidth: 0 }}
    >
      <Typography id="recent-reports-heading" variant="h5" component="h2">
        Recent reports
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Audit records ordered by when they were added, newest first.
      </Typography>
      {error ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">{error.message}</Alert>
          {error.status === 401 ? (
            <Button onClick={() => { void signOut(); }}>Sign in again</Button>
          ) : (
            <Button onClick={() => setRequestVersion((value) => value + 1)}>Retry</Button>
          )}
        </Stack>
      ) : (
        <RecentReportsTable
          rows={currentResult?.data?.data ?? []}
          rowCount={rowCount}
          loading={loading}
          paginationModel={paginationModel}
          onPaginationModelChange={changePage}
        />
      )}
    </SectionPanel>
  );
}
