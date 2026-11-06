import { describe, expect, it, vi } from 'vitest'
import { handleSearch, type ShopAdapter } from '../../supabase/functions/_shared/search-handler.ts'
import { AdapterError, type SearchResponse, type ShopOffer } from '../../supabase/functions/_shared/types.ts'

const ORIGIN = 'http://localhost:5173'
const env = {
  WERKSTATT_CODE: 'werkstatt-123',
  GOEGGEL_USER: 'goeggel-user',
  GOEGGEL_PASSWORD: 'goeggel-secret-pw',
  WEICHBERGER_USER: 'w-user',
  WEICHBERGER_PASSWORD: 'w-secret-pw',
  SEARCH_TIMEOUT_MS: '200',
}
const validBody = {
  shop: 'goeggel',
  query: { width: 205, height: 55, rim: 16, quantity: 4, seasons: ['sommer'], brands: ['KUMHO'] },
}

const shopOffer: ShopOffer = {
  shop: 'goeggel',
  shopArticleId: '981016000095204',
  ean: '8808956238469',
  brand: 'KUMHO',
  profile: 'ES31',
  width: 205,
  height: 55,
  rim: 16,
  loadIndex: '91',
  speedIndex: 'H',
  description: '205/55HR16TL',
  stockImmediate: 184,
  stockTotal: 184,
  deliveryNote: 'sofort',
  season: 'sommer',
  netEkCents: 5014,
}

function request(body: unknown, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('http://localhost/functions/v1/search', {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-werkstatt-code': 'werkstatt-123', ...headers },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

const ok: ShopAdapter = async () => [shopOffer]

describe('handleSearch', () => {
  it('answers the CORS preflight for an allowed origin', async () => {
    const res = await handleSearch(request(null, {}, 'OPTIONS'), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-headers')).toContain('x-werkstatt-code')
  })

  it('does not grant CORS to unknown origins', async () => {
    const res = await handleSearch(request(validBody, { origin: 'https://evil.example' }), env, {
      adapters: { goeggel: ok },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('AC25: missing or wrong workshop code → 401 without data', async () => {
    const adapter = vi.fn(ok)
    for (const code of ['', 'falsch']) {
      const res = await handleSearch(request(validBody, { 'x-werkstatt-code': code }), env, {
        adapters: { goeggel: adapter },
      })
      expect(res.status).toBe(401)
      const body = (await res.json()) as SearchResponse
      expect(body.offers).toEqual([])
      expect(body.error?.code).toBe('UNAUTHORIZED')
    }
    expect(adapter).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown shop', { ...validBody, shop: 'amazon' }],
    ['width out of range', { ...validBody, query: { ...validBody.query, width: 9 } }],
    ['quantity 0', { ...validBody, query: { ...validBody.query, quantity: 0 } }],
    ['unknown season', { ...validBody, query: { ...validBody.query, seasons: ['herbst'] } }],
    ['brand with odd characters', { ...validBody, query: { ...validBody.query, brands: ['<script>'] } }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await handleSearch(request(body), env, { adapters: { goeggel: ok } })
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON with 400', async () => {
    const req = new Request('http://localhost/functions/v1/search', {
      method: 'POST',
      headers: { origin: ORIGIN, 'x-werkstatt-code': 'werkstatt-123' },
      body: '{nope',
    })
    expect((await handleSearch(req, env)).status).toBe(400)
  })

  it('runs the shop adapter with its credentials and returns priced offers', async () => {
    const adapter = vi.fn(ok)
    const res = await handleSearch(request(validBody), env, { adapters: { goeggel: adapter } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const body = (await res.json()) as SearchResponse
    expect(body.error).toBeNull()
    expect(body.offers).toHaveLength(1)
    expect(body.offers[0].priceGrossCents).toBe(10700)
    expect(adapter.mock.calls[0][0]).toEqual(validBody.query)
    expect(adapter.mock.calls[0][1]).toMatchObject({
      credentials: { user: 'goeggel-user', password: 'goeggel-secret-pw' },
      maxOffers: 20,
    })
  })

  it('AC26: the response contains neither purchase prices nor credentials', async () => {
    const res = await handleSearch(request(validBody), env, { adapters: { goeggel: ok } })
    const text = await res.text()
    expect(text).not.toContain('netEkCents')
    expect(text).not.toContain('5014')
    for (const secret of ['goeggel-secret-pw', 'goeggel-user', 'werkstatt-123']) expect(text).not.toContain(secret)
  })

  it('AC22: adapter errors are returned with their code', async () => {
    const failing: ShopAdapter = async () => {
      throw new AdapterError('LOGIN_FAILED', 'Anmeldung fehlgeschlagen')
    }
    const res = await handleSearch(request(validBody), env, { adapters: { goeggel: failing } })
    const body = (await res.json()) as SearchResponse
    expect(res.status).toBe(200)
    expect(body.error).toEqual({ code: 'LOGIN_FAILED', message: 'Anmeldung fehlgeschlagen' })
  })

  it('AC24: a hanging adapter → TIMEOUT', async () => {
    const hanging: ShopAdapter = () => new Promise(() => {})
    const res = await handleSearch(request(validBody), env, { adapters: { goeggel: hanging } })
    expect(((await res.json()) as SearchResponse).error?.code).toBe('TIMEOUT')
  })

  it('unexpected errors become UPSTREAM_ERROR without internal details', async () => {
    const broken: ShopAdapter = async () => {
      throw new Error('stack trace with goeggel-secret-pw')
    }
    const res = await handleSearch(request(validBody), env, { adapters: { goeggel: broken } })
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('UPSTREAM_ERROR')
    expect(text).not.toContain('goeggel-secret-pw')
  })

  it('a configuration error → 500 CONFIG_ERROR', async () => {
    const res = await handleSearch(request(validBody), { ...env, PRICE_MARKUP_EUR: 'x' }, { adapters: { goeggel: ok } })
    expect(res.status).toBe(500)
    expect(((await res.json()) as SearchResponse).error?.code).toBe('CONFIG_ERROR')
  })

  it('only accepts POST', async () => {
    const res = await handleSearch(request(null, {}, 'GET'), env)
    expect(res.status).toBe(405)
  })
})
