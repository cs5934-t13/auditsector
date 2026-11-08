import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import AuditReportsTable from '../components/AuditReportsTable';
import PageSection from '../components/PageSection';
import SectionPanel from '../components/SectionPanel';
import {
  auditsForTag,
  findTagName,
  listTags,
} from '../content/recentAudits';
import { ROUTES, tagPath } from '../routes';
import { BODY_LINK_SX } from '../theme';

/**
 * Tag detail page: every audit report carrying one tag.
 *
 * The URL is `/tag/<tagname>`, where `<tagname>` is the slug from `tagSlug`.
 * `findTagName` maps the slug back to the tag's display casing, so the page
 * heading shows "Information Technology" while the URL stays lower-case.
 */
export default function TagPage() {
  const { tagname = '' } = useParams<{ tagname: string }>();
  const tagName = findTagName(tagname);

  if (!tagName) {
    return <UnknownTag segment={tagname} />;
  }

  const rows = auditsForTag(tagName);

  return (
    <Container maxWidth="lg">
      <PageSection id="tag" labelledBy="tag-heading" spacing="both">
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 2 }}>
          <Typography
            component={RouterLink}
            to={ROUTES.tags}
            variant="body2"
            sx={BODY_LINK_SX}
          >
            Tags
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tagName}
          </Typography>
        </Breadcrumbs>

        <Typography id="tag-heading" variant="h3" component="h1" gutterBottom>
          {tagName}
        </Typography>
        {rows.length > 0 && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 720 }}
          >
            {rows.length === 1
              ? '1 audit report carries this tag.'
              : `${rows.length} audit reports carry this tag.`}
          </Typography>
        )}

        <AuditReportsTable
          rows={rows}
          ariaLabel={`Audit reports tagged ${tagName}`}
          emptyMessage="No audit reports carry this tag yet."
          sx={{ mt: rows.length > 0 ? 0 : 3 }}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
          <Button
            component={RouterLink}
            to={ROUTES.tags}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
          >
            All tags
          </Button>
          <Button component={RouterLink} to={ROUTES.auditReports}>
            Browse all audit reports
          </Button>
        </Stack>
      </PageSection>
    </Container>
  );
}

/**
 * Fallback for a URL that does not match any known tag.
 *
 * Suggested tags are real destinations, so a mistyped or stale link still leads
 * somewhere useful instead of dead-ending. The list includes tags with no
 * reports yet, because those are still valid destinations.
 */
function UnknownTag({ segment }: { segment: string }) {
  // Every known tag is a valid destination, so offer the whole index rather
  // than truncating a list that may hide the intended tag.
  const suggestions = listTags();

  return (
    <Container maxWidth="lg">
      <PageSection id="tag" labelledBy="tag-heading" spacing="both">
        <SectionPanel>
          <Typography id="tag-heading" variant="h3" component="h1" gutterBottom>
            Tag not found
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            There is no tag called “{decodeURIComponent(segment)}”. It may have
            been renamed, or the link may be mistyped.
          </Typography>

          {suggestions.length > 0 && (
            <>
              <Typography variant="subtitle2" component="h2" gutterBottom>
                Browse a tag
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {suggestions.map(({ name }) => (
                  <Typography
                    key={name}
                    component="li"
                    variant="body2"
                    sx={{ mb: 1 }}
                  >
                    <Box component={RouterLink} to={tagPath(name)} sx={BODY_LINK_SX}>
                      {name}
                    </Box>
                  </Typography>
                ))}
              </Box>
            </>
          )}

          <Button
            component={RouterLink}
            to={ROUTES.tags}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            sx={{ mt: 3 }}
          >
            All tags
          </Button>
        </SectionPanel>
      </PageSection>
    </Container>
  );
}
