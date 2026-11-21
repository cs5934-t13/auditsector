import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archiveUser,
  createUser,
  fetchProfile,
  fetchUsers,
  restoreUser,
  updateProfile,
  updateUser,
  UsersApiError,
} from '../src/api/users.ts'

const stored = {
  user_id: 4,
  first_name: 'Avery',
  last_name: 'Smith',
  email: 'asmith@example.gov',
  username: 'asmith',
  user_role: 'ANALYST',
  user_status: 'ACTIVE',
  created_at: '2026-01-02T03:04:05',
  updated_at: '2026-01-02T03:04:05',
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

test('fetchUsers requests archived users too and unwraps the envelope', async () => {
  let calls = 0
  const users = await fetchUsers({ includeInactive: true }, {
    fetcher: async (path, options) => {
      calls++
      const url = new URL(path, 'http://localhost')
      assert.equal(url.pathname, '/api/user')
      assert.equal(url.searchParams.get('include_inactive'), 'true')
      assert.equal(options.method, 'GET')
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.headers.Accept, 'application/json')
      return json({ data: [stored] })
    },
  })

  assert.equal(calls, 1)
  assert.deepEqual(users, [stored])
})

test('fetchUsers omits the query when archived users are excluded', async () => {
  await fetchUsers({ includeInactive: false }, {
    fetcher: async (path) => {
      assert.equal(new URL(path, 'http://localhost').search, '')
      return json({ data: [] })
    },
  })
})

test('fetchUsers rejects a malformed list instead of rendering junk', async () => {
  for (const body of [
    {},
    { data: null },
    { data: [stored, { ...stored, user_role: 'SUPERUSER' }] },
    { data: [{ ...stored, user_id: '4' }] },
  ]) {
    await assert.rejects(fetchUsers({}, {
      fetcher: async () => json(body),
    }), (error) => error instanceof UsersApiError && error.code === 'UNEXPECTED_RESPONSE')
  }
})

test('createUser posts the payload and returns the stored record', async () => {
  const input = {
    first_name: 'Avery',
    last_name: 'Smith',
    email: 'asmith@example.gov',
    username: 'asmith',
    password: 'secret',
    user_role: 'ANALYST',
    user_status: 'ACTIVE',
  }

  const created = await createUser(input, {
    fetcher: async (path, options) => {
      assert.equal(path, '/api/user')
      assert.equal(options.method, 'POST')
      assert.equal(options.headers['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(options.body), input)
      return json({ data: stored }, 201)
    },
  })

  assert.deepEqual(created, stored)
})

test('createUser falls back to a fetch when only the id comes back', async () => {
  let reads = 0
  const created = await createUser({ username: 'asmith' }, {
    fetcher: async (path, options) => {
      if (options.method === 'POST') {
        return json({ data: { user_id: 4 } }, 201)
      }
      reads++
      assert.equal(path, '/api/user/4')
      return json({ data: stored })
    },
  })

  assert.equal(reads, 1)
  assert.deepEqual(created, stored)
})

test('createUser surfaces a duplicate-user conflict', async () => {
  await assert.rejects(createUser({ username: 'asmith' }, {
    fetcher: async () => json({
      error: { code: 'USER_ALREADY_EXISTS', message: 'That username is taken.' },
    }, 409),
  }), (error) => error instanceof UsersApiError
    && error.status === 409
    && error.code === 'USER_ALREADY_EXISTS'
    && error.message === 'That username is taken.')
})

test('updateUser keeps the id in the URL so it cannot be reassigned', async () => {
  const updated = await updateUser(4, {
    first_name: 'Avery',
    user_role: 'ADMIN',
  }, {
    fetcher: async (path, options) => {
      assert.equal(path, '/api/user/4')
      assert.equal(options.method, 'PUT')
      const body = JSON.parse(options.body)
      assert.deepEqual(body, { first_name: 'Avery', user_role: 'ADMIN' })
      assert.equal('user_id' in body, false)
      return json({ data: { ...stored, first_name: 'Avery', user_role: 'ADMIN' } })
    },
  })

  assert.equal(updated.first_name, 'Avery')
  assert.equal(updated.user_role, 'ADMIN')
  assert.equal(updated.user_id, 4)
})

test('archiveUser sends DELETE and does not claim the row is gone', async () => {
  let path = ''
  await archiveUser(4, {
    fetcher: async (requestPath, options) => {
      path = requestPath
      assert.equal(options.method, 'DELETE')
      return json({ data: { user_id: 4, user_status: 'INACTIVE' } })
    },
  })

  assert.equal(path, '/api/user/4')
})

test('restoreUser posts to the restore endpoint', async () => {
  let path = ''
  await restoreUser(4, {
    fetcher: async (requestPath, options) => {
      path = requestPath
      assert.equal(options.method, 'POST')
      return json({ data: { user_id: 4, user_status: 'ACTIVE' } })
    },
  })

  assert.equal(path, '/api/user/4/restore')
})

test('fetchProfile reads the signed-in user from /api/profile', async () => {
  const profile = await fetchProfile({
    fetcher: async (path) => {
      assert.equal(path, '/api/profile')
      return json({ data: stored })
    },
  })

  assert.deepEqual(profile, stored)
})

test('updateProfile sends the current password with a new one', async () => {
  const profile = await updateProfile({
    first_name: 'Avery',
    password: 'new-secret',
    current_password: 'old-secret',
  }, {
    fetcher: async (path, options) => {
      assert.equal(path, '/api/profile')
      assert.equal(options.method, 'PUT')
      assert.deepEqual(JSON.parse(options.body), {
        first_name: 'Avery',
        password: 'new-secret',
        current_password: 'old-secret',
      })
      return json({ data: stored })
    },
  })

  assert.deepEqual(profile, stored)
})

test('a rejected current password is surfaced verbatim', async () => {
  await assert.rejects(updateProfile({ current_password: 'wrong', password: 'x' }, {
    fetcher: async () => json({
      error: {
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'The current password is incorrect.',
      },
    }, 422),
  }), (error) => error.status === 422
    && error.code === 'INVALID_CURRENT_PASSWORD'
    && error.message === 'The current password is incorrect.')
})

test('a regular user editing someone else gets a clear 403 message', async () => {
  await assert.rejects(updateUser(9, { first_name: 'Nope' }, {
    fetcher: async () => json({}, 403),
  }), (error) => error.status === 403
    && error.message.includes('not allowed'))
})

test('an expired session is reported as such', async () => {
  await assert.rejects(fetchUsers({}, {
    fetcher: async () => json({ status: 'failed', reason: 'authentication required' }, 401),
  }), (error) => error.status === 401
    && error.message.includes('session has expired'))
})

test('a non-JSON error still yields the fallback message', async () => {
  await assert.rejects(fetchUsers({}, {
    fetcher: async () => new Response('<html>oops</html>', { status: 500 }),
  }), (error) => error.status === 500 && error.message.includes('could not be completed'))
})

test('network failures never look like success', async () => {
  await assert.rejects(updateUser(4, { first_name: 'X' }, {
    fetcher: async () => { throw new TypeError('offline') },
  }), (error) => error.code === 'NETWORK_ERROR' && error.message.includes('Could not reach'))
})
