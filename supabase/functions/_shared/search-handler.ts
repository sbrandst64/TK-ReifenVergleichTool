import type { SearchQuery, ShopId, ShopOffer } from './types.ts'
import type { AdapterDeps } from './adapters/weichberger.ts'

export type ShopAdapter = (query: SearchQuery, deps: AdapterDeps) => Promise<ShopOffer[]>
export interface HandlerDeps {
  adapters?: Partial<Record<ShopId, ShopAdapter>>
  fetchFn?: typeof fetch
}

export function handleSearch(_req: Request, _env: Record<string, string | undefined>, _deps?: HandlerDeps): Promise<Response> {
  throw new Error('not implemented')
}
