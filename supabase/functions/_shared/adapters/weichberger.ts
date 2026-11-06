import type { Credentials } from '../config.ts'
import type { SearchQuery, ShopOffer } from '../types.ts'

export interface AdapterDeps {
  credentials: Credentials | null
  maxOffers: number
  fetchFn?: typeof fetch
  timeoutMs?: number
}
export const WEICHBERGER_BASE = 'https://b2b.weichberger.at'

export function isAllowedWeichbergerUrl(_url: URL): boolean {
  throw new Error('not implemented')
}
export function parseWeichbergerResults(_html: string): ShopOffer[] {
  throw new Error('not implemented')
}
export function parseWeichbergerPageCount(_footerHtml: string): number {
  throw new Error('not implemented')
}
export function searchWeichberger(_query: SearchQuery, _deps: AdapterDeps): Promise<ShopOffer[]> {
  throw new Error('not implemented')
}
