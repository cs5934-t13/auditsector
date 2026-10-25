import assert from 'node:assert/strict'
import test from 'node:test'
import { getSourceUrlError } from '../src/components/sourceUrl.ts'

for (const value of ['', '   ', 'hello', 'example.com', 'ftp://example.com',
  'javascript:alert(1)', 'https:example.com', 'https://', 'https://bad host.com']) {
  test(`rejects ${JSON.stringify(value)}`, () => {
    assert.notEqual(getSourceUrlError(value), '')
  })
}

for (const value of ['http://example.com', 'https://example.com/report.pdf?year=2026#page=1',
  '  https://example.com  ', 'HTTPS://EXAMPLE.COM']) {
  test(`accepts ${JSON.stringify(value)}`, () => {
    assert.equal(getSourceUrlError(value), '')
  })
}
