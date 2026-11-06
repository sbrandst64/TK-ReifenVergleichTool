import type { SearchQuery, SearchResponse, ShopId } from '../supabase/functions/_shared/types.ts'

export class UnauthorizedError extends Error {}
export type SearchFn = (shop: ShopId, query: SearchQuery, code: string) => Promise<SearchResponse>

export function createSearch(_apiBase: string, _fetchFn: typeof fetch = fetch): SearchFn {
  throw new Error('not implemented')
}
