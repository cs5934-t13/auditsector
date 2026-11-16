import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import { useTagCatalog } from '../hooks/useTagCatalog';
import { useAuth } from '../auth/AuthContext';
import { tagIdPath } from '../routes';
import { ACCENT_WASH, LINK_ACCENT } from '../theme';

export default function TagsPage() {
  const { tags, loading, error, retry } = useTagCatalog();
  const { signOut } = useAuth();

  return (
    <Container maxWidth="lg">
      <PageSection id="tags" labelledBy="tags-heading" spacing="both">
        <Typography id="tags-heading" variant="h3" component="h1" gutterBottom>Tags</Typography>
        <Prose sx={{ mb: 3 }}>
          Tags group audit reports by topic so related findings stay together.
          Choose a tag to see its reports.
        </Prose>
        {loading ? (
          <Stack role="status" alignItems="center" sx={{ py: 4 }}><CircularProgress aria-label="Loading tags" /></Stack>
        ) : error ? (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="error">{error.message}</Alert>
            <Button onClick={() => { if (error.status === 401) void signOut(); else retry(); }}>
              {error.status === 401 ? 'Sign in again' : 'Retry'}
            </Button>
          </Stack>
        ) : tags.length === 0 ? (
          <SectionPanel><Typography>No tags have been added yet.</Typography></SectionPanel>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' } }}>
            {tags.map(({ tag_id, name }) => (
              <Box component="li" key={tag_id} sx={{ display: 'flex' }}>
                <Link component={RouterLink} to={tagIdPath(tag_id)} underline="none" sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%',
                  px: 3, py: 2.5, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper',
                  color: 'text.primary', '&:hover': { bgcolor: ACCENT_WASH, borderColor: LINK_ACCENT },
                  '&:hover .tag-name': { color: LINK_ACCENT },
                }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="tag-name" variant="h6" component="span"
                      sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</Typography>
                    <Typography variant="body2" component="span" color="text.secondary">View reports</Typography>
                  </Box>
                  <ChevronRightIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
                </Link>
              </Box>
            ))}
          </Box>
        )}
      </PageSection>
    </Container>
  );
}
