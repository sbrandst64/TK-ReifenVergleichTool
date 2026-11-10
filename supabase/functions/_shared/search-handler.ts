// HTTP handler of the `search` Edge Function. Runtime-neutral (Request → Response),
// used by Deno (supabase/functions/search/index.ts) and the local Node dev server.
import { searchGoeggel } from './adapters/goeggel.ts'
import { searchWeichberger, type AdapterDeps } from './adapters/weichberger.ts'
import { loadConfig, type AppConfig } from './config.ts'
import type { EanCache } from './ean-cache.ts'
import {
  corsHeaders as cors,
  isInt,
  json,
  safeEqual,
  withTimeout,
  type Env,
} from './http-common.ts'
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
  /** Remembered Göggel EANs (AC46); without it every EAN is read from the shop. */
  eanCache?: EanCache
}

const DEFAULT_ADAPTERS: Record<ShopId, ShopAdapter> = {
  weichberger: searchWeichberger,
  goeggel: searchGoeggel,
}
const PER_REQUEST_TIMEOUT_MS = 30000
const BRAND = /^[A-Z0-9][A-Z0-9 .&'-]{0,39}$/
const MAX_BRANDS = 8

const reply = (status: number, body: SearchResponse, h: Record<string, string>) =>
  json(status, body, h)

const failure = (shop: ShopId | null, code: ApiErrorCode, message: string): SearchResponse => ({
  shop,
  offers: [],
  error: { code, message },
})

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

export async function handleSearch(
  req: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const headers = cors(req, env, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST')
    return reply(405, failure(null, 'BAD_REQUEST', 'Nur POST erlaubt'), headers)

  let config: AppConfig
  try {
    config = loadConfig(env)
  } catch (e) {
    console.error('search: configuration error:', (e as Error).message)
    return reply(500, failure(null, 'CONFIG_ERROR', 'Server-Konfiguration fehlerhaft'), headers)
  }

  if (!safeEqual(req.headers.get('x-werkstatt-code') ?? '', config.werkstattCode)) {
    return reply(401, failure(null, 'UNAUTHORIZED', 'Werkstatt-Code ungültig'), headers)
  }

  let parsed: ReturnType<typeof parseRequest>
  try {
    parsed = parseRequest(await req.json())
  } catch {
    parsed = null
  }
  if (!parsed) return reply(400, failure(null, 'BAD_REQUEST', 'Ungültige Suchanfrage'), headers)
  const { shop, query } = parsed

  const adapter = deps.adapters?.[shop] ?? DEFAULT_ADAPTERS[shop]
  try {
    const offers = await withTimeout(
      adapter(query, {
        credentials: config.credentials[shop],
        maxOffers: config.maxOffersPerShop,
        fetchFn: deps.fetchFn,
        timeoutMs: Math.min(PER_REQUEST_TIMEOUT_MS, config.timeoutMs),
        eanCache: deps.eanCache,
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
      headers,
    )
  } catch (e) {
    if (e instanceof AdapterError) {
      console.warn(`search ${shop}: ${e.code}`)
      return reply(200, failure(shop, e.code, e.message), headers)
    }
    console.error(`search ${shop}: unexpected ${(e as Error)?.name ?? 'error'}`)
    return reply(
      200,
      failure(shop, 'UPSTREAM_ERROR', 'Unerwarteter Fehler beim Shop-Abruf'),
      headers,
    )
  }
}
