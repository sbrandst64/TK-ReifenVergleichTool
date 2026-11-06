import { describe, expect, it } from 'vitest'
import { groupOffers, matchKey } from '../../supabase/functions/_shared/matching.ts'
import type { TireOffer } from '../../supabase/functions/_shared/types.ts'

let seq = 0
const offer = (over: Partial<TireOffer> = {}): TireOffer => ({
  shop: 'goeggel',
  shopArticleId: String(++seq),
  ean: null,
  brand: 'MICHELIN',
  profile: 'PRIMACY 4+',
  width: 205,
  height: 55,
  rim: 16,
  loadIndex: '91',
  speedIndex: 'V',
  description: '',
  stockImmediate: 8,
  stockTotal: 8,
  deliveryNote: 'sofort',
  season: 'sommer',
  priceGrossCents: 10000,
  shippingConfigured: true,
  delayed: false,
  ...over,
})

describe('matchKey', () => {
  it('is equal for the same tyre written differently', () => {
    expect(matchKey(offer({ profile: 'Primacy 4+' }))).toBe(matchKey(offer({ profile: 'PRIMACY 4+' })))
  })
})

describe('groupOffers', () => {
  it('AC13: same EAN from both shops forms one group, the cheaper offer is marked', () => {
    const groups = groupOffers([
      offer({ shop: 'weichberger', ean: '111', profile: 'PRIMACY4+', priceGrossCents: 11000 }),
      offer({ shop: 'goeggel', ean: '111', priceGrossCents: 10500 }),
    ])
    expect(groups).toHaveLength(1)
    const [g] = groups
    expect(g.shops.sort()).toEqual(['goeggel', 'weichberger'])
    expect(g.offers.find((o) => o.shop === 'goeggel')?.cheapest).toBe(true)
    expect(g.offers.find((o) => o.shop === 'weichberger')?.cheapest).toBe(false)
    expect(g.minPriceCents).toBe(10500)
  })

  it('AC14: without EAN, same brand/profile/size/LI/SI forms one group', () => {
    const groups = groupOffers([
      offer({ shop: 'weichberger', ean: '222' }),
      offer({ shop: 'goeggel', ean: null, profile: 'Primacy 4+' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].offers).toHaveLength(2)
  })

  it('AC15: different load or speed index never share a group', () => {
    expect(groupOffers([offer(), offer({ loadIndex: '94' })])).toHaveLength(2)
    expect(groupOffers([offer(), offer({ speedIndex: 'W' })])).toHaveLength(2)
  })

  it('different EANs stay separate even with the same key', () => {
    expect(groupOffers([offer({ ean: '1' }), offer({ ean: '2' })])).toHaveLength(2)
  })

  it('marks all offers on a price tie as cheapest', () => {
    const [g] = groupOffers([offer({ ean: '9' }), offer({ ean: '9', shop: 'weichberger' })])
    expect(g.offers.every((o) => o.cheapest)).toBe(true)
  })

  it('AC17: groups are sorted by their cheapest price, offers inside too', () => {
    const groups = groupOffers([
      offer({ ean: 'A', priceGrossCents: 15000 }),
      offer({ ean: 'B', priceGrossCents: 9000 }),
      offer({ ean: 'A', shop: 'weichberger', priceGrossCents: 12000 }),
    ])
    expect(groups.map((g) => g.minPriceCents)).toEqual([9000, 12000])
    expect(groups[1].offers.map((o) => o.priceGrossCents)).toEqual([12000, 15000])
  })

  it('AC11: cheapest marking is provisional when a Weichberger offer lacks a shipping rule', () => {
    const [g] = groupOffers([
      offer({ ean: 'C', shop: 'weichberger', shippingConfigured: false }),
      offer({ ean: 'C' }),
    ])
    expect(g.provisional).toBe(true)
    const [h] = groupOffers([offer({ ean: 'D' }), offer({ ean: 'D', shop: 'weichberger' })])
    expect(h.provisional).toBe(false)
  })

  it('returns an empty list for no offers', () => {
    expect(groupOffers([])).toEqual([])
  })
})
