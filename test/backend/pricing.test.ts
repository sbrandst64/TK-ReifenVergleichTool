import { describe, expect, it } from 'vitest'
import {
  grossPriceCents,
  parseShippingRule,
  shippingPerUnitCents,
  toTireOffer,
  type PricingConfig,
} from '../../supabase/functions/_shared/pricing.ts'
import type { ShopOffer } from '../../supabase/functions/_shared/types.ts'

const base = { markupCents: 3900, vatPercent: 20, roundingCents: 10 }
const goeggelRule = { freeFrom: 2, perUnitCents: 650 }
const cfg: PricingConfig = { ...base, shipping: { goeggel: goeggelRule, weichberger: null } }

const offer = (over: Partial<ShopOffer> = {}): ShopOffer => ({
  shop: 'goeggel',
  shopArticleId: '1',
  ean: '1234567890123',
  brand: 'KUMHO',
  profile: 'ES31',
  width: 205,
  height: 55,
  rim: 16,
  loadIndex: '91',
  speedIndex: 'H',
  description: '205/55HR16TL',
  stockImmediate: 10,
  stockTotal: 10,
  deliveryNote: 'sofort',
  season: 'sommer',
  netEkCents: 5014,
  ...over,
})

describe('grossPriceCents – end-customer price per tyre (spec 3.2)', () => {
  it('AC8: (50,14 + 0 + 39) × 1,2 = 106,968 → 107,00 €', () => {
    expect(grossPriceCents(5014, 0, base)).toBe(10700)
  })

  it('AC9: with 6,50 € shipping per tyre → 114,80 €', () => {
    expect(grossPriceCents(5014, 650, base)).toBe(11480)
  })

  it('rounds down to the 0,10 € step when below the half step', () => {
    // (50,04 + 39) × 1,2 = 106,848 → 106,80
    expect(grossPriceCents(5004, 0, base)).toBe(10680)
  })

  it('rounds a half step up', () => {
    const noVat = { markupCents: 0, vatPercent: 0, roundingCents: 10 }
    expect(grossPriceCents(1005, 0, noVat)).toBe(1010)
    expect(grossPriceCents(1004, 0, noVat)).toBe(1000)
  })

  it('works in integer cents (no floating point drift)', () => {
    expect(Number.isInteger(grossPriceCents(3333, 0, base))).toBe(true)
  })
})

describe('shippingPerUnitCents', () => {
  it('Göggel: 1 tyre costs 6,50 €, from 2 tyres free', () => {
    expect(shippingPerUnitCents(goeggelRule, 1)).toBe(650)
    expect(shippingPerUnitCents(goeggelRule, 2)).toBe(0)
    expect(shippingPerUnitCents(goeggelRule, 8)).toBe(0)
  })

  it('AC10: Weichberger rule "ab 4 frei, darunter 5,00 €"', () => {
    const rule = { freeFrom: 4, perUnitCents: 500 }
    expect(grossPriceCents(5014, shippingPerUnitCents(rule, 2), base)).toBe(11300)
    expect(grossPriceCents(5014, shippingPerUnitCents(rule, 4), base)).toBe(10700)
  })

  it('unconfigured rule means 0 €', () => {
    expect(shippingPerUnitCents(null, 1)).toBe(0)
  })
})

describe('parseShippingRule', () => {
  it('parses "freeFrom=4;perUnit=5.00"', () => {
    expect(parseShippingRule('freeFrom=4;perUnit=5.00')).toEqual({ freeFrom: 4, perUnitCents: 500 })
  })

  it('accepts a comma as decimal separator and spaces', () => {
    expect(parseShippingRule(' freeFrom=2 ; perUnit=6,50 ')).toEqual({ freeFrom: 2, perUnitCents: 650 })
  })

  it('returns null for empty or missing values', () => {
    expect(parseShippingRule(undefined)).toBeNull()
    expect(parseShippingRule('')).toBeNull()
  })

  it('throws for malformed rules', () => {
    expect(() => parseShippingRule('free=4')).toThrow()
    expect(() => parseShippingRule('freeFrom=x;perUnit=1')).toThrow()
  })
})

describe('toTireOffer', () => {
  it('replaces the purchase price by the end-customer price', () => {
    const t = toTireOffer(offer(), 4, cfg)
    expect(t.priceGrossCents).toBe(10700)
    expect('netEkCents' in t).toBe(false)
    expect(t.shippingConfigured).toBe(true)
  })

  it('adds shipping depending on the requested quantity', () => {
    expect(toTireOffer(offer(), 1, cfg).priceGrossCents).toBe(11480)
  })

  it('AC11: marks unconfigured shipping', () => {
    const t = toTireOffer(offer({ shop: 'weichberger' }), 4, cfg)
    expect(t.shippingConfigured).toBe(false)
    expect(t.priceGrossCents).toBe(10700)
  })

  it('AC16: delayed when immediate stock is below the quantity but total stock suffices', () => {
    const t = toTireOffer(offer({ shop: 'weichberger', stockImmediate: 2, stockTotal: 9 }), 4, cfg)
    expect(t.delayed).toBe(true)
    expect(t.deliveryNote).toBe('Nebenlager (2–3 Tage)')
  })

  it('not delayed when immediate stock suffices', () => {
    const t = toTireOffer(offer({ shop: 'weichberger', stockImmediate: 4, stockTotal: 9, deliveryNote: '' }), 4, cfg)
    expect(t.delayed).toBe(false)
    expect(t.deliveryNote).toBe('sofort')
  })
})
