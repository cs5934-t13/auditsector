import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchTags,
  fetchTagAudits,
  TagsApiError,
} from '../src/api/tags.ts';

const tag = {
  tag_id: 9,
  name: 'Information Technology',
  report_count: 2,
  description: 'IT systems and governance, cybersecurity and logical access.',
  boundary: 'Physical door/key controls alone are not IT.',
};

const audit = {
  audit_id: '00000000-0000-4000-8000-000000000003',
  title: 'Controlled audit',
  audit_date: '2026-09-15T00:00:00',
  created_at: '2026-11-04T10:00:00',
  risk_level: 'MEDIUM',
  tags: ['Information Technology'],
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const options = (value, status = 200) => ({ fetcher: async () => json(value, status) });

const tagBody = (rows = [audit], page = 1, limit = 20, total = rows.length) => ({
  data: rows,
  tag: {
    tag_id: 9,
    name: 'Information Technology',
    description: tag.description,
    boundary: tag.boundary,
  },
  pagination: { page, limit, total_items: total, total_pages: Math.ceil(total / limit) },
});

// --- GET /api/tags ---------------------------------------------------------

test('fetchTags maps report_count to reportCount and keeps server order', async () => {
  const result = await fetchTags({
    fetcher: async (path, init) => {
      assert.equal(path, '/api/tags');
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      return json({
        data: [
          tag,
          { tag_id: 2, name: 'Fixed Assets', report_count: 0, description: null, boundary: null },
        ],
      });
    },
  });

  assert.deepEqual(result, [
    {
      tag_id: 9,
      name: 'Information Technology',
      reportCount: 2,
      description: 'IT systems and governance, cybersecurity and logical access.',
      boundary: 'Physical door/key controls alone are not IT.',
    },
    { tag_id: 2, name: 'Fixed Assets', reportCount: 0, description: null, boundary: null },
  ]);
});

test('fetchTags accepts an empty tag table', async () => {
  assert.deepEqual(await fetchTags(options({ data: [] })), []);
});

for (const value of [
  null, [], {}, { data: null },
  { data: [{}] },
  { data: [{ ...tag, tag_id: 0 }] },
  { data: [{ ...tag, tag_id: '9' }] },
  { data: [{ ...tag, name: '' }] },
  { data: [{ ...tag, name: null }] },
  { data: [{ ...tag, report_count: -1 }] },
  { data: [{ ...tag, report_count: '2' }] },
  // Duplicate names would make the index ambiguous.
  { data: [tag, { ...tag }] },
]) {
  test(`fetchTags rejects malformed response ${JSON.stringify(value).slice(0, 50)}`, async () => {
    await assert.rejects(fetchTags(options(value)),
      (error) => error instanceof TagsApiError && error.code === 'UNEXPECTED_RESPONSE');
  });
}

// --- GET /api/tags/<tag>/audits -------------------------------------------

test('fetchTagAudits sends the encoded slug and pagination', async () => {
  const expected = tagBody();
  const result = await fetchTagAudits('information-technology', {}, {
    fetcher: async (path) => {
      assert.equal(path, '/api/tags/information-technology/audits?page=1&limit=20');
      return json(expected);
    },
  });
  assert.deepEqual(result, expected);
});

test('fetchTagAudits encodes spaces so a display name still routes', async () => {
  // page 2 of 10 with 15 total means 5 rows remain on the page.
  const page2 = tagBody(
    Array.from({ length: 5 }, (_, index) => ({
      ...audit,
      audit_id: `00000000-0000-4000-8000-00000000010${index}`,
    })),
    2,
    10,
    15,
  );

  await fetchTagAudits('Information Technology', { page: 2, limit: 10 }, {
    fetcher: async (path) => {
      assert.equal(
        path,
        '/api/tags/Information%20Technology/audits?page=2&limit=10',
      );
      return json(page2);
    },
  });
});

test('an unused tag returns an empty page, not an error', async () => {
  const result = await fetchTagAudits('inventory', {}, options(tagBody([], 1, 20, 0)));
  assert.deepEqual(result.data, []);
  assert.equal(result.pagination.total_items, 0);
});

test('rejects an empty tag before requesting', async () => {
  await assert.rejects(fetchTagAudits('   ', {}, { fetcher: () => assert.fail('must not fetch') }),
    (error) => error instanceof TagsApiError && error.code === 'INVALID_TAG');
});

for (const query of [
  { page: 0 }, { page: -1 }, { page: 1.5 }, { limit: 0 }, { limit: 101 }, { limit: 2.5 },
]) {
  test(`rejects invalid pagination ${JSON.stringify(query)} before requesting`, async () => {
    await assert.rejects(
      fetchTagAudits('x', query, { fetcher: () => assert.fail('must not fetch') }),
      (error) => error.code === 'INVALID_PAGINATION',
    );
  });
}

test('exposes a not-found tag as a distinguished error', async () => {
  await assert.rejects(
    fetchTagAudits('nope', {}, options({
      error: { code: 'TAG_NOT_FOUND', message: 'No tag matches "nope"' },
    }, 404)),
    (error) => error instanceof TagsApiError
      && error.notFound
      && error.status === 404
      && error.code === 'TAG_NOT_FOUND'
      && error.message === 'No tag matches "nope"',
  );
});

test('a 404 without a code is still treated as not found', async () => {
  await assert.rejects(fetchTagAudits('x', {}, options({}, 404)),
    (error) => error.notFound && error.status === 404);
});

test('reports authentication failures', async () => {
  await assert.rejects(
    fetchTagAudits('x', {}, options({ status: 'failed', reason: 'authentication required' }, 401)),
    (error) => error.status === 401 && /Sign in/.test(error.message) && !error.notFound,
  );
});

for (const value of [
  null, [], {}, { data: [] },
  { ...tagBody(), tag: null },
  { ...tagBody(), tag: {} },
  { ...tagBody([audit], 2) },
  { ...tagBody([{ ...audit, title: null }]) },
  { ...tagBody([{ ...audit, risk_level: 'SEVERE' }]) },
  { ...tagBody([{ ...audit, tags: [3] }]) },
  { ...tagBody([audit, audit]) },
  { ...tagBody(), pagination: { ...tagBody().pagination, total_pages: 5 } },
]) {
  test(`fetchTagAudits rejects malformed response ${JSON.stringify(value).slice(0, 50)}`, async () => {
    await assert.rejects(fetchTagAudits('x', {}, options(value)),
      (error) => error instanceof TagsApiError && error.code === 'UNEXPECTED_RESPONSE');
  });
}

test('handles a network failure', async () => {
  await assert.rejects(fetchTags({ fetcher: async () => { throw new TypeError('offline'); } }),
    (error) => error.code === 'NETWORK_ERROR');
});

test('does not fetch when already cancelled', async () => {
  await assert.rejects(
    fetchTagAudits('x', {}, {
      signal: AbortSignal.abort(),
      fetcher: () => assert.fail('must not fetch'),
    }),
    (error) => error.code === 'REQUEST_ABORTED',
  );
});

// --- tagging rule (description + boundary) --------------------------------

test('maps the inclusion rule and the boundary', async () => {
  const [summary] = await fetchTags(options({ data: [tag] }));

  assert.equal(summary.description, 'IT systems and governance, cybersecurity and logical access.');
  assert.equal(summary.boundary, 'Physical door/key controls alone are not IT.');
});

test('accepts a tag with no rule text at all', async () => {
  // A tag a user added, or a database predating the columns.
  const [summary] = await fetchTags(options({
    data: [{ tag_id: 5, name: 'Ad Hoc', report_count: 0 }],
  }));

  assert.equal(summary.description, null);
  assert.equal(summary.boundary, null);
});

test('accepts a tag with only the older description column', async () => {
  const [summary] = await fetchTags(options({
    data: [{ tag_id: 5, name: 'Ad Hoc', report_count: 0, description: 'Only scope.' }],
  }));

  assert.equal(summary.description, 'Only scope.');
  assert.equal(summary.boundary, null);
});

for (const bad of [42, {}, []]) {
  test(`rejects a non-string rule field ${JSON.stringify(bad)}`, async () => {
    await assert.rejects(
      fetchTags(options({ data: [{ ...tag, description: bad }] })),
      (error) => error instanceof TagsApiError && error.code === 'UNEXPECTED_RESPONSE',
    );
    await assert.rejects(
      fetchTags(options({ data: [{ ...tag, boundary: bad }] })),
      (error) => error instanceof TagsApiError && error.code === 'UNEXPECTED_RESPONSE',
    );
  });
}

test('returns the rule with the resolved tag on a detail request', async () => {
  const result = await fetchTagAudits('x', {}, options(tagBody()));
  assert.equal(result.tag.description, tag.description);
  assert.equal(result.tag.boundary, tag.boundary);
});

test('detail response tolerates a tag without a boundary', async () => {
  const body = tagBody();
  delete body.tag.boundary;
  const result = await fetchTagAudits('x', {}, options(body));
  assert.equal(result.tag.boundary, null);
});
