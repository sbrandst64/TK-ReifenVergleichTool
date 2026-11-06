import type { PricingConfigShape, ShippingRule } from './pricing-types.ts'
import type { ShopOffer, TireOffer } from './types.ts'
export type { PricingConfig, ShippingRule } from './pricing-types.ts'

export function parseShippingRule(_text: string | undefined): ShippingRule | null {
  throw new Error('not implemented')
}
export function shippingPerUnitCents(_rule: ShippingRule | null, _quantity: number): number {
  throw new Error('not implemented')
}
export function grossPriceCents(_netEkCents: number, _shippingCents: number, _cfg: PricingConfigShape): number {
  throw new Error('not implemented')
}
export function toTireOffer(_offer: ShopOffer, _quantity: number, _cfg: import('./pricing-types.ts').PricingConfig): TireOffer {
  throw new Error('not implemented')
}
