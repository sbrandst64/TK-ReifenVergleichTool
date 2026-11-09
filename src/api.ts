// Clients for the Edge Functions `search`, `cart` and `settings` (or the local dev server).
import type { PdfTexts } from '../supabase/functions/_shared/pdf-texts.ts'
import type {
  CartItem,
  CartResponse,
  SearchQuery,
  SearchResponse,
  ShopId,
} from '../supabase/functions/_shared/types.ts'

export class UnauthorizedError extends Error {
  constructor() {
    super('Werkstatt-Code ungültig')
    this.name = 'UnauthorizedError'
  }
}

export type SearchFn = (shop: ShopId, query: SearchQuery, code: string) => Promise<SearchResponse>

const unreachable = (shop: ShopId): SearchResponse => ({
  shop,
  offers: [],
  error: { code: 'UPSTREAM_ERROR', message: 'Server nicht erreichbar' },
})

export function createSearch(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): SearchFn {
  const url = `${apiBase.replace(/\/+$/, '')}/search`
  return async (shop, query, code) => {
    let res: Response
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-werkstatt-code': code },
        body: JSON.stringify({ shop, query }),
      })
    } catch {
      return unreachable(shop)
    }
    if (res.status === 401) throw new UnauthorizedError()
    try {
      return (await res.json()) as SearchResponse
    } catch {
      return unreachable(shop)
    }
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/functions/v1'

export const defaultSearch: SearchFn = createSearch(API_BASE)

/** Puts tyres into the cart of one shop (spec 3.4). The service never orders. */
export type CartFn = (shop: ShopId, items: CartItem[], code: string) => Promise<CartResponse>

export function createCart(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): CartFn {
  const url = `${apiBase.replace(/\/+$/, '')}/cart`
  const unreachableCart = (shop: ShopId): CartResponse => ({
    shop,
    results: [],
    error: { code: 'UPSTREAM_ERROR', message: 'Server nicht erreichbar' },
  })
  return async (shop, items, code) => {
    let res: Response
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-werkstatt-code': code },
        body: JSON.stringify({ shop, items }),
      })
    } catch {
      return unreachableCart(shop)
    }
    if (res.status === 401) throw new UnauthorizedError()
    try {
      return (await res.json()) as CartResponse
    } catch {
      return unreachableCart(shop)
    }
  }
}

export const defaultCart: CartFn = createCart(API_BASE)

/** Central PDF texts (spec 3.7): the same for every device of the workshop. */
export interface SettingsApi {
  load(code: string): Promise<PdfTexts>
  save(code: string, texts: PdfTexts): Promise<PdfTexts>
}

export function createSettingsApi(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): SettingsApi {
  const url = `${apiBase.replace(/\/+$/, '')}/settings`
  const call = async (code: string, init: RequestInit = {}): Promise<PdfTexts> => {
    const res = await fetchFn(url, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-werkstatt-code': code },
    })
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) throw new Error(`Einstellungen: HTTP ${res.status}`)
    return ((await res.json()) as { texts: PdfTexts }).texts
  }
  return {
    load: (code) => call(code),
    save: (code, texts) => call(code, { method: 'PUT', body: JSON.stringify({ texts }) }),
  }
}

export const defaultSettings: SettingsApi = createSettingsApi(API_BASE)
