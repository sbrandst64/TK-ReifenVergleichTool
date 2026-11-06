import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../supabase/functions/_shared/config.ts'

const minimal = { WERKSTATT_CODE: 'geheim' }

describe('loadConfig', () => {
  it('uses the agreed defaults (spec 3.2)', () => {
    const c = loadConfig(minimal)
    expect(c.pricing.markupCents).toBe(3900)
    expect(c.pricing.vatPercent).toBe(20)
    expect(c.pricing.roundingCents).toBe(10)
    expect(c.pricing.shipping.goeggel).toEqual({ freeFrom: 2, perUnitCents: 650 })
    expect(c.pricing.shipping.weichberger).toBeNull()
    expect(c.maxOffersPerShop).toBe(20)
    expect(c.timeoutMs).toBe(60000)
    expect(c.allowedOrigins).toEqual(['http://localhost:5173'])
    expect(c.credentials).toEqual({ weichberger: null, goeggel: null })
  })

  it('AC12: reads overrides from the environment (secrets)', () => {
    const c = loadConfig({
      ...minimal,
      PRICE_MARKUP_EUR: '45',
      VAT_PERCENT: '19',
      PRICE_ROUNDING_EUR: '0,50',
      SHIPPING_WEICHBERGER: 'freeFrom=4;perUnit=5.00',
      MAX_OFFERS_PER_SHOP: '10',
      ALLOWED_ORIGINS: 'https://a.github.io, http://localhost:5173',
      WEICHBERGER_USER: 'u',
      WEICHBERGER_PASSWORD: 'p',
    })
    expect(c.pricing.markupCents).toBe(4500)
    expect(c.pricing.vatPercent).toBe(19)
    expect(c.pricing.roundingCents).toBe(50)
    expect(c.pricing.shipping.weichberger).toEqual({ freeFrom: 4, perUnitCents: 500 })
    expect(c.maxOffersPerShop).toBe(10)
    expect(c.allowedOrigins).toEqual(['https://a.github.io', 'http://localhost:5173'])
    expect(c.credentials.weichberger).toEqual({ user: 'u', password: 'p' })
    expect(c.credentials.goeggel).toBeNull()
  })

  it('requires a workshop code', () => {
    expect(() => loadConfig({})).toThrow(/WERKSTATT_CODE/)
  })

  it('rejects invalid numbers', () => {
    expect(() => loadConfig({ ...minimal, PRICE_MARKUP_EUR: 'abc' })).toThrow(/PRICE_MARKUP_EUR/)
    expect(() => loadConfig({ ...minimal, MAX_OFFERS_PER_SHOP: '0' })).toThrow(/MAX_OFFERS_PER_SHOP/)
  })
})
