import { describe, expect, it, vi } from 'vitest'
import type { CartItem, SearchQuery } from '../supabase/functions/_shared/types.ts'
import { createCart, createSearch, UnauthorizedError } from './api.ts'
import { errorMessage, formatEuro } from './messages.ts'

const query: SearchQuery = { width: 205, height: 55, rim: 16, quantity: 4, seasons: [], brands: [] }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createSearch', () => {
  it('posts shop and query with the workshop code', async () => {
    const fetchFn = vi.fn(async () => json({ shop: 'goeggel', offers: [], error: null }))
    const search = createSearch(
      'https://api.example/functions/v1',
      fetchFn as unknown as typeof fetch,
    )
    const res = await search('goeggel', query, 'abc')
    expect(res).toEqual({ shop: 'goeggel', offers: [], error: null })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/functions/v1/search')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('x-werkstatt-code')).toBe('abc')
    expect(JSON.parse(String(init.body))).toEqual({ shop: 'goeggel', query })
  })

  it('AC25: rejects with UnauthorizedError on 401', async () => {
    const search = createSearch('x', (async () => json({}, 401)) as typeof fetch)
    await expect(search('goeggel', query, 'bad')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('turns network failures into an error result', async () => {
    const search = createSearch('x', (async () => {
      throw new TypeError('offline')
    }) as typeof fetch)
    expect(await search('weichberger', query, 'abc')).toEqual({
      shop: 'weichberger',
      offers: [],
      error: { code: 'UPSTREAM_ERROR', message: 'Server nicht erreichbar' },
    })
  })

  it('turns non-JSON answers into an error result', async () => {
    const search = createSearch(
      'x',
      (async () => new Response('<html>502</html>', { status: 502 })) as typeof fetch,
    )
    expect((await search('goeggel', query, 'abc')).error?.code).toBe('UPSTREAM_ERROR')
  })
})

describe('createCart', () => {
  const items: CartItem[] = [
    { shopArticleId: '4711', quantity: 4, width: 205, height: 55, rim: 16, description: 'x' },
  ]

  it('posts shop and items with the workshop code', async () => {
    const answer = {
      shop: 'weichberger',
      results: [{ shopArticleId: '4711', ok: true, error: null }],
      error: null,
    }
    const fetchFn = vi.fn(async () => json(answer))
    const cart = createCart('https://api.example/functions/v1/', fetchFn as unknown as typeof fetch)
    expect(await cart('weichberger', items, 'abc')).toEqual(answer)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/functions/v1/cart')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('x-werkstatt-code')).toBe('abc')
    expect(JSON.parse(String(init.body))).toEqual({ shop: 'weichberger', items })
  })

  it('AC25: rejects with UnauthorizedError on 401', async () => {
    const cart = createCart('x', (async () => json({}, 401)) as typeof fetch)
    await expect(cart('goeggel', items, 'bad')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it.each([
    ['network failures', async () => Promise.reject(new TypeError('offline'))],
    ['non-JSON answers', async () => new Response('<html>502</html>', { status: 502 })],
  ])('turns %s into an error for the whole shop', async (_what, respond) => {
    const cart = createCart('x', respond as unknown as typeof fetch)
    expect(await cart('goeggel', items, 'abc')).toEqual({
      shop: 'goeggel',
      results: [],
      error: { code: 'UPSTREAM_ERROR', message: 'Server nicht erreichbar' },
    })
  })
})

describe('errorMessage (AC22–AC24)', () => {
  it.each([
    ['weichberger', 'LOGIN_FAILED', 'Weichberger: Anmeldung fehlgeschlagen – Zugangsdaten prüfen'],
    ['goeggel', 'LAYOUT_CHANGED', 'Göggel: Shop-Seite hat sich geändert – Adapter prüfen'],
    ['goeggel', 'TIMEOUT', 'Göggel: Shop antwortet nicht'],
    ['weichberger', 'BLOCKED', 'Weichberger: Shop blockiert Anfragen'],
    ['goeggel', 'SESSION_EXPIRED', 'Göggel: Sitzung abgelaufen – bitte erneut suchen'],
    ['goeggel', 'CONFIG_ERROR', 'Göggel: Server-Konfiguration fehlerhaft'],
    ['weichberger', 'UPSTREAM_ERROR', 'Weichberger: Shop nicht erreichbar oder Fehler beim Abruf'],
  ] as const)('%s %s', (shop, code, text) => {
    expect(errorMessage(shop, code)).toBe(text)
  })
})

describe('formatEuro', () => {
  it('formats cents as Austrian euro amount', () => {
    expect(formatEuro(10700).replace(/\s/g, ' ')).toBe('€ 107,00')
    expect(formatEuro(123456).replace(/\s/g, ' ')).toBe('€ 1.234,56')
  })
})
