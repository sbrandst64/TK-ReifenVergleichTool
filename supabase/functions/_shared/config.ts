import type { PricingConfig } from './pricing-types.ts'
import type { ShopId } from './types.ts'

export interface Credentials {
  user: string
  password: string
}
export interface AppConfig {
  pricing: PricingConfig
  maxOffersPerShop: number
  werkstattCode: string
  allowedOrigins: string[]
  timeoutMs: number
  credentials: Record<ShopId, Credentials | null>
}

export function loadConfig(_env: Record<string, string | undefined>): AppConfig {
  throw new Error('not implemented')
}
