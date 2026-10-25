import assert from 'node:assert/strict'
import test from 'node:test'
import { createSource, SourceApiError } from '../src/api/sources.ts'

const source = {
  schedule_id: 17,
  created_by: 3,
  source_link: 'https://example.com/audit.pdf',
  scan_frequency: 'WEEKLY',
}
const input = { user: 'auditor', sourceUrl: source.source_link }
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

test('POST uses encoded query parameters and the backend frequency default', async () => {
  const user = 'auditor+team & council'
  const url = 'https://example.com/audit.pdf?year=2026&tag=IT#page=2'
  let calls = 0
  const result = await createSource({ user: `  ${user}  `, sourceUrl: ` ${url} ` }, {
    fetcher: async (path, options) => {
      calls++
      const requestUrl = new URL(path, 'http://localhost')
      assert.equal(requestUrl.pathname, '/api/sources')
      assert.equal(requestUrl.searchParams.get('user'), user)
      assert.equal(requestUrl.searchParams.get('source'), url)
      assert.deepEqual([...requestUrl.searchParams.keys()], ['user', 'source'])
      assert.equal(options.method, 'POST')
      assert.equal(options.body, undefined)
      assert.equal(options.credentials, 'same-origin')
      assert.equal(options.headers.Accept, 'application/json')
      assert.ok(options.signal instanceof AbortSignal)
      return json({ data: [{ ...source, source_link: url }] })
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.source_link, url)
})

for (const status of [200, 201]) {
  test(`accepts a complete saved-source record with status ${status}`, async () => {
    assert.deepEqual(await createSource(input, {
      fetcher: async () => json({ data: [source] }, status),
    }), source)
  })
}

for (const invalid of [
  { user: '', sourceUrl: source.source_link },
  { user: '   ', sourceUrl: source.source_link },
  { user: 'auditor', sourceUrl: 'hello' },
  { user: 'auditor', sourceUrl: 'ftp://example.com' },
]) {
  test(`does not send invalid input ${JSON.stringify(invalid)}`, async () => {
    let called = false
    await assert.rejects(createSource(invalid, {
      fetcher: async () => { called = true; return json({ data: [source] }) },
    }), SourceApiError)
    assert.equal(called, false)
  })
}

test('preserves structured server validation errors', async () => {
  await assert.rejects(createSource(input, {
    fetcher: async () => json({ error: {
      code: 'INVALID_SOURCE', message: 'This source URL is not supported.',
    } }, 400),
  }), (error) => error instanceof SourceApiError && error.status === 400
    && error.code === 'INVALID_SOURCE' && error.message === 'This source URL is not supported.')
})

for (const [status, message] of [
  [404, 'endpoint is not available'],
  [401, 'not authorized'],
  [403, 'not authorized'],
  [500, 'could not be saved'],
]) {
  test(`handles a non-JSON error response with status ${status}`, async () => {
    await assert.rejects(createSource(input, {
      fetcher: async () => new Response('<html>Error</html>', { status }),
    }), (error) => error.status === status && error.message.includes(message))
  })
}

for (const body of [
  {}, { data: [] }, { data: [source, source] },
  { data: [{ schedule_id: 1 }] },
  { data: [{ ...source, schedule_id: 0 }] },
  { data: [{ ...source, created_by: '3' }] },
]) {
  test(`does not claim success for malformed data ${JSON.stringify(body)}`, async () => {
    await assert.rejects(createSource(input, {
      fetcher: async () => json(body),
    }), (error) => error.code === 'UNEXPECTED_RESPONSE'
      && error.message.includes('may have been saved'))
  })
}

test('does not claim success for non-JSON success', async () => {
  await assert.rejects(createSource(input, {
    fetcher: async () => new Response('<html>OK</html>', { status: 200 }),
  }), (error) => error.code === 'UNEXPECTED_RESPONSE')
})

test('does not claim success for an empty 204 response', async () => {
  await assert.rejects(createSource(input, {
    fetcher: async () => new Response(null, { status: 204 }),
  }), (error) => error.code === 'UNEXPECTED_RESPONSE')
})

test('network failure reports that saving could not be confirmed', async () => {
  await assert.rejects(createSource(input, {
    fetcher: async () => { throw new TypeError('Failed to fetch') },
  }), /could not be confirmed/)
})

test('a slow request times out without claiming the source was not saved', async () => {
  await assert.rejects(createSource(input, {
    timeoutMs: 5,
    fetcher: async (_path, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(json({ data: [source] })), 100)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason)
      }, { once: true })
    }),
  }), /timed out.*could not be confirmed/)
})

test('a cancelled request does not claim success', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(createSource(input, {
    signal: controller.signal,
    fetcher: async (_path, { signal }) => { throw signal.reason },
  }), /cancelled.*could not be confirmed/)
})
