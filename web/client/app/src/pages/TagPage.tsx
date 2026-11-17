import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { compareRiskLevels } from '../utils/risk';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import PageSection from '../components/PageSection';
import SectionPanel from '../components/SectionPanel';
import RiskLevelChip from '../components/RiskLevelChip';
import { fetchTagAudits, resolveTag, TagsApiError, type TagAudit } from '../api/tags';
import { useTagCatalog } from '../hooks/useTagCatalog';
import { useAuth } from '../auth/AuthContext';
import { ROUTES, tagIdPath } from '../routes';
import { BODY_LINK_SX } from '../theme';

const columns: GridColDef<TagAudit>[] = [
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 260 },
  {
    field: 'risk_level', headerName: 'Risk level', width: 124,
    sortComparator: compareRiskLevels,
    renderCell: ({ row }) => <RiskLevelChip level={row.risk_level} />,
  },
  {
    field: 'run_status', headerName: 'Scan status', width: 150,
    valueFormatter: (value: TagAudit['run_status']) => value ?? 'Not available',
  },
];

type Result = { key: string; rows?: TagAudit[]; error?: TagsApiError };

/** Resolve real catalog IDs (or existing name links), then load the existing tag API. */
export default function TagPage() {
  const { tagname = '' } = useParams<{ tagname: string }>();
  const { user } = useAuth();
  return <TagDetails key={JSON.stringify([user?.username, tagname])} segment={tagname} />;
}

function TagDetails({ segment }: { segment: string }) {
  const catalog = useTagCatalog();
  const { user, signOut } = useAuth();
  const tag = resolveTag(catalog.tags, segment);
  const tagId = tag?.tag_id;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${user?.username ?? ''}:${tagId ?? ''}:${attempt}`;
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (tagId === undefined) return;
    const controller = new AbortController();
    let ignore = false;
    fetchTagAudits(tagId, { signal: controller.signal })
      .then((rows) => { if (!ignore) setResult({ key, rows }); })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        const error = failure instanceof TagsApiError ? failure : new TagsApiError('Unable to load reports. Please try again.');
        setResult({ key, error });
      });
    return () => { ignore = true; controller.abort(); };
  }, [key, tagId]);

  const error = catalog.error ?? current?.error;
  const loading = catalog.loading || (tag !== undefined && current === null);
  function retry() {
    if (catalog.error) catalog.retry(); else setAttempt((value) => value + 1);
  }

  return (
    <Container maxWidth="lg">
      <PageSection id="tag" labelledBy="tag-heading" spacing="both">
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          <Typography component={RouterLink} to={ROUTES.tags} variant="body2" sx={BODY_LINK_SX}>Tags</Typography>
          {tag && <Typography variant="body2" color="text.secondary">{tag.name}</Typography>}
        </Breadcrumbs>
        <Typography id="tag-heading" variant="h3" component="h1" gutterBottom>
          {tag?.name ?? (catalog.loading || catalog.error ? 'Tag reports' : 'Tag not found')}
        </Typography>
        {loading ? (
          <Stack role="status" alignItems="center" sx={{ py: 4 }}><CircularProgress aria-label="Loading tag reports" /></Stack>
        ) : error ? (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="error">{error.message}</Alert>
            <Button onClick={() => { if (error.status === 401) void signOut(); else retry(); }}>
              {error.status === 401 ? 'Sign in again' : 'Retry'}
            </Button>
          </Stack>
        ) : !tag ? (
          <SectionPanel>
            <Typography sx={{ mb: 2 }}>No unique tag matches this link. Choose a tag from the catalog.</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {catalog.tags.map((item) => (
                <Typography component="li" key={item.tag_id} sx={{ mb: 1 }}>
                  <Box component={RouterLink} to={tagIdPath(item.tag_id)} sx={BODY_LINK_SX}>{item.name}</Box>
                </Typography>
              ))}
            </Box>
          </SectionPanel>
        ) : (
          <SectionPanel>
            {current?.rows?.length ? (
              <DataGrid
                rows={current.rows}
                columns={columns}
                getRowId={(row) => row.audit_id}
                disableRowSelectionOnClick
                disableColumnMenu
                hideFooter
                rowHeight={56}
                columnHeaderHeight={48}
                aria-label={`Audit reports tagged ${tag.name}`}
                sx={{ border: 0, '& .MuiDataGrid-cell': {
                  display: 'flex', alignItems: 'center', whiteSpace: 'normal', lineHeight: 1.35,
                } }}
              />
            ) : <Typography>No audit reports carry this tag yet.</Typography>}
          </SectionPanel>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
          <Button component={RouterLink} to={ROUTES.tags} variant="outlined" startIcon={<ArrowBackIcon />}>All tags</Button>
          <Button component={RouterLink} to={ROUTES.auditReports}>Browse all audit reports</Button>
        </Stack>
      </PageSection>
    </Container>
  );
}
