import { describe, expect, it } from 'vitest'
import { supabaseEanCache } from '../../supabase/functions/_shared/ean-cache-supabase.ts'

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }

function recorder(respond: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchFn: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    return respond(url, init)
  }
  return { fetchFn, calls }
}

describe('supabaseEanCache (AC46)', () => {
  it('reads the EANs of the asked article numbers from goeggel_ean with the service key', async () => {
    const { fetchFn, calls } = recorder(() =>
      Response.json([{ article_id: '981016000095204', ean: '8808956238469' }]),
    )
    const known = await supabaseEanCache(ENV, fetchFn)!.get(['981016000095204', '123'])
    expect([...known]).toEqual([['981016000095204', '8808956238469']])
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe('/rest/v1/goeggel_ean')
    expect(calls[0].url.searchParams.get('article_id')).toBe('in.("981016000095204","123")')
    expect(calls[0].url.searchParams.get('select')).toBe('article_id,ean')
    expect(new Headers(calls[0].init.headers).get('apikey')).toBe('service-key')
  })

  it('never puts an unexpected article number into the request and drops invalid rows', async () => {
    const { fetchFn, calls } = recorder(() =>
      Response.json([
        { article_id: '1', ean: 'not-an-ean' },
        { article_id: '2', ean: '4019238817515' },
      ]),
    )
    const known = await supabaseEanCache(ENV, fetchFn)!.get(['1', '2', '3")or(1=1', ''])
    expect(calls[0].url.searchParams.get('article_id')).toBe('in.("1","2")')
    expect([...known]).toEqual([['2', '4019238817515']])
  })

  it('sends no request for nothing to read or to store', async () => {
    const { fetchFn, calls } = recorder(() => Response.json([]))
    const cache = supabaseEanCache(ENV, fetchFn)!
    expect((await cache.get([])).size).toBe(0)
    expect((await cache.get(['x y'])).size).toBe(0)
    await cache.put(new Map())
    expect(calls).toEqual([])
  })

  it('upserts new EANs', async () => {
    const { fetchFn, calls } = recorder(() => new Response(null, { status: 201 }))
    await supabaseEanCache(ENV, fetchFn)!.put(new Map([['981016000095204', '8808956238469']]))
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe('/rest/v1/goeggel_ean')
    expect(new Headers(calls[0].init.headers).get('prefer')).toContain(
      'resolution=merge-duplicates',
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual([
      { article_id: '981016000095204', ean: '8808956238469' },
    ])
  })

  it('throws on HTTP errors; without Supabase configuration there is no cache', async () => {
    const { fetchFn } = recorder(() => new Response('x', { status: 500 }))
    const cache = supabaseEanCache(ENV, fetchFn)!
    await expect(cache.get(['1'])).rejects.toThrow()
    await expect(cache.put(new Map([['1', '4019238817515']]))).rejects.toThrow()
    expect(supabaseEanCache({}, fetchFn)).toBeNull()
  })
})
