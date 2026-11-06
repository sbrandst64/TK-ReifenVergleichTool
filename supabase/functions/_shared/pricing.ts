// End-customer price per tyre (spec 3.2), computed in integer cents:
//   gross = round_step((netEK + shipping per tyre + markup) × (1 + VAT))
import type { PricingConfig, PricingConfigShape, ShippingRule } from './pricing-types.ts'
import type { ShopOffer, TireOffer } from './types.ts'

export type { PricingConfig, PricingConfigShape, ShippingRule } from './pricing-types.ts'

/** Parses "5", "5.00" or "5,00" into cents; null if not a plain non-negative amount. */
export function parseEuroToCents(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const [euros, fraction = ''] = t.split('.')
  return Number(euros) * 100 + Number(`${fraction}00`.slice(0, 2))
}

/** Parses "freeFrom=4;perUnit=5.00". Empty or missing → null (rule not configured). */
export function parseShippingRule(text: string | undefined): ShippingRule | null {
  if (text === undefined || text.trim() === '') return null
  const parts = new Map(
    text
      .split(';')
      .map((p) => p.split('=').map((s) => s.trim()))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k, v] as const),
  )
  const freeFrom = Number(parts.get('freeFrom'))
  const perUnit = parseEuroToCents(parts.get('perUnit') ?? '')
  if (!Number.isInteger(freeFrom) || freeFrom < 1 || perUnit === null) {
    throw new Error(`Ungültige Versandregel "${text}" – erwartet z. B. "freeFrom=4;perUnit=5.00"`)
  }
  return { freeFrom, perUnitCents: perUnit }
}

export function shippingPerUnitCents(rule: ShippingRule | null, quantity: number): number {
  if (!rule || quantity >= rule.freeFrom) return 0
  return rule.perUnitCents
}

export function grossPriceCents(netEkCents: number, shippingCents: number, cfg: PricingConfigShape): number {
  const net = netEkCents + shippingCents + cfg.markupCents
  // Work in 1/100 cent to stay integer: net × (100 + VAT %)
  const scaled = net * (100 + cfg.vatPercent)
  const step = cfg.roundingCents * 100
  const rounded = Math.floor((scaled + step / 2) / step) * step // half step rounds up
  return rounded / 100
}

export function toTireOffer(offer: ShopOffer, quantity: number, cfg: PricingConfig): TireOffer {
  const { netEkCents, ...rest } = offer
  const rule = cfg.shipping[offer.shop]
  const delayed = offer.stockImmediate < quantity
  const deliveryNote = !delayed
    ? 'sofort'
    : offer.shop === 'weichberger'
      ? 'Nebenlager (2–3 Tage)'
      : offer.deliveryNote
  return {
    ...rest,
    deliveryNote,
    priceGrossCents: grossPriceCents(netEkCents, shippingPerUnitCents(rule, quantity), cfg),
    shippingConfigured: rule !== null,
    delayed,
  }
}
