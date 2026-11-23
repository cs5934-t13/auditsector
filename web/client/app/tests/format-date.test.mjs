import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Time-zone tests must run in a child process.
 *
 * `Intl` reads the process time zone once, so assigning `process.env.TZ` mid-run
 * has no effect on an already-started process. Each case below therefore runs
 * this same file with `TZ` set, and the parent only asserts on the printed
 * result — which is also what a browser in that zone would render.
 */
const here = fileURLToPath(import.meta.url);
const clientRoot = path.resolve(path.dirname(here), '..');

const PROBE = `
import {
  formatStoredDate,
  formatStoredDateTime,
  formatStoredDateTimeShort,
  formatDate,
} from './src/utils/formatDate.ts';

console.log(JSON.stringify({
  short: formatStoredDateTimeShort('2026-11-23T16:15:00'),
  long: formatStoredDateTime('2026-11-23T16:15:00'),
  calendar: formatStoredDate('2026-11-23T23:30:00'),
  bareDate: formatDate('2026-11-23'),
  invalidShort: formatStoredDateTimeShort('not-a-date'),
  invalidLong: formatStoredDateTime('2026-13-45T99:99:99'),
}));
`;

function renderIn(zone) {
  // A temp file inside the app root, so `./src/...` resolves the same way the
  // real modules import each other. `--eval` does not resolve relative
  // specifiers against the working directory.
  const probePath = path.join(clientRoot, `tzprobe-${zone.replace('/', '-')}.mjs`);
  fs.writeFileSync(probePath, PROBE);
  try {
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', probePath],
      { cwd: clientRoot, env: { ...process.env, TZ: zone }, encoding: 'utf8' },
    );
    return JSON.parse(output.trim());
  } finally {
    fs.rmSync(probePath, { force: true });
  }
}

const CHICAGO = renderIn('America/Chicago');
const UTC = renderIn('UTC');
const LOS_ANGELES = renderIn('America/Los_Angeles');
const TOKYO = renderIn('Asia/Tokyo');

test('a stored instant is converted into the viewer’s zone', () => {
  // 16:15 UTC is 10:15 in Chicago (CST, UTC-6 in November).
  assert.match(CHICAGO.short, /10:15/);
  assert.doesNotMatch(CHICAGO.short, /16:15/);
});

test('the same instant renders as stored when the viewer is on UTC', () => {
  // Rendered as a 12-hour clock: 16:15 UTC reads "4:15 PM", still the same time.
  assert.match(UTC.short, /4:15\s*PM/);
});
test('an eastern viewer sees the next day for a late-evening UTC instant', () => {
  assert.match(TOKYO.short, /1:15\s*AM/);
});

test('the long form names the zone so the time is unambiguous', () => {
  assert.match(CHICAGO.long, /10:15/);
  // A zone abbreviation, e.g. "CST"; the exact label is ICU's choice.
  assert.match(CHICAGO.long, /[A-Z]{2,5}T\b/);
});

test('a stored calendar date is never shifted by the viewer’s zone', () => {
  // 23:30 UTC would be the previous day in Los Angeles if it were converted.
  assert.match(LOS_ANGELES.calendar, /Nov 23, 2026/);
  // 00:30-style instants must not roll forward in Tokyo either.
  assert.match(TOKYO.calendar, /Nov 23, 2026/);
});

test('a bare date is stable in every zone', () => {
  for (const [zone, result] of Object.entries({ CHICAGO, UTC, LOS_ANGELES, TOKYO })) {
    assert.match(result.bareDate, /Nov 23, 2026/, zone);
  }
});

test('an unparseable value is returned unchanged rather than mis-rendered', () => {
  assert.equal(UTC.invalidShort, 'not-a-date');
  assert.equal(UTC.invalidLong, '2026-13-45T99:99:99');
});
