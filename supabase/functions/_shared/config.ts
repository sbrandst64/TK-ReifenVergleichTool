// Configuration from environment variables (Supabase secrets / local .env).
import { parseEuroToCents, parseShippingRule } from './pricing.ts'
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
type Env = Record<string, string | undefined>

function euroCents(env: Env, name: string, fallback: string, min: number): number {
  const cents = parseEuroToCents(env[name] ?? fallback)
  if (cents === null || cents < min) throw new Error(`${name} ist ungültig: "${env[name]}"`)
  return cents
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]
  const value = raw === undefined || raw.trim() === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} muss eine ganze Zahl zwischen ${min} und ${max} sein: "${raw}"`)
  }
  return value
}

function shipping(env: Env, name: string, fallback: string | undefined) {
  try {
    return parseShippingRule(env[name] ?? fallback)
  } catch (e) {
    throw new Error(`${name}: ${(e as Error).message}`, { cause: e })
  }
}

function credentials(env: Env, prefix: string): Credentials | null {
  const user = env[`${prefix}_USER`]?.trim()
  const password = env[`${prefix}_PASSWORD`]
  return user && password ? { user, password } : null
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function loadConfig(env: Env): AppConfig {
  const werkstattCode = env.WERKSTATT_CODE?.trim()
  if (!werkstattCode) throw new Error('WERKSTATT_CODE fehlt')
  return {
    pricing: {
      markupCents: euroCents(env, 'PRICE_MARKUP_EUR', '39', 0),
      vatPercent: integer(env, 'VAT_PERCENT', 20, 0, 100),
      roundingCents: euroCents(env, 'PRICE_ROUNDING_EUR', '0.10', 1),
      shipping: {
        goeggel: shipping(env, 'SHIPPING_GOEGGEL', 'freeFrom=2;perUnit=6.50'),
        weichberger: shipping(env, 'SHIPPING_WEICHBERGER', undefined),
      },
    },
    maxOffersPerShop: integer(env, 'MAX_OFFERS_PER_SHOP', 20, 1, 100),
    werkstattCode,
    allowedOrigins: allowedOrigins(env),
    timeoutMs: integer(env, 'SEARCH_TIMEOUT_MS', 60000, 100, 140000),
    credentials: {
      weichberger: credentials(env, 'WEICHBERGER'),
      goeggel: credentials(env, 'GOEGGEL'),
    },
  }
}
