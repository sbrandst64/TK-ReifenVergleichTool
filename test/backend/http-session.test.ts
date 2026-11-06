import { describe, expect, it } from 'vitest'
import { ShopSession } from '../../supabase/functions/_shared/http-session.ts'
import { AdapterError } from '../../supabase/functions/_shared/types.ts'
import { fakeFetch, htmlResponse, redirectResponse } from '../helpers/fake-fetch.ts'

const BASE = 'https://shop.example'
const allowAll = () => true

function session(
  fetchFn: typeof fetch,
  isAllowed: (u: URL) => boolean = allowAll,
  timeoutMs = 2000,
) {
  return new ShopSession({ baseUrl: BASE, isAllowed, fetchFn, timeoutMs })
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof AdapterError) return e.code
    throw e
  }
  return 'NO_ERROR'
}

describe('ShopSession', () => {
  it('stores cookies and sends them on later requests', async () => {
    const { fetchFn, calls } = fakeFetch([
      {
        path: '/a',
        respond: () => htmlResponse('a', { cookies: ['sid=1; path=/; HttpOnly', 'x=2'] }),
      },
      { path: '/b', respond: () => htmlResponse('b') },
    ])
    const s = session(fetchFn)
    await s.get('/a')
    await s.get('/b')
    expect(calls[1].cookie).toBe('sid=1; x=2')
    expect(s.cookie('sid')).toBe('1')
  })

  it('deletes cookies with Max-Age=0 or a past expiry', async () => {
    const { fetchFn } = fakeFetch([
      { path: '/a', respond: () => htmlResponse('a', { cookies: ['sid=1', 'old=1'] }) },
      {
        path: '/b',
        respond: () =>
          htmlResponse('b', {
            cookies: ['sid=; Max-Age=0', 'old=1; expires=Thu, 01 Jan 1970 00:00:01 GMT'],
          }),
      },
    ])
    const s = session(fetchFn)
    await s.get('/a')
    await s.get('/b')
    expect(s.cookie('sid')).toBeUndefined()
    expect(s.cookie('old')).toBeUndefined()
  })

  it('follows redirects (POST → GET) and keeps cookies of every hop', async () => {
    const { fetchFn, calls } = fakeFetch([
      { method: 'POST', path: '/login', respond: () => redirectResponse('/step', ['auth=t']) },
      { path: '/step', respond: () => redirectResponse(`${BASE}/home`, ['more=1']) },
      { path: '/home', respond: (c) => htmlResponse(`cookie:${c.cookie}`) },
    ])
    const s = session(fetchFn)
    const r = await s.post('/login', { user: 'u' })
    expect(r.url).toBe(`${BASE}/home`)
    expect(r.text).toBe('cookie:auth=t; more=1')
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET'])
    expect(calls[0].form.get('user')).toBe('u')
    expect(calls[0].headers.get('content-type')).toContain('application/x-www-form-urlencoded')
  })

  it('can return a redirect without following it', async () => {
    const { fetchFn } = fakeFetch([{ path: '/r', respond: () => redirectResponse('/x') }])
    const r = await session(fetchFn).get('/r', { followRedirects: false })
    expect(r.status).toBe(302)
  })

  it('marks XHR requests', async () => {
    const { fetchFn, calls } = fakeFetch([
      { method: 'POST', path: '/ajax', respond: () => htmlResponse('{}') },
    ])
    await session(fetchFn).post('/ajax', { func: 'x' }, { xhr: true })
    expect(calls[0].headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('AC21: refuses a non-allowed endpoint without contacting the shop', async () => {
    const { fetchFn, calls } = fakeFetch([
      { path: '/checkout', respond: () => htmlResponse('ordered') },
    ])
    const s = session(fetchFn, (u) => u.pathname !== '/checkout')
    expect(await codeOf(s.get('/checkout'))).toBe('FORBIDDEN_ENDPOINT')
    expect(calls).toHaveLength(0)
  })

  it('refuses a redirect to a non-allowed endpoint', async () => {
    const { fetchFn, calls } = fakeFetch([
      { path: '/ok', respond: () => redirectResponse('/checkout') },
      { path: '/checkout', respond: () => htmlResponse('ordered') },
    ])
    const s = session(fetchFn, (u) => u.pathname !== '/checkout')
    expect(await codeOf(s.get('/ok'))).toBe('FORBIDDEN_ENDPOINT')
    expect(calls).toHaveLength(1)
  })

  it('refuses redirects to another host', async () => {
    const { fetchFn } = fakeFetch([
      { path: '/ok', respond: () => redirectResponse('https://evil.example/x') },
    ])
    expect(await codeOf(session(fetchFn).get('/ok'))).toBe('FORBIDDEN_ENDPOINT')
  })

  it.each([
    [403, 'BLOCKED'],
    [429, 'BLOCKED'],
    [500, 'UPSTREAM_ERROR'],
    [404, 'UPSTREAM_ERROR'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { fetchFn } = fakeFetch([{ path: '/x', respond: () => htmlResponse('no', { status }) }])
    expect(await codeOf(session(fetchFn).get('/x'))).toBe(code)
  })

  it('maps network errors to UPSTREAM_ERROR', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    expect(await codeOf(session(failing).get('/x'))).toBe('UPSTREAM_ERROR')
  })

  it('maps a hanging request to TIMEOUT', async () => {
    const hanging = ((_i: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })) as typeof fetch
    expect(await codeOf(session(hanging, allowAll, 20).get('/x'))).toBe('TIMEOUT')
  })

  it('decodes ISO-8859-1 responses', async () => {
    const latin1 = new Uint8Array([0x47, 0xf6, 0x67, 0x67, 0x65, 0x6c]) // "Göggel"
    const { fetchFn } = fakeFetch([
      {
        path: '/l',
        respond: () =>
          new Response(latin1, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }),
      },
    ])
    expect((await session(fetchFn).get('/l')).text).toBe('Göggel')
  })
})
