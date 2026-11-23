import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import { fetchTags, TagsApiError, type TagSummary } from '../api/tags';
import { tagPath } from '../routes';
import { ACCENT_WASH, LINK_ACCENT } from '../theme';

type LoadResult =
  | { data: TagSummary[]; error?: never }
  | { error: TagsApiError; data?: never };

/**
 * Tags index: every tag with its report count, linking to `/tag/<slug>`.
 *
 * Loads `GET /api/tags`, so the list is the live tag table rather than a seed
 * array: tags added after deployment appear immediately, and counts reflect the
 * reports currently in the database. Tags with no reports are still listed,
 * because they are valid destinations with an empty state.
 */
export default function TagsPage() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchTags({ signal: controller.signal })
      .then((data) => {
        if (!ignore) setResult({ data });
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        setResult({
          error:
            failure instanceof TagsApiError
              ? failure
              : new TagsApiError('Unable to load tags. Please try again.'),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);

  const tags = result?.data ?? [];
  const loading = result === null;

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

        <Box aria-busy={loading}>
          {result?.error ? (
            <SectionPanel>
              <Stack spacing={2} alignItems="flex-start">
                <Alert severity="error">{result.error.message}</Alert>
                {result.error.status === 401 ? (
                  <Button component={RouterLink} to="/">
                    Sign in again
                  </Button>
                ) : (
                  <Button onClick={retry}>Retry</Button>
                )}
              </Stack>
            </SectionPanel>
          ) : loading ? (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              }}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton
                  key={index}
                  variant="rounded"
                  height={92}
                  role={index === 0 ? 'status' : undefined}
                  aria-label={index === 0 ? 'Loading tags' : undefined}
                />
              ))}
            </Box>
          ) : tags.length === 0 ? (
            <SectionPanel>
              <Typography variant="body2" color="text.secondary">
                No tags exist yet. Tags appear once reports are tagged.
              </Typography>
            </SectionPanel>
          ) : (
            <TagGrid tags={tags} />
          )}
        </Box>
      </PageSection>
    </Container>
  );
}

/** Grid of tag cards. Presentational; the page owns loading and error state. */
function TagGrid({ tags }: { tags: readonly TagSummary[] }) {
  return (
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
      {tags.map(({ name, reportCount, description }) => (
        <Box component="li" key={name} sx={{ display: 'flex' }}>
          {/*
            A `Link` (not a Paper with `component={RouterLink}`) so the router
            props are typed. It is styled as an outlined panel and spans the
            full grid cell.
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
                sx={{ display: 'block', mb: description ? 1 : 0 }}
              >
                {reportCount === 0
                  ? 'No reports yet'
                  : reportCount === 1
                    ? '1 report'
                    : `${reportCount} reports`}
              </Typography>
              {/*
                Only the inclusion rule is previewed; the exclusion rule is
                long and belongs on the tag page. Cards are links, so nothing
                here is interactive.
              */}
              {description && (
                <Typography
                  variant="body2"
                  component="span"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {description}
                </Typography>
              )}
            </Box>
            <ChevronRightIcon
              aria-hidden="true"
              sx={{ color: 'text.secondary', flexShrink: 0 }}
            />
          </Link>
        </Box>
      ))}
    </Box>
  );
}
