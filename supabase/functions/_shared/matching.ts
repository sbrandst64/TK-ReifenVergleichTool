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
type KeyFields = Pick<TireOffer, 'brand' | 'profile' | 'width' | 'height' | 'rim' | 'loadIndex' | 'speedIndex'>

export function matchKey(_o: KeyFields): string {
  throw new Error('not implemented')
}
export function groupOffers(_offers: TireOffer[]): OfferGroup[] {
  throw new Error('not implemented')
}
