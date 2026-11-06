// Shared types for the Edge Functions and the frontend.
// Runtime-neutral: no Deno/Node/DOM specific APIs in this folder except standard fetch/URL.

export type ShopId = 'weichberger' | 'goeggel'
export const SHOPS: readonly ShopId[] = ['weichberger', 'goeggel']

export type Season = 'sommer' | 'winter' | 'ganzjahr'
export const SEASONS: readonly Season[] = ['sommer', 'winter', 'ganzjahr']

export interface SearchQuery {
  width: number
  height: number
  rim: number
  /** Requested number of tyres; offers need at least this much stock. */
  quantity: number
  /** Empty = all seasons. */
  seasons: Season[]
  /** Canonical upper-case brand names. Empty = all brands. */
  brands: string[]
}

/** Offer as read from a shop. Contains the purchase price, which never leaves the server. */
export interface ShopOffer {
  shop: ShopId
  shopArticleId: string
  ean: string | null
  brand: string
  profile: string
  width: number
  height: number
  rim: number
  loadIndex: string
  speedIndex: string
  description: string
  /** Stock that can be delivered immediately. */
  stockImmediate: number
  /** Stock including slower locations (e.g. Weichberger Nebenlager, 2–3 days). */
  stockTotal: number
  /** Shop's own delivery text, e.g. "sofort" or "ca. 3 Tage". */
  deliveryNote: string
  season: Season | null
  netEkCents: number
}

/** Offer as sent to the client: end-customer price instead of purchase price. */
export interface TireOffer extends Omit<ShopOffer, 'netEkCents'> {
  priceGrossCents: number
  /** False when the shop's shipping rule is not configured (price assumes 0 € shipping). */
  shippingConfigured: boolean
  /** True when the requested quantity is only reachable with slower stock (shown yellow). */
  delayed: boolean
}

export type AdapterErrorCode =
  | 'LOGIN_FAILED'
  | 'SESSION_EXPIRED'
  | 'LAYOUT_CHANGED'
  | 'TIMEOUT'
  | 'BLOCKED'
  | 'UPSTREAM_ERROR'
  | 'AUTO_ORDER_ENABLED'
  | 'AUTO_ORDER_UNKNOWN'
  | 'FORBIDDEN_ENDPOINT'

export type ApiErrorCode = AdapterErrorCode | 'BAD_REQUEST' | 'UNAUTHORIZED' | 'CONFIG_ERROR'

export class AdapterError extends Error {
  readonly code: AdapterErrorCode
  constructor(code: AdapterErrorCode, message: string) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
  }
}

export interface SearchResponse {
  shop: ShopId | null
  offers: TireOffer[]
  error: null | { code: ApiErrorCode; message: string }
}
