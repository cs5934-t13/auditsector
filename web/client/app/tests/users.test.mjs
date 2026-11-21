import assert from 'node:assert/strict'
import test from 'node:test'
import {
  displayName,
  hasUserChanges,
  isManagedUser,
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
