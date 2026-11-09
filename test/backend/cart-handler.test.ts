import { describe, expect, it, vi } from 'vitest'
import { handleCart, type CartAdapter } from '../../supabase/functions/_shared/cart-handler.ts'
import { AdapterError, type CartResponse } from '../../supabase/functions/_shared/types.ts'

const ORIGIN = 'http://localhost:5173'
const env = {
  WERKSTATT_CODE: 'werkstatt-123',
  GOEGGEL_USER: 'goeggel-user',
  GOEGGEL_PASSWORD: 'goeggel-secret-pw',
  WEICHBERGER_USER: 'w-user',
  WEICHBERGER_PASSWORD: 'w-secret-pw',
  SEARCH_TIMEOUT_MS: '200',
}
const cartItem = {
  shopArticleId: '981016000095204',
  quantity: 4,
  width: 205,
  height: 55,
  rim: 16,
  description: '205/55HR16TL 91 H',
}
const validBody = { shop: 'goeggel', items: [cartItem] }

function request(body: unknown, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('http://localhost/functions/v1/cart', {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-werkstatt-code': 'werkstatt-123',
      ...headers,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

const ok: CartAdapter = async (items) =>
  items.map((i) => ({ shopArticleId: i.shopArticleId, ok: true, error: null }))

describe('handleCart', () => {
  it('answers the CORS preflight for an allowed origin', async () => {
    const res = await handleCart(request(null, {}, 'OPTIONS'), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('AC25: no or a wrong workshop code → 401, the shop is not contacted', async () => {
    const adapter = vi.fn(ok)
    for (const code of ['', 'falsch']) {
      const res = await handleCart(request(validBody, { 'x-werkstatt-code': code }), env, {
        adapters: { goeggel: adapter },
      })
      expect(res.status).toBe(401)
    }
    expect(adapter).not.toHaveBeenCalled()
  })

  it('hands the items and the shop credentials to the adapter and returns one result per item', async () => {
    const adapter = vi.fn(ok)
    const res = await handleCart(request(validBody), env, { adapters: { goeggel: adapter } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      shop: 'goeggel',
      results: [{ shopArticleId: '981016000095204', ok: true, error: null }],
      error: null,
    })
    expect(adapter).toHaveBeenCalledWith(
      [cartItem],
      expect.objectContaining({
        credentials: { user: 'goeggel-user', password: 'goeggel-secret-pw' },
      }),
    )
  })

  it.each([
    ['an unknown shop', { ...validBody, shop: 'amazon' }],
    ['no items', { ...validBody, items: [] }],
    ['more than 20 items', { ...validBody, items: Array.from({ length: 21 }, () => cartItem) }],
    ['a quantity of 0', { ...validBody, items: [{ ...cartItem, quantity: 0 }] }],
    ['a quantity above 20', { ...validBody, items: [{ ...cartItem, quantity: 21 }] }],
    ['a fractional quantity', { ...validBody, items: [{ ...cartItem, quantity: 2.5 }] }],
    [
      'an article id with other characters',
      { ...validBody, items: [{ ...cartItem, shopArticleId: '1&x=2' }] },
    ],
    ['a missing size', { ...validBody, items: [{ ...cartItem, width: undefined }] }],
    [
      'a too long description',
      { ...validBody, items: [{ ...cartItem, description: 'x'.repeat(201) }] },
    ],
    ['the same article twice', { ...validBody, items: [cartItem, cartItem] }],
    ['no JSON', 'kein json'],
  ])('rejects %s with 400 without contacting the shop', async (_what, body) => {
    const adapter = vi.fn(ok)
    const res = await handleCart(request(body), env, { adapters: { goeggel: adapter } })
    expect(res.status).toBe(400)
    expect(((await res.json()) as CartResponse).error?.code).toBe('BAD_REQUEST')
    expect(adapter).not.toHaveBeenCalled()
  })

  it('AC19: an adapter error for the whole shop comes back as error, without results', async () => {
    const adapter: CartAdapter = async () => {
      throw new AdapterError('AUTO_ORDER_ENABLED', 'Weichberger: Automatische Bestellung ist aktiv')
    }
    const res = await handleCart(request({ ...validBody, shop: 'weichberger' }), env, {
      adapters: { weichberger: adapter },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      shop: 'weichberger',
      results: [],
      error: {
        code: 'AUTO_ORDER_ENABLED',
        message: 'Weichberger: Automatische Bestellung ist aktiv',
      },
    })
  })

  it('an unexpected error does not leak details', async () => {
    const adapter: CartAdapter = async () => {
      throw new Error('goeggel-secret-pw in stack')
    }
    const res = await handleCart(request(validBody), env, { adapters: { goeggel: adapter } })
    const text = await res.text()
    expect(text).not.toContain('secret')
    expect((JSON.parse(text) as CartResponse).error?.code).toBe('UPSTREAM_ERROR')
  })

  it('AC24: a shop that does not answer in time → TIMEOUT', async () => {
    const adapter: CartAdapter = () => new Promise(() => {})
    const res = await handleCart(request(validBody), env, { adapters: { goeggel: adapter } })
    expect(((await res.json()) as CartResponse).error?.code).toBe('TIMEOUT')
  })

  it('only POST is allowed', async () => {
    const res = await handleCart(request(null, {}, 'GET'), env)
    expect(res.status).toBe(405)
  })

  it('a broken server configuration → 500 CONFIG_ERROR', async () => {
    const res = await handleCart(request(validBody), { ...env, WERKSTATT_CODE: '' })
    expect(res.status).toBe(500)
  })
})
