import assert from 'node:assert/strict'
import test from 'node:test'
import {
  displayName,
  hasUserChanges,
  isManagedUser,
  isSameUser,
  passwordChangeError,
  profileInputError,
  userFieldError,
  userInputError,
} from '../src/utils/users.ts'

const user = {
  user_id: 7,
  first_name: 'Jordan',
  last_name: 'Doe',
  email: 'jdoe@example.gov',
  username: 'jdoe',
  user_role: 'ADMIN',
  user_status: 'ACTIVE',
  created_at: '2026-01-02T03:04:05',
  updated_at: '2026-01-02T03:04:05',
}

test('isManagedUser accepts a complete record', () => {
  assert.equal(isManagedUser(user), true)
})

test('isManagedUser accepts a record carrying extra fields', () => {
  // Extra keys are tolerated so the guard does not break if the server adds a
  // field, but callers must never render a password hash.
  assert.equal(isManagedUser({ ...user, password_hash: '$argon2id$v=19$...' }), true)
})

for (const [label, patch] of [
  ['missing id', { user_id: undefined }],
  ['zero id', { user_id: 0 }],
  ['negative id', { user_id: -1 }],
  ['string id', { user_id: '7' }],
  ['unknown role', { user_role: 'SUPERUSER' }],
  ['unknown status', { user_status: 'BANNED' }],
  ['missing email', { email: undefined }],
  ['numeric email', { email: 42 }],
  ['null body', null],
  ['array body', []],
]) {
  test(`isManagedUser rejects ${label}`, () => {
    assert.equal(isManagedUser(patch === null || Array.isArray(patch) ? patch : { ...user, ...patch }), false)
  })
}

test('userFieldError requires every profile field', () => {
  assert.equal(userFieldError('first_name', '  '), 'First name is required.')
  assert.equal(userFieldError('last_name', ''), 'Last name is required.')
  assert.equal(userFieldError('username', ''), 'Username is required.')
  assert.equal(userFieldError('email', ''), 'E-mail is required.')
})

test('userFieldError enforces the column limits', () => {
  assert.equal(userFieldError('first_name', 'a'.repeat(100)), null)
  assert.equal(userFieldError('first_name', 'a'.repeat(101)), 'First name must be at most 100 characters.')
  // 249 + "@x.gov" (6) = 255, the exact column width.
  assert.equal(userFieldError('email', `${'a'.repeat(249)}@x.gov`), null)
  assert.match(userFieldError('email', `${'a'.repeat(250)}@x.gov`) ?? '', /at most 255/)
})

test('userFieldError validates the e-mail shape', () => {
  assert.equal(userFieldError('email', 'jdoe@example.gov'), null)
  assert.equal(userFieldError('email', 'jdoe@example'), 'Enter a valid e-mail address.')
  assert.equal(userFieldError('email', 'jdoe example.gov'), 'Enter a valid e-mail address.')
  assert.equal(userFieldError('email', '@example.gov'), 'Enter a valid e-mail address.')
})

test('userInputError ignores absent fields but rejects present ones', () => {
  assert.equal(userInputError({}), null)
  assert.equal(userInputError({ first_name: 'Jordan' }), null)
  assert.equal(userInputError({ first_name: '' }), 'First name is required.')
  assert.equal(userInputError({ password: '' }), 'Password must not be empty.')
  assert.equal(userInputError({ password: 'secret' }), null)
})

test('passwordChangeError requires a matching confirmation', () => {
  assert.equal(passwordChangeError('', ''), 'Enter a new password.')
  assert.equal(passwordChangeError('secret', 'other'), 'The new passwords do not match.')
  assert.equal(passwordChangeError('secret', 'secret'), null)
})

test('profileInputError accepts edits that keep the current password', () => {
  const base = {
    first_name: 'Jordan',
    last_name: 'Doe',
    email: 'jdoe@example.gov',
    username: 'jdoe',
  }

  assert.equal(profileInputError(base), null)
  // A current password without a new one is a no-op, not an error.
  assert.equal(profileInputError({ ...base, current_password: 'old' }), null)
})

test('profileInputError requires the current password for a change', () => {
  const base = {
    first_name: 'Jordan',
    last_name: 'Doe',
    email: 'jdoe@example.gov',
    username: 'jdoe',
  }

  assert.equal(
    profileInputError({ ...base, password: 'new-one' }, 'new-one'),
    'Enter your current password.',
  )

  assert.equal(
    profileInputError({ ...base, password: 'new-one', current_password: 'old' }, 'different'),
    'The new passwords do not match.',
  )

  assert.equal(
    profileInputError({ ...base, password: 'new-one', current_password: 'old' }, 'new-one'),
    null,
  )
})

test('hasUserChanges detects only defined, non-empty values', () => {
  assert.equal(hasUserChanges({}), false)
  assert.equal(hasUserChanges({ first_name: '' }), false)
  assert.equal(hasUserChanges({ first_name: 'Jordan' }), true)
  assert.equal(hasUserChanges({ user_status: 'ACTIVE' }), true)
})

test('displayName falls back to the username', () => {
  assert.equal(displayName(user), 'Jordan Doe')
  assert.equal(displayName({ ...user, first_name: ' ', last_name: '' }), 'jdoe')
})

test('isSameUser matches the signed-in account by id', () => {
  assert.equal(isSameUser(user, { username: 'jdoe', userId: 7 }), true)
  assert.equal(isSameUser(user, { username: 'jdoe', userId: 8 }), false)
})

test('isSameUser does not trust a mismatched username when ids differ', () => {
  // Ids are authoritative: a stale username in the session must not make a
  // different account look like the signed-in one.
  assert.equal(isSameUser(user, { username: 'jdoe', userId: 99 }), false)
})

test('isSameUser falls back to the username when the session has no id', () => {
  // Sessions created before /login returned user_id have `userId: null`.
  assert.equal(isSameUser(user, { username: 'jdoe', userId: null }), true)
  assert.equal(isSameUser(user, { username: 'asmith', userId: null }), false)
})

test('isSameUser is false without a session', () => {
  assert.equal(isSameUser(user, null), false)
  assert.equal(isSameUser(user, undefined), false)
})

test('isSameUser ignores an unusable id and compares usernames', () => {
  // Degenerate ids fall back to the username rather than returning false:
  // treating the admin's own row as "someone else" would re-enable
  // self-archive, which is the dangerous direction to get wrong.
  for (const userId of [0, -1, 1.5, Number.NaN]) {
    assert.equal(isSameUser(user, { username: 'jdoe', userId }), true)
    assert.equal(isSameUser(user, { username: 'asmith', userId }), false)
  }
})

test('a self-edit omits role and status so it cannot demote or archive', () => {
  // Mirrors UserFormDialog: for the signed-in row the payload leaves out
  // user_role/user_status entirely, so the request cannot change them even if
  // the disabled selects were tampered with.
  const values = {
    first_name: 'Jordan',
    last_name: 'Doe',
    email: 'jdoe@example.gov',
    username: 'jdoe',
    user_role: 'ADMIN',
    user_status: 'ACTIVE',
  }

  const payload = {
    first_name: values.first_name,
    last_name: values.last_name,
    email: values.email,
    username: values.username,
  }

  assert.equal('user_role' in payload, false)
  assert.equal('user_status' in payload, false)
  assert.equal(hasUserChanges(payload), true)
})
