import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRecentAudits, RecentAuditsApiError } from '../src/api/recentAudits.ts';

const audit = {
  audit_id: '00000000-0000-4000-8000-000000000003',
  title: 'Controlled audit',
  audit_date: '2026-09-15T00:00:00',
  created_at: '2026-11-04T10:00:00',
};
const body = (rows = [audit], page = 1, limit = 20, total = rows.length) => ({
  data: rows,
  pagination: { page, limit, total_items: total, total_pages: Math.ceil(total / limit) },
});
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const options = (value, status = 200) => ({ fetcher: async () => json(value, status) });

for (const [query, page, limit] of [[undefined, 1, 20], [{ page: 2, limit: 10 }, 2, 10], [{ limit: 100 }, 1, 100]]) {
  test(`GET page ${page}, limit ${limit}, sends the session cookie and only pagination`, async () => {
    const expected = body([], page, limit, 0);
    const result = await fetchRecentAudits(query, { fetcher: async (path, init) => {
      assert.equal(path, `/api/audits/recent?page=${page}&limit=${limit}`);
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      assert.equal(init.body, undefined);
      assert.ok(init.signal instanceof AbortSignal);
      return json(expected);
    } });
    assert.deepEqual(result, expected);
  });
}

for (const id of [audit.audit_id, 42]) {
  test(`preserves identifier ${id} and stored dates`, async () => {
    const expected = body([{ ...audit, audit_id: id }]);
    assert.deepEqual(await fetchRecentAudits({}, options(expected)), expected);
  });
}
test('preserves server order, including tied creation times', async () => {
  const expected = body([audit, { ...audit, audit_id: '00000000-0000-4000-8000-000000000002' }]);
  assert.deepEqual(await fetchRecentAudits({}, options(expected)), expected);
});
for (const [name, value] of [
  ['empty database', body([])],
  ['partial last page', body([audit], 2, 2, 3)],
  ['page beyond available results', body([], 3, 2, 3)],
]) {
  test(`accepts ${name}`, async () => {
    assert.deepEqual(await fetchRecentAudits({ page: value.pagination.page, limit: value.pagination.limit }, options(value)), value);
  });
}
for (const query of [
  { page: 0 }, { page: -1 }, { page: 1.5 }, { page: '1' }, { page: null },
  { page: Number.MAX_SAFE_INTEGER + 1 }, { limit: 0 }, { limit: 101 },
  { limit: 2.5 }, { limit: '' }, { limit: NaN }, { limit: Infinity },
]) {
  test(`rejects invalid query ${JSON.stringify(query)} before requesting`, async () => {
    await assert.rejects(fetchRecentAudits(query, { fetcher: () => assert.fail('must not fetch') }),
      (error) => error instanceof RecentAuditsApiError && error.code === 'INVALID_PAGINATION');
  });
}
const malformed = [
  null, [], {}, { data: [] }, { ...body(), data: null },
  ...['', '   ', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((audit_id) => body([{ ...audit, audit_id }])),
  body([{ ...audit, title: null }]),
  body([{ ...audit, created_at: '2026-11-04T10:00:00Z' }]),
  body([{ ...audit, audit_date: '2026-02-30T00:00:00' }]),
  body([{ ...audit, created_at: '2026-11-04T25:00:00' }]),
  body([{ ...audit, created_at: null }]),
  body([audit], 2), body([audit], 1, 10),
  { ...body(), pagination: { ...body().pagination, total_items: '1' } },
  { ...body(), pagination: { ...body().pagination, total_items: -1 } },
  { ...body(), pagination: { ...body().pagination, total_pages: 3 } },
  body([], 1, 20, 1), body([audit, audit]),
  body([{ ...audit, audit_id: 42 }, { ...audit, audit_id: '42' }]),
];
malformed.forEach((value, index) => {
  test(`rejects malformed response ${index + 1}`, async () => {
    await assert.rejects(fetchRecentAudits({}, options(value)),
      (error) => error instanceof RecentAuditsApiError && error.code === 'UNEXPECTED_RESPONSE');
  });
});
test('recognizes the existing Flask authentication error', async () => {
  await assert.rejects(fetchRecentAudits({}, options({ status: 'failed', reason: 'authentication required' }, 401)),
    (error) => error.status === 401 && error.message === 'Sign in to view recent reports.');
});
test('preserves a structured server error', async () => {
  await assert.rejects(fetchRecentAudits({}, options({ error: {
    code: 'INTERNAL_SERVER_ERROR', message: 'Unable to retrieve recent audits',
  } }, 500)), (error) => error.status === 500 && error.code === 'INTERNAL_SERVER_ERROR'
    && error.message === 'Unable to retrieve recent audits');
});
for (const status of [401, 403, 404, 500]) {
  test(`handles non-JSON HTTP ${status}`, async () => {
    await assert.rejects(fetchRecentAudits({}, { fetcher: async () => new Response('<html>Error</html>', { status }) }),
      (error) => error instanceof RecentAuditsApiError && error.status === status);
  });
}
for (const status of [201, 206]) {
  test(`rejects unexpected success status ${status}`, async () => {
    await assert.rejects(fetchRecentAudits({}, options(body(), status)),
      (error) => error.code === 'UNEXPECTED_RESPONSE');
  });
}
for (const response of [() => new Response('not JSON'), () => new Response(null, { status: 204 })]) {
  test('rejects invalid successful content', async () => {
    await assert.rejects(fetchRecentAudits({}, { fetcher: async () => response() }),
      (error) => error.code === 'UNEXPECTED_RESPONSE');
  });
}
test('handles a network failure', async () => {
  await assert.rejects(fetchRecentAudits({}, { fetcher: async () => { throw new TypeError('offline'); } }),
    (error) => error.code === 'NETWORK_ERROR');
});
test('does not fetch when already cancelled', async () => {
  await assert.rejects(fetchRecentAudits({}, { signal: AbortSignal.abort(), fetcher: () => assert.fail('must not fetch') }),
    (error) => error.code === 'REQUEST_ABORTED');
});
function pending(signal) {
  return new Promise((resolve, reject) => {
    const keepAlive = setTimeout(resolve, 100);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
  });
}
test('times out a pending request', async () => {
  await assert.rejects(fetchRecentAudits({}, { timeoutMs: 5, fetcher: async (_, init) => pending(init.signal) }),
    (error) => error.code === 'REQUEST_TIMEOUT');
});
test('cancels an in-flight request', async () => {
  const controller = new AbortController();
  const request = fetchRecentAudits({}, { signal: controller.signal, fetcher: async (_, init) => pending(init.signal) });
  controller.abort();
  await assert.rejects(request, (error) => error.code === 'REQUEST_ABORTED');
});
test('also times out while reading the response body', async () => {
  await assert.rejects(fetchRecentAudits({}, { timeoutMs: 5, fetcher: async (_, init) => ({
    ok: true, status: 200, json: () => pending(init.signal),
  }) }), (error) => error.code === 'REQUEST_TIMEOUT');
});
