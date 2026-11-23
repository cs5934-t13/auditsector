import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRiskOverTime,
  fetchScanActivity,
  HomeActivityApiError,
} from '../src/api/homeActivity.ts';

const riskPoint = {
  period: '2026-01',
  label: 'Jan',
  total: 42,
  counts: { INFO: 16, LOW: 14, MEDIUM: 9, HIGH: 3, CRITICAL: 0, UNRATED: 0 },
};
const scanPoint = { period: '2026-01', label: 'Jan', total: 42 };

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const options = (value, status = 200) => ({ fetcher: async () => json(value, status) });

test('risk-over-time flattens counts and sends no query by default', async () => {
  const result = await fetchRiskOverTime({}, {
    fetcher: async (path, init) => {
      assert.equal(path, '/api/audits/risk-over-time');
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      return json({ data: [riskPoint] });
    },
  });

  assert.deepEqual(result, [
    {
      period: '2026-01',
      label: 'Jan',
      total: 42,
      unrated: 0,
      INFO: 16,
      LOW: 14,
      MEDIUM: 9,
      HIGH: 3,
      CRITICAL: 0,
    },
  ]);
});

test('scan-activity maps total to scans and sends the requested range', async () => {
  const result = await fetchScanActivity(
    { startDate: '2026-01-01', endDate: '2026-03-31', interval: 'WEEK' },
    {
      fetcher: async (path) => {
        assert.equal(
          path,
          '/api/audits/scan-activity?start_date=2026-01-01&end_date=2026-03-31&interval=WEEK',
        );
        return json({ data: [scanPoint] });
      },
    },
  );

  assert.deepEqual(result, [{ period: '2026-01', label: 'Jan', scans: 42 }]);
});

test('an empty series is valid, not an error', async () => {
  assert.deepEqual(await fetchRiskOverTime({}, options({ data: [] })), []);
  assert.deepEqual(await fetchScanActivity({}, options({ data: [] })), []);
});

test('accepts a zero-count bucket', async () => {
  const empty = {
    period: '2026-02',
    label: 'Feb',
    total: 0,
    counts: { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNRATED: 0 },
  };
  const [point] = await fetchRiskOverTime({}, options({ data: [empty] }));
  assert.equal(point.total, 0);
  assert.equal(point.INFO, 0);
});

test('accepts unrated reports and counts them outside the five levels', async () => {
  const withUnrated = {
    ...riskPoint,
    total: 43,
    counts: { ...riskPoint.counts, UNRATED: 1 },
  };
  const [point] = await fetchRiskOverTime({}, options({ data: [withUnrated] }));
  assert.equal(point.unrated, 1);
  assert.equal(point.total, 43);
});

const malformedRisk = [
  { data: [null] },
  { data: [{}] },
  { data: [{ ...riskPoint, period: '' }] },
  { data: [{ ...riskPoint, label: '' }] },
  { data: [{ ...riskPoint, total: -1 }] },
  { data: [{ ...riskPoint, total: 1.5 }] },
  { data: [{ ...riskPoint, total: '42' }] },
  { data: [{ ...riskPoint, counts: null }] },
  { data: [{ ...riskPoint, counts: {} }] },
  { data: [{ ...riskPoint, counts: { ...riskPoint.counts, INFO: -1 } }] },
  { data: [{ ...riskPoint, counts: { ...riskPoint.counts, UNRATED: null } }] },
  // Counts that do not add up to the stated total would draw a bar whose height
  // contradicts its own number.
  { data: [{ ...riskPoint, total: 999 }] },
  // Buckets must be oldest-first.
  { data: [{ ...riskPoint, period: '2026-02' }, riskPoint] },
];

malformedRisk.forEach((value, index) => {
  test(`risk-over-time rejects malformed response ${index + 1}`, async () => {
    await assert.rejects(
      fetchRiskOverTime({}, options(value)),
      (error) => error instanceof HomeActivityApiError && error.code === 'UNEXPECTED_RESPONSE',
    );
  });
});

for (const value of [
  null,
  [],
  {},
  { data: null },
  { data: [null] },
  { data: [{ ...scanPoint, label: '' }] },
  { data: [{ ...scanPoint, total: -1 }] },
  { data: [{ ...scanPoint, period: '2026-02' }, scanPoint] },
]) {
  test(`scan-activity rejects malformed response ${JSON.stringify(value).slice(0, 50)}`, async () => {
    await assert.rejects(
      fetchScanActivity({}, options(value)),
      (error) => error instanceof HomeActivityApiError && error.code === 'UNEXPECTED_RESPONSE',
    );
  });
}

test('surfaces the validation message from a 400', async () => {
  await assert.rejects(
    fetchRiskOverTime({}, options({
      error: { code: 'INVALID_DATE_RANGE', message: 'start_date must be on or before end_date' },
    }, 400)),
    (error) => error.status === 400
      && error.code === 'INVALID_DATE_RANGE'
      && error.message === 'start_date must be on or before end_date',
  );
});

test('reports authentication failures', async () => {
  await assert.rejects(
    fetchScanActivity({}, options({ status: 'failed', reason: 'authentication required' }, 401)),
    (error) => error.status === 401 && /Sign in/.test(error.message),
  );
});

for (const status of [403, 500]) {
  test(`handles non-JSON HTTP ${status}`, async () => {
    await assert.rejects(
      fetchRiskOverTime({}, { fetcher: async () => new Response('<html>Error</html>', { status }) }),
      (error) => error instanceof HomeActivityApiError && error.status === status,
    );
  });
}

test('rejects an unexpected success status', async () => {
  await assert.rejects(
    fetchScanActivity({}, options({ data: [scanPoint] }, 201)),
    (error) => error.code === 'UNEXPECTED_RESPONSE',
  );
});

test('handles a network failure', async () => {
  await assert.rejects(
    fetchScanActivity({}, { fetcher: async () => { throw new TypeError('offline'); } }),
    (error) => error.code === 'NETWORK_ERROR',
  );
});

test('does not fetch when already cancelled', async () => {
  await assert.rejects(
    fetchRiskOverTime({}, {
      signal: AbortSignal.abort(),
      fetcher: () => assert.fail('must not fetch'),
    }),
    (error) => error.code === 'REQUEST_ABORTED',
  );
});
