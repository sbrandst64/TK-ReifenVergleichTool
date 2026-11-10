import { describe, expect, it } from 'vitest'
import { groupOffers } from '../supabase/functions/_shared/matching.ts'
import { tyre } from '../test/helpers/offers.ts'
import { applyView, DEFAULT_VIEW } from './list-view.ts'

const names = (groups: ReturnType<typeof applyView>) => groups.map((g) => g.offers[0].profile)

describe('applyView (AC52)', () => {
  const both = [
    tyre({ profile: 'Beide', ean: '111', priceGrossCents: 12000 }),
    tyre({ profile: 'Beide', ean: '111', shop: 'weichberger', priceGrossCents: 11000 }),
  ]
  const cheap = tyre({ profile: 'Billig', priceGrossCents: 9000 })
  const slow = tyre({
    profile: 'Langsam',
    shop: 'weichberger',
    priceGrossCents: 9500,
    delayed: true,
  })

  it('leaves the list as it is by default: cheapest first, nothing hidden', () => {
    const groups = groupOffers([...both, cheap, slow])
    expect(applyView(groups, DEFAULT_VIEW)).toEqual(groups)
    expect(names(groups)).toEqual(['Billig', 'Langsam', 'Beide'])
  })

  it('"in beiden Shops" keeps only tyres that both shops offer', () => {
    const view = applyView(groupOffers([...both, cheap, slow]), { ...DEFAULT_VIEW, onlyBoth: true })
    expect(names(view)).toEqual(['Beide'])
    expect(view[0].offers).toHaveLength(2)
  })

  it('"sofort lagernd" hides offers that need the slower stock, and tyres left without an offer', () => {
    const view = applyView(groupOffers([...both, cheap, slow]), { ...DEFAULT_VIEW, onlyNow: true })
    expect(names(view)).toEqual(['Billig', 'Beide'])
  })

  it('marks the cheapest again among the offers that are left', () => {
    const groups = groupOffers([
      tyre({ profile: 'X', ean: '5', priceGrossCents: 10000, shop: 'weichberger', delayed: true }),
      tyre({ profile: 'X', ean: '5', priceGrossCents: 10500 }),
    ])
    expect(groups[0].offers.map((o) => o.cheapest)).toEqual([true, false])
    const [left] = applyView(groups, { ...DEFAULT_VIEW, onlyNow: true })
    expect(left.offers.map((o) => [o.shop, o.cheapest])).toEqual([['goeggel', true]])
    expect(left.minPriceCents).toBe(10500)
    expect(left.shops).toEqual(['goeggel'])
    // with only one shop left it is no longer a tyre of both shops
    expect(applyView(groups, { sort: 'price', onlyNow: true, onlyBoth: true })).toEqual([])
  })

  it('"ÖAMTC-Note" puts the best grade first, untested tyres last, equal grades by price', () => {
    const conti = { brand: 'CONTINENTAL', profile: 'WinterContact TS 870' }
    const groups = groupOffers([
      tyre({ profile: 'Ungetestet', priceGrossCents: 8000 }),
      tyre({ ...conti, width: 185, height: 65, rim: 15, priceGrossCents: 9000 }), // 2,2
      tyre({ ...conti, loadIndex: '94', priceGrossCents: 15000 }), // 205/55 R16: 2,0
      tyre({ ...conti, priceGrossCents: 14000 }), // 205/55 R16: 2,0, cheaper
    ])
    const view = applyView(groups, { ...DEFAULT_VIEW, sort: 'rating' })
    expect(view.map((g) => g.minPriceCents)).toEqual([14000, 15000, 9000, 8000])
  })
})
