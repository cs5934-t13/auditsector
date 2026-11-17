import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTags, fetchTagAudits, resolveTag, TagsApiError } from '../src/api/tags.ts';

const tags = [{ tag_id: 2, name: 'Payroll', created_at: 'ignored' }, { tag_id: 1, name: 'Inventory' }];
const audit = { audit_id: '00000000-0000-4000-8000-000000000001', title: 'Controlled audit', risk_level: 'HIGH', run_status: 'COMPLETED' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const options = (body, status) => ({ fetcher: async () => json(body, status) });
const unexpected = (error) => error instanceof TagsApiError && error.code === 'UNEXPECTED_RESPONSE';

for (const [name, load, path, body] of [
  ['catalog', fetchTags, '/api/tag', tags],
  ['reports', (opts) => fetchTagAudits(2, opts), '/api/tag/2', [audit]],
]) {
  test(`${name} sends an authenticated GET to the existing route`, async () => {
    await load({ fetcher: async (url, init) => {
      assert.equal(url, path);
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.body, undefined);
      return json(body);
    } });
  });
  test(`${name} accepts a real empty array`, async () => {
    assert.deepEqual(await load(options([])), []);
  });
  test(`${name} recognizes the existing authentication error`, async () => {
    await assert.rejects(load(options({ status: 'failed', reason: 'authentication required' }, 401)),
      (error) => error.status === 401 && error.message === 'Sign in to view tags.');
  });
  test(`${name} handles non-JSON 500`, async () => {
    await assert.rejects(load({ fetcher: async () => new Response('failure', { status: 500 }) }),
      (error) => error.status === 500 && error instanceof TagsApiError);
  });
  test(`${name} handles network failure`, async () => {
    await assert.rejects(load({ fetcher: async () => { throw new TypeError('offline'); } }),
      (error) => error.code === 'NETWORK_ERROR');
  });
  test(`${name} rejects invalid success JSON`, async () => {
    await assert.rejects(load({ fetcher: async () => new Response('not JSON') }), unexpected);
  });
  test(`${name} rejects an unexpected success status`, async () => {
    await assert.rejects(load(options(body, 201)), unexpected);
  });
  test(`${name} does not fetch with an already-aborted signal`, async () => {
    await assert.rejects(load({ signal: AbortSignal.abort(), fetcher: () => assert.fail('must not fetch') }),
      (error) => error.code === 'REQUEST_ABORTED');
  });
}

test('catalog uses real records, sorts names, and does not fabricate counts', async () => {
  const result = await fetchTags(options(tags));
  assert.deepEqual(result, [{ tag_id: 1, name: 'Inventory' }, { tag_id: 2, name: 'Payroll' }]);
  assert.equal('reportCount' in result[0], false);
});
for (const [index, body] of [null, {}, { data: tags }, [null], [{ name: 'Missing ID' }],
  [{ tag_id: '1', name: 'Text ID' }], [{ tag_id: 0, name: 'Zero' }],
  [{ tag_id: 1.5, name: 'Fraction' }], [{ tag_id: Number.MAX_SAFE_INTEGER + 1, name: 'Unsafe' }],
  [{ tag_id: 1, name: null }], [{ tag_id: 1, name: '  ' }], [tags[0], tags[0]],
].entries()) {
  test(`rejects malformed catalog ${index + 1}`, async () => {
    await assert.rejects(fetchTags(options(body)), unexpected);
  });
}
for (const id of [audit.audit_id, 42]) {
  test(`preserves report identifier ${id}`, async () => {
    const row = { ...audit, audit_id: id, audit_date: 'server date format', name: 'Inventory' };
    assert.deepEqual(await fetchTagAudits(1, options([row])), [{ ...audit, audit_id: id }]);
  });
}
test('preserves server report order and nullable stored values', async () => {
  const rows = [audit, { ...audit, audit_id: 2, risk_level: null, run_status: null }];
  assert.deepEqual(await fetchTagAudits(1, options(rows)), rows);
});
for (const [index, body] of [null, {}, { data: [audit] }, [null], [{ ...audit, audit_id: '' }],
  [{ ...audit, audit_id: 0 }], [{ ...audit, title: null }], [{ ...audit, risk_level: 'URGENT' }],
  [{ ...audit, risk_level: ['HIGH'] }], [{ ...audit, run_status: 'SUCCESS' }],
  [{ ...audit, run_status: ['PENDING'] }], [audit, audit],
  [{ ...audit, audit_id: 42 }, { ...audit, audit_id: '42' }],
].entries()) {
  test(`rejects malformed reports ${index + 1}`, async () => {
    await assert.rejects(fetchTagAudits(1, options(body)), unexpected);
  });
}
for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid tag identifier ${String(id)} without a request`, async () => {
    await assert.rejects(fetchTagAudits(id, { fetcher: () => assert.fail('must not fetch') }),
      (error) => error.code === 'INVALID_TAG');
  });
}
function pending(signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 100);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
test('times out a pending request', async () => {
  await assert.rejects(fetchTags({ timeoutMs: 5, fetcher: async (_, init) => pending(init.signal) }),
    (error) => error.code === 'REQUEST_TIMEOUT');
});
test('also times out while reading a response body', async () => {
  await assert.rejects(fetchTags({ timeoutMs: 5, fetcher: async (_, init) => ({
    ok: true, status: 200, json: () => pending(init.signal),
  }) }), (error) => error.code === 'REQUEST_TIMEOUT');
});
test('cancels a request in flight', async () => {
  const controller = new AbortController();
  const request = fetchTags({ signal: controller.signal, fetcher: async (_, init) => pending(init.signal) });
  controller.abort();
  await assert.rejects(request, (error) => error.code === 'REQUEST_ABORTED');
});
test('keeps structured API error messages', async () => {
  await assert.rejects(fetchTags(options({ error: { code: 'TEST_ERROR', message: 'Test message' } }, 500)),
    (error) => error.status === 500 && error.code === 'TEST_ERROR' && error.message === 'Test message');
});
const catalog = [
  { tag_id: 1, name: 'Information Technology' }, { tag_id: 2, name: 'C++' },
  { tag_id: 3, name: 'C#' }, { tag_id: 4, name: 'Sécurité' }, { tag_id: 5, name: '!!!' },
];
for (const [segment, expectedId] of [['2', 2], ['3', 3], ['Information Technology', 1],
  ['information-technology', 1], ['securite', 4], ['C++', 2], ['!!!', 5]]) {
  test(`resolves live or legacy tag link ${segment}`, () => {
    assert.equal(resolveTag(catalog, segment)?.tag_id, expectedId);
  });
}
for (const segment of ['999', 'unknown', 'c', '???', '']) {
  test(`does not guess an unknown/ambiguous tag ${segment}`, () => {
    assert.equal(resolveTag(catalog, segment), undefined);
  });
}
