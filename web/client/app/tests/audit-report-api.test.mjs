import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAuditReport, AuditReportApiError } from '../src/api/auditReport.ts';

const report = {
  audit_id: 'test-audit-123',
  schedule_id: 1,
  title: 'Emergency Communications Audit',
  muni: 'Portland',
  audit_url: 'https://example.gov/report.pdf',
  audit_date: '2026-09-15T00:00:00',
  risk_level: 'INFO',
  run_status: 'COMPLETED',
  summary: 'The audit identified staffing and training challenges.',
  created_at: '2026-09-30T14:25:00',
  tags: [{ tag_id: 6, name: 'Human Resources', description: null }],
};
const body = (value = report) => ({ data: value });
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const options = (value, status = 200) => ({ fetcher: async () => json(value, status) });

test('requests the report by id with the session cookie', async () => {
  const result = await fetchAuditReport('test-audit-123', {
    fetcher: async (path, init) => {
      assert.equal(path, '/api/audits/test-audit-123');
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      assert.equal(init.body, undefined);
      assert.ok(init.signal instanceof AbortSignal);
      return json(body());
    },
  });

  assert.equal(result.audit_id, 'test-audit-123');
  assert.equal(result.municipality, 'Portland');
  assert.equal(result.auditUrl, 'https://example.gov/report.pdf');
  assert.equal(result.riskLevel, 'INFO');
  assert.equal(result.runStatus, 'COMPLETED');
  assert.equal(result.scheduleId, 1);
  assert.equal(result.summary, 'The audit identified staffing and training challenges.');
  assert.deepEqual(result.tags, report.tags);
});

test('encodes identifiers that are not URL-safe', async () => {
  await fetchAuditReport('a/b c', {
    fetcher: async (path) => {
      assert.equal(path, '/api/audits/a%2Fb%20c');
      return json(body({ ...report, audit_id: 'a/b c' }));
    },
  });
});

test('trims the identifier and rejects an empty one before requesting', async () => {
  await assert.rejects(
    fetchAuditReport('   ', { fetcher: () => assert.fail('must not fetch') }),
    (error) => error instanceof AuditReportApiError && error.code === 'INVALID_AUDIT_ID',
  );
});

test('normalizes null and empty optional fields', async () => {
  const result = await fetchAuditReport('x', options(body({
    ...report,
    muni: null,
    summary: '   ',
    risk_level: null,
    run_status: null,
    schedule_id: null,
    tags: [],
  })));

  assert.equal(result.municipality, '');
  assert.equal(result.summary, null);
  assert.equal(result.riskLevel, null);
  assert.equal(result.runStatus, null);
  assert.equal(result.scheduleId, null);
  assert.deepEqual(result.tags, []);
});

test('accepts camelCase field names', async () => {
  const result = await fetchAuditReport('x', options(body({
    audit_id: 'x',
    scheduleId: 2,
    title: 'T',
    municipality: 'Seattle',
    auditUrl: 'https://example.gov/a.pdf',
    auditDate: '2026-09-15T00:00:00',
    riskLevel: 'HIGH',
    runStatus: 'RUNNING',
    summary: null,
    createdAt: '2026-09-30T14:25:00',
    tags: [],
  })));

  assert.equal(result.municipality, 'Seattle');
  assert.equal(result.auditDate, '2026-09-15T00:00:00');
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.runStatus, 'RUNNING');
});

for (const value of [
  null, [], {}, { data: null }, body({ ...report, audit_id: '' }),
  body({ ...report, audit_id: 42 }),
  body({ ...report, title: '' }),
  body({ ...report, title: null }),
  body({ ...report, audit_date: '2026-09-15' }),
  body({ ...report, audit_date: '2026-02-30T00:00:00' }),
  body({ ...report, created_at: '2026-09-30T14:25:00Z' }),
  body({ ...report, created_at: null }),
  body({ ...report, audit_url: 42 }),
  body({ ...report, muni: 42 }),
  body({ ...report, summary: 42 }),
  body({ ...report, risk_level: 'SEVERE' }),
  body({ ...report, run_status: 'DONE' }),
  body({ ...report, schedule_id: 0 }),
  body({ ...report, schedule_id: 'x' }),
  body({ ...report, tags: null }),
  body({ ...report, tags: [{}] }),
  body({ ...report, tags: [{ tag_id: 0, name: 'A', description: null }] }),
  body({ ...report, tags: [{ tag_id: 1, name: '', description: null }] }),
  body({ ...report, tags: [{ tag_id: 1, name: 'A', description: 5 }] }),
]) {
  test(`rejects malformed response ${JSON.stringify(value).slice(0, 60)}`, async () => {
    await assert.rejects(fetchAuditReport('x', options(value)),
      (error) => error instanceof AuditReportApiError && error.code === 'UNEXPECTED_RESPONSE');
  });
}

test('treats 404 as not found with a friendly message', async () => {
  await assert.rejects(
    fetchAuditReport('missing', options({ error: { code: 'AUDIT_NOT_FOUND', message: 'Audit report not found.' } }, 404)),
    (error) => error instanceof AuditReportApiError
      && error.notFound
      && error.status === 404
      && error.code === 'AUDIT_NOT_FOUND'
      && error.message === 'That audit report could not be found.',
  );
});

test('reports authentication failures', async () => {
  await assert.rejects(
    fetchAuditReport('x', options({ status: 'failed', reason: 'authentication required' }, 401)),
    (error) => error.status === 401 && error.message === 'Sign in to view this audit report.'
      && !error.notFound,
  );
});

test('preserves a structured server error', async () => {
  await assert.rejects(
    fetchAuditReport('x', options({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to retrieve audit report.' } }, 500)),
    (error) => error.code === 'INTERNAL_SERVER_ERROR'
      && error.message === 'Unable to retrieve audit report.',
  );
});

for (const status of [403, 500]) {
  test(`handles non-JSON HTTP ${status}`, async () => {
    await assert.rejects(
      fetchAuditReport('x', { fetcher: async () => new Response('<html>Error</html>', { status }) }),
      (error) => error instanceof AuditReportApiError && error.status === status,
    );
  });
}

for (const status of [201, 206]) {
  test(`rejects unexpected success status ${status}`, async () => {
    await assert.rejects(fetchAuditReport('x', options(body(), status)),
      (error) => error.code === 'UNEXPECTED_RESPONSE');
  });
}

for (const response of [() => new Response('not JSON'), () => new Response(null, { status: 204 })]) {
  test('rejects invalid successful content', async () => {
    await assert.rejects(fetchAuditReport('x', { fetcher: async () => response() }),
      (error) => error.code === 'UNEXPECTED_RESPONSE');
  });
}

test('handles a network failure', async () => {
  await assert.rejects(
    fetchAuditReport('x', { fetcher: async () => { throw new TypeError('offline'); } }),
    (error) => error.code === 'NETWORK_ERROR',
  );
});

test('does not fetch when already cancelled', async () => {
  await assert.rejects(
    fetchAuditReport('x', { signal: AbortSignal.abort(), fetcher: () => assert.fail('must not fetch') }),
    (error) => error.code === 'REQUEST_ABORTED',
  );
});
