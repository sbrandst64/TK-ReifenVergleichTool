// User-facing texts (spec AC22–AC24) and formatting.
import type { ApiErrorCode, ShopId } from '../supabase/functions/_shared/types.ts'

export const SHOP_LABEL: Record<ShopId, string> = { weichberger: 'Weichberger', goeggel: 'Göggel' }

const ERROR_TEXT: Record<ApiErrorCode, string> = {
  LOGIN_FAILED: 'Anmeldung fehlgeschlagen – Zugangsdaten prüfen',
  SESSION_EXPIRED: 'Sitzung abgelaufen – bitte erneut suchen',
  LAYOUT_CHANGED: 'Shop-Seite hat sich geändert – Adapter prüfen',
  TIMEOUT: 'Shop antwortet nicht',
  BLOCKED: 'Shop blockiert Anfragen',
  UPSTREAM_ERROR: 'Shop nicht erreichbar oder Fehler beim Abruf',
  AUTO_ORDER_ENABLED: 'Automatische Bestellung ist aktiv – Warenkorb wird nicht befüllt',
  AUTO_ORDER_UNKNOWN: 'Bestell-Einstellung nicht lesbar – Warenkorb wird nicht befüllt',
  FORBIDDEN_ENDPOINT: 'Unerlaubter Shop-Aufruf wurde blockiert',
  BAD_REQUEST: 'Ungültige Suchanfrage',
  UNAUTHORIZED: 'Werkstatt-Code ungültig',
  CONFIG_ERROR: 'Server-Konfiguration fehlerhaft',
}

export function errorMessage(shop: ShopId, code: ApiErrorCode): string {
  return `${SHOP_LABEL[shop]}: ${ERROR_TEXT[code] ?? 'Unbekannter Fehler'}`
}

const euro = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })

export function formatEuro(cents: number): string {
  return euro.format(cents / 100)
}
