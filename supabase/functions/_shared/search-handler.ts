// HTTP handler of the `search` Edge Function. Runtime-neutral (Request → Response),
// used by Deno (supabase/functions/search/index.ts) and the local Node dev server.
import { searchGoeggel } from './adapters/goeggel.ts'
import { searchWeichberger, type AdapterDeps } from './adapters/weichberger.ts'
import { allowedOrigins, loadConfig, type AppConfig } from './config.ts'
import { toTireOffer } from './pricing.ts'
import {
  AdapterError,
  SEASONS,
  SHOPS,
  type ApiErrorCode,
  type SearchQuery,
  type SearchResponse,
  type Season,
  type ShopId,
  type ShopOffer,
} from './types.ts'

export type ShopAdapter = (query: SearchQuery, deps: AdapterDeps) => Promise<ShopOffer[]>
export interface HandlerDeps {
  adapters?: Partial<Record<ShopId, ShopAdapter>>
  fetchFn?: typeof fetch
}

const DEFAULT_ADAPTERS: Record<ShopId, ShopAdapter> = {
  weichberger: searchWeichberger,
  goeggel: searchGoeggel,
}
const PER_REQUEST_TIMEOUT_MS = 30000
const BRAND = /^[A-Z0-9][A-Z0-9 .&'-]{0,39}$/
const MAX_BRANDS = 8

type Env = Record<string, string | undefined>

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins(env).includes(origin)) return { vary: 'Origin' }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-werkstatt-code, authorization, apikey',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

function reply(status: number, body: SearchResponse, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

const failure = (shop: ShopId | null, code: ApiErrorCode, message: string): SearchResponse => ({
  shop,
  offers: [],
  error: { code, message },
})

/** Constant-time comparison so the workshop code cannot be guessed via timing. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

function parseRequest(body: unknown): { shop: ShopId; query: SearchQuery } | null {
  if (typeof body !== 'object' || body === null) return null
  const { shop, query } = body as { shop?: unknown; query?: Record<string, unknown> }
  if (!SHOPS.includes(shop as ShopId) || typeof query !== 'object' || query === null) return null
  const { width, height, rim, quantity, seasons = [], brands = [] } = query
  if (
    !isInt(width, 100, 400) ||
    !isInt(height, 20, 100) ||
    !isInt(rim, 10, 30) ||
    !isInt(quantity, 1, 20)
  ) {
    return null
  }
  if (!Array.isArray(seasons) || !seasons.every((s) => SEASONS.includes(s as Season))) return null
  if (!Array.isArray(brands) || brands.length > MAX_BRANDS) return null
  const normalizedBrands = brands.map((b) => (typeof b === 'string' ? b.trim().toUpperCase() : ''))
  if (!normalizedBrands.every((b) => BRAND.test(b))) return null
  const uniqueSeasons = [...new Set(seasons as Season[])]
  return {
    shop: shop as ShopId,
    query: {
      width,
      height,
      rim,
      quantity,
      // All seasons selected is the same as no season filter (saves shop requests).
      seasons: uniqueSeasons.length === SEASONS.length ? [] : uniqueSeasons,
      brands: [...new Set(normalizedBrands)],
    },
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AdapterError('TIMEOUT', 'Shop antwortet nicht')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export async function handleSearch(
  req: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const cors = corsHeaders(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST')
    return reply(405, failure(null, 'BAD_REQUEST', 'Nur POST erlaubt'), cors)

  let config: AppConfig
  try {
    config = loadConfig(env)
  } catch (e) {
    console.error('search: configuration error:', (e as Error).message)
    return reply(500, failure(null, 'CONFIG_ERROR', 'Server-Konfiguration fehlerhaft'), cors)
  }

  if (!safeEqual(req.headers.get('x-werkstatt-code') ?? '', config.werkstattCode)) {
    return reply(401, failure(null, 'UNAUTHORIZED', 'Werkstatt-Code ungültig'), cors)
  }

  let parsed: ReturnType<typeof parseRequest>
  try {
    parsed = parseRequest(await req.json())
  } catch {
    parsed = null
  }
  if (!parsed) return reply(400, failure(null, 'BAD_REQUEST', 'Ungültige Suchanfrage'), cors)
  const { shop, query } = parsed

  const adapter = deps.adapters?.[shop] ?? DEFAULT_ADAPTERS[shop]
  try {
    const offers = await withTimeout(
      adapter(query, {
        credentials: config.credentials[shop],
        maxOffers: config.maxOffersPerShop,
        fetchFn: deps.fetchFn,
        timeoutMs: Math.min(PER_REQUEST_TIMEOUT_MS, config.timeoutMs),
      }),
      config.timeoutMs,
    )
    return reply(
      200,
      {
        shop,
        offers: offers.map((o) => toTireOffer(o, query.quantity, config.pricing)),
        error: null,
      },
      cors,
    )
  } catch (e) {
    if (e instanceof AdapterError) {
      console.warn(`search ${shop}: ${e.code}`)
      return reply(200, failure(shop, e.code, e.message), cors)
    }
    console.error(`search ${shop}: unexpected ${(e as Error)?.name ?? 'error'}`)
    return reply(200, failure(shop, 'UPSTREAM_ERROR', 'Unerwarteter Fehler beim Shop-Abruf'), cors)
  }
}
