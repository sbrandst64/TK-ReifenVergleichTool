import type { ShopId } from './types.ts'

export interface ShippingRule {
  /** From this quantity on shipping is free. */
  freeFrom: number
  /** Shipping per tyre below `freeFrom`, in cents (net). */
  perUnitCents: number
}

export interface PricingConfigShape {
  markupCents: number
  vatPercent: number
  roundingCents: number
}

export interface PricingConfig extends PricingConfigShape {
  shipping: Record<ShopId, ShippingRule | null>
}
