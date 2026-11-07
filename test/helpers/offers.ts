// Synthetic tyre offers for UI and PDF tests (no real customer or shop data).
import type { TireOffer } from '../../supabase/functions/_shared/types.ts'

let seq = 0

export function tyre(over: Partial<TireOffer> = {}): TireOffer {
  seq++
  return {
    shop: 'goeggel',
    shopArticleId: `A${seq}`,
    ean: null,
    brand: 'Testmarke',
    profile: `Profil ${seq}`,
    width: 205,
    height: 55,
    rim: 16,
    loadIndex: '91',
    speedIndex: 'H',
    description: '',
    stockImmediate: 20,
    stockTotal: 20,
    deliveryNote: 'sofort',
    season: 'sommer',
    priceGrossCents: 10000,
    shippingConfigured: true,
    delayed: false,
    ...over,
  }
}
