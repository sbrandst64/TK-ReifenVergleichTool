// Groups offers of the same tyre across shops (spec 3.3):
// 1. same EAN; 2. otherwise same brand/profile/size/LI/SI; 3. otherwise its own group.
import { normalizeToken } from './tire.ts'
import type { ShopId, TireOffer } from './types.ts'

export interface GroupedOffer extends TireOffer {
  cheapest: boolean
}
export interface OfferGroup {
  id: string
  offers: GroupedOffer[]
  minPriceCents: number
  /** Cheapest marking depends on an unconfigured shipping rule. */
  provisional: boolean
  shops: ShopId[]
}
type KeyFields = Pick<
  TireOffer,
  'brand' | 'profile' | 'width' | 'height' | 'rim' | 'loadIndex' | 'speedIndex'
>

export function matchKey(o: KeyFields): string {
  return [
    'K',
    normalizeToken(o.brand),
    normalizeToken(o.profile),
    o.width,
    o.height,
    o.rim,
    normalizeToken(o.loadIndex),
    normalizeToken(o.speedIndex),
  ].join('|')
}

export function groupOffers(offers: TireOffer[]): OfferGroup[] {
  const members = new Map<string, TireOffer[]>()
  const eanGroupsByKey = new Map<string, Set<string>>()
  const add = (id: string, o: TireOffer) => members.set(id, [...(members.get(id) ?? []), o])

  for (const o of offers) {
    if (!o.ean) continue
    const id = `E:${o.ean}`
    add(id, o)
    const key = matchKey(o)
    eanGroupsByKey.set(key, (eanGroupsByKey.get(key) ?? new Set()).add(id))
  }
  for (const o of offers) {
    if (o.ean) continue
    const key = matchKey(o)
    const candidates = eanGroupsByKey.get(key)
    // Attach to an EAN group only when that is unambiguous; otherwise group by key.
    add(candidates?.size === 1 ? [...candidates][0] : key, o)
  }

  return [...members.entries()]
    .map(([id, list]): OfferGroup => {
      const sorted = [...list].sort((a, b) => a.priceGrossCents - b.priceGrossCents)
      const min = sorted[0].priceGrossCents
      return {
        id,
        offers: sorted.map((o) => ({ ...o, cheapest: o.priceGrossCents === min })),
        minPriceCents: min,
        provisional: sorted.some((o) => o.shop === 'weichberger' && !o.shippingConfigured),
        shops: [...new Set(sorted.map((o) => o.shop))],
      }
    })
    .sort((a, b) => a.minPriceCents - b.minPriceCents || a.id.localeCompare(b.id))
}
