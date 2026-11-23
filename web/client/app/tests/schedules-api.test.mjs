import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteSchedule,
  fetchSchedules,
  ScheduleApiError,
} from '../src/api/schedules.ts';

const schedule = {
  schedule_id: 7,
  source_link: 'https://www.seattle.gov/city-auditor/reports',
  scan_frequency: 'WEEKLY',
  scan_status: 'ACTIVE',
  last_error: null,
  last_error_code: null,
  is_running: false,
  run_started_at: null,
  run_total: null,
  run_downloaded: 0,
  run_processed: 0,
  last_run_at: '2026-09-30T14:25:00',
  last_run_status: 'SUCCESS',
  next_run_at: '2026-10-07T14:25:00',
  created_at: '2026-09-01T09:00:00',
  created_by: 1,
  created_by_username: 'ferguszo',
  report_count: 12,
};

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('fetchSchedules requests the authenticated list', async () => {
  const result = await fetchSchedules({
    fetcher: async (path, init) => {
      assert.equal(path, '/api/schedules');
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.headers.Accept, 'application/json');
      return json({ data: [schedule] });
    },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].schedule_id, 7);
  assert.equal(result[0].report_count, 12);
});

test('fetchSchedules carries the worker\'s failure reason', async () => {
  const parked = {
    ...schedule,
    scan_status: 'UNSUPPORTED',
    last_run_status: 'ERROR',
    last_error: 'This source is not supported yet.',
    last_error_code: 'UNSUPPORTED_SOURCE',
    last_error_detail: 'No spider supports this collection URL yet',
  };

  const result = await fetchSchedules({
    fetcher: async () => json({ data: [parked] }),
  });

  assert.equal(result[0].scan_status, 'UNSUPPORTED');
  assert.equal(result[0].last_error, 'This source is not supported yet.');
  assert.equal(result[0].last_error_code, 'UNSUPPORTED_SOURCE');
  // Admin-only diagnostics are optional: the client tolerates their absence.
  assert.equal(result[0].last_error_detail, 'No spider supports this collection URL yet');
});

test('fetchSchedules works without administrator detail', async () => {
  const row = {
    ...schedule,
    last_run_status: 'ERROR',
    last_error: 'We could not read reports from this source.',
    last_error_code: 'SOURCE_UNREADABLE',
  };

  const result = await fetchSchedules({ fetcher: async () => json({ data: [row] }) });

  assert.equal(result[0].last_error_code, 'SOURCE_UNREADABLE');
  assert.equal(result[0].last_error_detail, undefined);
});

test('fetchSchedules carries live progress for a running scan', async () => {
  const running = {
    ...schedule,
    is_running: true,
    run_started_at: '2026-11-23T15:32:06',
    run_total: 209,
    run_downloaded: 209,
    run_processed: 41,
  };

  const result = await fetchSchedules({ fetcher: async () => json({ data: [running] }) });

  assert.equal(result[0].is_running, true);
  assert.equal(result[0].run_total, 209);
  assert.equal(result[0].run_processed, 41);
});

test('fetchSchedules rejects progress counts that are not integers', async () => {
  await assert.rejects(
    fetchSchedules({
      fetcher: async () => json({ data: [{ ...schedule, run_processed: 1.5 }] }),
    }),
    (error) => error.code === 'UNEXPECTED_RESPONSE',
  );
});

test('fetchSchedules rejects a malformed row', async () => {
  await assert.rejects(
    fetchSchedules({
      fetcher: async () => json({ data: [{ ...schedule, report_count: -1 }] }),
    }),
    (error) => {
      assert.ok(error instanceof ScheduleApiError);
      assert.equal(error.code, 'UNEXPECTED_RESPONSE');
      return true;
    },
  );
});

test('fetchSchedules surfaces the server error message', async () => {
  await assert.rejects(
    fetchSchedules({
      fetcher: async () =>
        json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Boom.' } }, 500),
    }),
    (error) => {
      assert.equal(error.message, 'Boom.');
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test('fetchSchedules explains an expired session', async () => {
  await assert.rejects(
    fetchSchedules({ fetcher: async () => json({}, 401) }),
    (error) => {
      assert.equal(error.status, 401);
      assert.match(error.message, /sign in again/i);
      return true;
    },
  );
});

test('deleteSchedule resolves on 204', async () => {
  await deleteSchedule(7, {
    fetcher: async (path, init) => {
      assert.equal(path, '/api/schedules/7');
      assert.equal(init.method, 'DELETE');
      assert.equal(init.credentials, 'same-origin');
      return new Response(null, { status: 204 });
    },
  });
});

test('deleteSchedule explains the in-use conflict', async () => {
  await assert.rejects(
    deleteSchedule(7, {
      fetcher: async () =>
        json(
          {
            error: {
              code: 'SCHEDULE_IN_USE',
              message: 'This schedule has 5 report(s) and cannot be deleted while they exist.',
            },
          },
          409,
        ),
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'SCHEDULE_IN_USE');
      assert.match(error.message, /5 report/);
      return true;
    },
  );
});

test('deleteSchedule explains the admin requirement on 403', async () => {
  await assert.rejects(
    deleteSchedule(7, { fetcher: async () => json({}, 403) }),
    (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /administrator/i);
      return true;
    },
  );
});

test('deleteSchedule reports a missing schedule on 404', async () => {
  await assert.rejects(
    deleteSchedule(7, { fetcher: async () => json({}, 404) }),
    (error) => {
      assert.equal(error.status, 404);
      assert.match(error.message, /no longer exists/i);
      return true;
    },
  );
});

test('deleteSchedule rejects an invalid id without a request', async () => {
  let called = false;
  await assert.rejects(
    deleteSchedule(0, {
      fetcher: async () => {
        called = true;
        return new Response(null, { status: 204 });
      },
    }),
    (error) => {
      assert.equal(error.code, 'INVALID_SCHEDULE');
      return true;
    },
  );
  assert.equal(called, false);
});
