import assert from 'node:assert/strict'
import test from 'node:test'
import { readStoredUsername } from '../src/auth/storedUser.ts'

test('reads the username from the existing shared-shell storage format', () => {
  assert.equal(readStoredUsername({ getItem(key) {
    assert.equal(key, 'auditsector:user')
    return JSON.stringify({ username: ' auditor ' })
  } }), 'auditor')
})

for (const raw of [null, 'bad JSON', 'null', '[]', '{}',
  '{"username":42}', '{"username":"  "}', '{"user_id":3}']) {
  test(`does not invent identity from ${raw}`, () => {
    assert.equal(readStoredUsername({ getItem: () => raw }), null)
  })
}

test('handles unavailable storage', () => {
  assert.equal(readStoredUsername({ getItem() { throw new Error('Unavailable') } }), null)
})
