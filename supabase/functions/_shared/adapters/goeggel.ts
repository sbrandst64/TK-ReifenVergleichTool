import type { SearchQuery, ShopOffer } from '../types.ts'
import type { AdapterDeps } from './weichberger.ts'

export const GOEGGEL_BASE = 'https://goeggel-shop.com'
export interface PagingInfo {
  from: number
  to: number
  total: number
}

export function isAllowedGoeggelUrl(_url: URL, _form?: Record<string, string>): boolean {
  throw new Error('not implemented')
}
export function parseGoeggelResults(_ergtabHtml: string): ShopOffer[] {
  throw new Error('not implemented')
}
export function parseGoeggelPaging(_html: string): PagingInfo | null {
  throw new Error('not implemented')
}
export function isNurVerfuegbarActive(_filterHtml: string): boolean {
  throw new Error('not implemented')
}
export function parseGoeggelDetailEan(_html: string): string | null {
  throw new Error('not implemented')
}
export function searchGoeggel(_query: SearchQuery, _deps: AdapterDeps): Promise<ShopOffer[]> {
  throw new Error('not implemented')
}
