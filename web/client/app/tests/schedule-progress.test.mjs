/**
 * Progress-label tests.
 *
 * These load `content/schedules.ts` through a temp probe because that module
 * imports `../utils/formatDate` without an extension, which Node's ESM resolver
 * rejects. The probe keeps the test asserting real behaviour rather than a copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const clientRoot = path.resolve(path.dirname(here), '..');

const PROBE = `
import { runProgressLabel, runProgressPercent } from './src/content/schedules.ts';

const cases = {
  idle: { is_running: false, run_total: 360, run_downloaded: 0, run_processed: 0 },
  discovering: { is_running: true, run_total: null, run_downloaded: 0, run_processed: 0 },
  discovering_with_files: { is_running: true, run_total: null, run_downloaded: 7, run_processed: 0 },
  downloading_start: { is_running: true, run_total: 360, run_downloaded: 0, run_processed: 0 },
  downloading: { is_running: true, run_total: 360, run_downloaded: 111, run_processed: 0 },
  processing: { is_running: true, run_total: 360, run_downloaded: 360, run_processed: 41 },
  done: { is_running: true, run_total: 360, run_downloaded: 360, run_processed: 360 },
};

const out = {};
for (const [name, value] of Object.entries(cases)) {
  out[name] = { label: runProgressLabel(value), percent: runProgressPercent(value) };
}
console.log(JSON.stringify(out));
`;

function runProbe() {
  const probePath = path.join(clientRoot, 'progressprobe.mjs');
  fs.writeFileSync(probePath, PROBE);
  try {
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', probePath],
      { cwd: clientRoot, encoding: 'utf8' },
    );
    return JSON.parse(output.trim());
  } finally {
    fs.rmSync(probePath, { force: true });
  }
}

const result = runProbe();

test('an idle schedule shows no progress', () => {
  assert.equal(result.idle.label, null);
  assert.equal(result.idle.percent, null);
});

test('before the index is parsed the phase is "finding"', () => {
  assert.equal(result.discovering.label, 'Finding reports…');
  assert.equal(result.discovering.percent, null);
});

test('finding still counts files once any have landed', () => {
  assert.equal(result.discovering_with_files.label, 'Finding reports… 7 downloaded');
});

test('zero downloads is not shown as "0 of N"', () => {
  // The regression: a 360-file archive spent an hour reading "0 of 360", which
  // looks stuck rather than busy. The count is real but not yet meaningful.
  assert.equal(result.downloading_start.label, 'Downloading reports…');
  assert.doesNotMatch(result.downloading_start.label, /0 of/);
  // Nothing is known, so no percentage is claimed either.
  assert.equal(result.downloading_start.percent, 0);
});

test('a moving download count is shown with the total', () => {
  assert.equal(result.downloading.label, 'Downloading reports… 111 of 360');
});

test('processing is reported only after everything is downloaded', () => {
  assert.equal(result.processing.label, 'Processing reports… 41 of 360');
});

test('the percentage follows downloads then processing', () => {
  // Downloads lead: 111/360 while downloading, not 0% from `processed`.
  assert.equal(result.downloading.percent, 31);
  assert.equal(result.processing.percent, 100);
  assert.equal(result.done.percent, 100);
});
