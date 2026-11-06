// Client for the `search` Edge Function (or the local dev server).
import type { SearchQuery, SearchResponse, ShopId } from '../supabase/functions/_shared/types.ts'

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

export const defaultSearch: SearchFn = createSearch(
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/functions/v1',
)
