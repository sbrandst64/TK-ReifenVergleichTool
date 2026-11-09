// HTTP handler of the `cart` Edge Function (spec 3.4): puts selected tyres into the cart of ONE
// shop. It never orders: the adapters can only reach login, search, cart write and cart display.
// Runtime-neutral (Request → Response), used by Deno (supabase/functions/cart/index.ts) and the
// local Node dev server.
import { addToCartGoeggel } from './adapters/goeggel.ts'
import { addToCartWeichberger, type AdapterDeps } from './adapters/weichberger.ts'
import { loadConfig, type AppConfig } from './config.ts'
import {
  corsHeaders as cors,
  isInt,
  json,
  safeEqual,
  withTimeout,
  type Env,
} from './http-common.ts'
import {
  AdapterError,
  SHOPS,
  type ApiErrorCode,
  type CartItem,
  type CartItemResult,
  type CartResponse,
  type ShopId,
} from './types.ts'

export type CartAdapter = (items: CartItem[], deps: AdapterDeps) => Promise<CartItemResult[]>
export interface CartHandlerDeps {
  adapters?: Partial<Record<ShopId, CartAdapter>>
  fetchFn?: typeof fetch
}

const DEFAULT_ADAPTERS: Record<ShopId, CartAdapter> = {
  weichberger: addToCartWeichberger,
  goeggel: addToCartGoeggel,
}
const PER_REQUEST_TIMEOUT_MS = 30000
const MAX_ITEMS = 20
const MAX_QUANTITY = 20
const MAX_DESCRIPTION = 200
/** Article ids of both shops are plain numbers; nothing that could change a form or URL. */
const ARTICLE_ID = /^[A-Za-z0-9_-]{1,40}$/

const reply = (status: number, body: CartResponse, h: Record<string, string>) =>
  json(status, body, h)

const failure = (shop: ShopId | null, code: ApiErrorCode, message: string): CartResponse => ({
  shop,
  results: [],
  error: { code, message },
})

function parseItem(raw: unknown): CartItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const {
    shopArticleId,
    quantity,
    width,
    height,
    rim,
    description = '',
  } = raw as Record<string, unknown>
  if (typeof shopArticleId !== 'string' || !ARTICLE_ID.test(shopArticleId)) return null
  if (
    !isInt(quantity, 1, MAX_QUANTITY) ||
    !isInt(width, 100, 400) ||
    !isInt(height, 20, 100) ||
    !isInt(rim, 10, 30)
  ) {
    return null
  }
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) return null
  return { shopArticleId, quantity, width, height, rim, description }
}

function parseRequest(body: unknown): { shop: ShopId; items: CartItem[] } | null {
  if (typeof body !== 'object' || body === null) return null
  const { shop, items } = body as { shop?: unknown; items?: unknown }
  if (!SHOPS.includes(shop as ShopId)) return null
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) return null
  const parsed = items.map(parseItem)
  if (parsed.some((i) => i === null)) return null
  const valid = parsed as CartItem[]
  // the same article twice would silently double the quantity in the shop
  if (new Set(valid.map((i) => i.shopArticleId)).size !== valid.length) return null
  return { shop: shop as ShopId, items: valid }
}

export async function handleCart(
  req: Request,
  env: Env,
  deps: CartHandlerDeps = {},
): Promise<Response> {
  const headers = cors(req, env, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST')
    return reply(405, failure(null, 'BAD_REQUEST', 'Nur POST erlaubt'), headers)

  let config: AppConfig
  try {
    config = loadConfig(env)
  } catch (e) {
    console.error('cart: configuration error:', (e as Error).message)
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
  if (!parsed)
    return reply(400, failure(null, 'BAD_REQUEST', 'Ungültige Warenkorb-Anfrage'), headers)
  const { shop, items } = parsed

  const adapter = deps.adapters?.[shop] ?? DEFAULT_ADAPTERS[shop]
  try {
    const results = await withTimeout(
      adapter(items, {
        credentials: config.credentials[shop],
        maxOffers: config.maxOffersPerShop,
        fetchFn: deps.fetchFn,
        timeoutMs: Math.min(PER_REQUEST_TIMEOUT_MS, config.timeoutMs),
      }),
      config.timeoutMs,
    )
    const failed = results.filter((r) => !r.ok).length
    console.info(`cart ${shop}: ${results.length - failed} abgelegt, ${failed} Fehler`)
    return reply(200, { shop, results, error: null }, headers)
  } catch (e) {
    if (e instanceof AdapterError) {
      console.warn(`cart ${shop}: ${e.code}`)
      return reply(200, failure(shop, e.code, e.message), headers)
    }
    console.error(`cart ${shop}: unexpected ${(e as Error)?.name ?? 'error'}`)
    return reply(
      200,
      failure(shop, 'UPSTREAM_ERROR', 'Unerwarteter Fehler beim Ablegen im Warenkorb'),
      headers,
    )
  }
}
