import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { GridPaginationModel, GridSortModel } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RecentReportsTable from '../components/RecentReportsTable';
import PageSection from '../components/PageSection';
import Prose from '../components/Prose';
import SectionPanel from '../components/SectionPanel';
import TagRuleText from '../components/TagRuleText';
import {
  fetchTagAudits,
  fetchTags,
  TagsApiError,
  type SortOrder,
  type TagAuditSort,
  type TagSummary,
} from '../api/tags';
import type { RecentAuditRecord } from '../content/recentReports';
import { ROUTES, tagPath } from '../routes';
import { BODY_LINK_SX } from '../theme';

/** Columns the tag-audits endpoint can order by. Mirrors `TagAuditSort`. */
const SORTABLE: readonly TagAuditSort[] = [
  'title',
  'risk_level',
  'audit_date',
  'created_at',
];

const DEFAULT_SORT: GridSortModel = [{ field: 'audit_date', sort: 'desc' }];

/**
 * Translates the grid's sort model into query parameters.
 *
 * The grid allows one sort at a time here, matching the endpoint, and an
 * unknown field or absent sort falls back to the default ordering.
 */
function sortParams(model: GridSortModel): { sort: TagAuditSort; order: SortOrder } {
  const [first] = model;
  if (!first || !SORTABLE.includes(first.field as TagAuditSort)) {
    return { sort: 'audit_date', order: 'desc' };
  }
  return {
    sort: first.field as TagAuditSort,
    order: first.sort === 'asc' ? 'asc' : 'desc',
  };
}

type LoadResult =
  | {
      key: string;
      rows: RecentAuditRecord[];
      tagName: string;
      description: string | null;
      boundary: string | null;
      total: number;
      error?: never;
    }
  | { key: string; error: TagsApiError; rows?: never };

/**
 * Tag detail page: every audit report carrying one tag.
 *
 * Data comes from `GET /api/tags/<tag>/audits`, which resolves the URL segment
 * (slug or display name) to a real tag and returns its canonical casing. That
 * means the heading shows "Information Technology" while the URL stays
 * `information-technology`, and a typo produces a not-found state rather than
 * an empty list that looks like "no reports".
 */
export default function TagPage() {
  const { tagname = '' } = useParams<{ tagname: string }>();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  // The grid's sort model is controlled, so the header arrows always reflect
  // what the server actually applied.
  const [sortModel, setSortModel] = useState<GridSortModel>(DEFAULT_SORT);

  const { page, pageSize } = paginationModel;
  const { sort, order } = sortParams(sortModel);
  const requestKey = `${tagname}:${page}:${pageSize}:${sort}:${order}:${attempt}`;
  const current = result?.key === requestKey ? result : null;
  const loading = current === null;

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchTagAudits(
      tagname,
      { page: page + 1, limit: pageSize, sort, order },
      { signal: controller.signal },
    )
      .then((response) => {
        if (ignore) return;
        setResult({
          key: requestKey,
          rows: response.data,
          tagName: response.tag.name,
          description: response.tag.description,
          boundary: response.tag.boundary,
          total: response.pagination.total_items,
        });
        // A page can become empty after data changes; step back to the last
        // page that still has rows rather than showing a blank table.
        const lastPage = Math.max(0, response.pagination.total_pages - 1);
        if (page > lastPage) {
          setPaginationModel({ page: lastPage, pageSize });
        }
      })
      .catch((failure: unknown) => {
        if (ignore || controller.signal.aborted) return;
        setResult({
          key: requestKey,
          error:
            failure instanceof TagsApiError
              ? failure
              : new TagsApiError('Unable to load this tag. Please try again.'),
        });
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [tagname, page, pageSize, sort, order, requestKey]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);

  function changePage(next: GridPaginationModel) {
    const nextPage = next.pageSize === pageSize ? next.page : 0;
    if (page === nextPage && pageSize === next.pageSize) return;
    setPaginationModel({ page: nextPage, pageSize: next.pageSize });
  }

  /**
   * Applies a new sort and returns to the first page.
   *
   * Staying on page 3 after re-sorting would show the third page of a different
   * ordering, which reads as data having moved.
   */
  function changeSort(next: GridSortModel) {
    setSortModel(next.length > 0 ? next : DEFAULT_SORT);
    setPaginationModel({ page: 0, pageSize });
  }

  // A tag that does not exist is a page-level state, not a table error.
  if (current?.error?.notFound) {
    return <UnknownTag segment={tagname} />;
  }

  const tagName = current?.rows ? current.tagName : tagNameFromSegment(tagname);
  const rows = current?.rows ?? [];
  const total = current?.rows ? current.total : 0;

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

        {/*
          The tagging rule sits directly under the heading, before the count and
          the table: it explains what the list below is showing. Omitted while
          loading so the skeleton does not jump, and omitted entirely for a tag
          with no rule text.
        */}
        {current?.rows && (
          <TagRuleText
            description={current.description}
            boundary={current.boundary}
            sx={{ mb: 3 }}
          />
        )}

        <Box aria-busy={loading}>
          {loading ? (
            <Skeleton
              variant="text"
              width={260}
              role="status"
              aria-label="Loading audits for this tag"
              sx={{ mb: 3 }}
            />
          ) : (
            total > 0 && (
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 3, maxWidth: 720 }}
              >
                {total === 1
                  ? '1 audit report carries this tag.'
                  : `${total} audit reports carry this tag.`}
              </Typography>
            )
          )}

          {current?.error ? (
            <SectionPanel>
              <Stack spacing={2} alignItems="flex-start">
                <Alert severity="error">{current.error.message}</Alert>
                {current.error.status === 401 ? (
                  <Button component={RouterLink} to={ROUTES.landing}>
                    Sign in again
                  </Button>
                ) : (
                  <Button onClick={retry}>Retry</Button>
                )}
              </Stack>
            </SectionPanel>
          ) : loading ? (
            <SectionPanel>
              <Skeleton variant="rounded" height={220} />
            </SectionPanel>
          ) : (
            <RecentReportsTable
              rows={rows}
              rowCount={total}
              loading={false}
              paginationModel={paginationModel}
              onPaginationModelChange={changePage}
              sortModel={sortModel}
              onSortModelChange={changeSort}
            />
          )}
        </Box>

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
 * Display casing for a slug while the request is in flight.
 *
 * Only used for the breadcrumb and heading before the server answers; the
 * response replaces it with the tag's real name. It deliberately does not try
 * to guess capitalization beyond capitalizing word starts.
 */
function tagNameFromSegment(segment: string): string {
  const words = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim().split(/\s+/);
  return words
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Fallback for a URL that does not match any known tag.
 *
 * Suggests the live tag list, because every tag is a real destination and a
 * mistyped or stale link should still lead somewhere useful. Tags with no
 * reports are included: they are valid pages with an empty state.
 */
function UnknownTag({ segment }: { segment: string }) {
  const [tags, setTags] = useState<TagSummary[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchTags({ signal: controller.signal })
      .then((list) => {
        if (!ignore) setTags(list);
      })
      // The suggestion list is an enhancement; a failure just omits it.
      .catch(() => {
        if (!ignore) setTags([]);
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

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

          {tags === null ? (
            <Skeleton
              variant="text"
              width={220}
              role="status"
              aria-label="Loading tags"
            />
          ) : tags.length > 0 ? (
            <>
              <Typography variant="subtitle2" component="h2" gutterBottom>
                Browse a tag
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {tags.map(({ name }) => (
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
          ) : (
            <Prose>No tags exist yet. Tags appear once reports are tagged.</Prose>
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
