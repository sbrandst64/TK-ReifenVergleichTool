// What the user wants to see of the result list (AC52): order and two filters. Pure functions on
// the grouped offers, so the rules are easy to test.
import type { GroupedOffer, OfferGroup } from '../supabase/functions/_shared/matching.ts'
import { oeamtcRating } from './oeamtc-ratings.ts'

export type ListSort = 'price' | 'rating'

export interface ListView {
  sort: ListSort
  /** Only tyres that both shops offer. */
  onlyBoth: boolean
  /** Only offers that are in stock now (no slower stock). */
  onlyNow: boolean
}

export const DEFAULT_VIEW: ListView = { sort: 'price', onlyBoth: false, onlyNow: false }

/** The group with only these offers: cheapest mark, lowest price and shops are worked out again. */
function withOffers(group: OfferGroup, offers: GroupedOffer[]): OfferGroup {
  const min = Math.min(...offers.map((o) => o.priceGrossCents))
  return {
    ...group,
    offers: offers.map((o) => ({ ...o, cheapest: o.priceGrossCents === min })),
    minPriceCents: min,
    provisional: offers.some((o) => o.shop === 'weichberger' && !o.shippingConfigured),
    shops: [...new Set(offers.map((o) => o.shop))],
  }
}

/** ÖAMTC grade of the tyre as a number, e.g. 2.2; untested tyres sort behind every tested one. */
function grade(group: OfferGroup): number {
  const rating = oeamtcRating(group.offers[0])
  return rating ? Number(rating.grade.replace(',', '.')) : Infinity
}

export function applyView(groups: OfferGroup[], view: ListView): OfferGroup[] {
  let list = groups
  if (view.onlyNow)
    list = list.flatMap((g) => {
      const now = g.offers.filter((o) => !o.delayed && o.stockTotal > 0)
      return now.length === g.offers.length ? [g] : now.length > 0 ? [withOffers(g, now)] : []
    })
  if (view.onlyBoth) list = list.filter((g) => g.shops.length > 1)
  if (view.sort === 'rating')
    // the incoming order is cheapest first, and sort() is stable: equal grades stay by price
    list = [...list].sort((a, b) => {
      const [x, y] = [grade(a), grade(b)]
      return x === y ? 0 : x - y
    })
  return list
}
