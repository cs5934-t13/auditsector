import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUN_STATUSES,
  isRunInProgress,
  isRunStatus,
  normalizeRunStatus,
} from '../src/utils/runStatus.ts';
import { isStoredDateTime } from '../src/utils/storedDateTime.ts';

test('RUN_STATUSES matches the database enum in workflow order', () => {
  assert.deepEqual(RUN_STATUSES, ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
});

test('isRunStatus accepts only exact enum values', () => {
  for (const value of RUN_STATUSES) assert.equal(isRunStatus(value), true);
  for (const value of ['completed', 'DONE', '', ' PENDING', null, undefined, 1, {}]) {
    assert.equal(isRunStatus(value), false);
  }
});

test('normalizeRunStatus accepts either casing and rejects unknown text', () => {
  assert.equal(normalizeRunStatus('completed'), 'COMPLETED');
  assert.equal(normalizeRunStatus('  Running '), 'RUNNING');
  assert.equal(normalizeRunStatus('DONE'), null);
  assert.equal(normalizeRunStatus(''), null);
  assert.equal(normalizeRunStatus(null), null);
  assert.equal(normalizeRunStatus(42), null);
});

test('isRunInProgress covers the unfinished states only', () => {
  assert.equal(isRunInProgress('PENDING'), true);
  assert.equal(isRunInProgress('RUNNING'), true);
  assert.equal(isRunInProgress('COMPLETED'), false);
  assert.equal(isRunInProgress('FAILED'), false);
});

test('isStoredDateTime accepts stored MySQL datetimes', () => {
  assert.equal(isStoredDateTime('2026-09-15T00:00:00'), true);
  assert.equal(isStoredDateTime('2026-09-30T14:25:00'), true);
  assert.equal(isStoredDateTime('2024-02-29T23:59:59'), true);
});

test('isStoredDateTime rejects wrong shapes and impossible values', () => {
  for (const value of [
    '2026-09-15',
    '2026-09-15T00:00:00Z',
    '2026-09-15 00:00:00',
    '2026-02-30T00:00:00',
    '2026-13-01T00:00:00',
    '2026-09-15T25:00:00',
    '2026-09-15T00:60:00',
    '',
    null,
    undefined,
    20260915,
  ]) {
    assert.equal(isStoredDateTime(value), false, `expected ${String(value)} to be rejected`);
  }
});
