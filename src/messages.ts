import type { ApiErrorCode, ShopId } from '../supabase/functions/_shared/types.ts'

export const SHOP_LABEL: Record<ShopId, string> = { weichberger: 'Weichberger', goeggel: 'Göggel' }

export function errorMessage(_shop: ShopId, _code: ApiErrorCode): string {
  throw new Error('not implemented')
}
export function formatEuro(_cents: number): string {
  throw new Error('not implemented')
}
