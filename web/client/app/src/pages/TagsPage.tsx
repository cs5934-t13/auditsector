import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import { listTags } from '../content/recentAudits';
import { tagPath } from '../routes';
import { ACCENT_WASH, LINK_ACCENT } from '../theme';

/**
 * Tags index: every tag with its report count, linking to `/tag/<slug>`.
 *
 * The index is the seed tags in taxonomy order followed by any tag that exists
 * only on a report (alphabetically). Seed tags with no reports still appear, so
 * the list is stable and complete; tags added later show up as they are used.
 */
export default function TagsPage() {
  const tags = listTags();

  return (
    <Container maxWidth="lg">
      <PageSection id="tags" labelledBy="tags-heading" spacing="both">
        <Typography
          id="tags-heading"
          variant="h3"
          component="h1"
          gutterBottom
        >
          Tags
        </Typography>
        <Prose sx={{ mb: 3 }}>
          Tags group audit reports by topic so related findings stay together.
          Choose a tag to see every report carrying it.
        </Prose>

        {tags.length === 0 ? (
          <SectionPanel>
            <Typography variant="body2" color="text.secondary">
              No tags exist yet. Tags appear once reports are tagged.
            </Typography>
          </SectionPanel>
        ) : (
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
            }}
          >
            {tags.map(({ name, reportCount }) => (
              <Box component="li" key={name} sx={{ display: 'flex' }}>
                {/*
                  A `Link` (not a Paper with `component={RouterLink}`) so the
                  router props are typed. It is styled as an outlined panel and
                  spans the full grid cell.
                */}
                <Link
                  component={RouterLink}
                  to={tagPath(name)}
                  underline="none"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    width: '100%',
                    px: 3,
                    py: 2.5,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    '&:hover': {
                      bgcolor: ACCENT_WASH,
                      borderColor: LINK_ACCENT,
                    },
                    '&:hover .tag-name': { color: LINK_ACCENT },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      className="tag-name"
                      variant="h6"
                      component="span"
                      sx={{ display: 'block', fontWeight: 600 }}
                    >
                      {name}
                    </Typography>
                    <Typography
                      variant="body2"
                      component="span"
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {reportCount === 0
                        ? 'No reports yet'
                        : reportCount === 1
                          ? '1 report'
                          : `${reportCount} reports`}
                    </Typography>
                  </Box>
                  <ChevronRightIcon
                    aria-hidden="true"
                    sx={{ color: 'text.secondary', flexShrink: 0 }}
                  />
                </Link>
              </Box>
            ))}
          </Box>
        )}
      </PageSection>
    </Container>
  );
}
