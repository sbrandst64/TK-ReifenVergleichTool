// What goes into the offer PDF, computed from the selection (spec 3.7, AC32–AC34).
// Pure functions without pdf-lib so the numbers are easy to test.
import type { Season, TireOffer } from '../../supabase/functions/_shared/types.ts'

export interface SelectedTyre {
  offer: TireOffer
  /** Quantity marked in the filter when the tyre was ticked (AC31). */
  quantity: number
}

export interface OfferLine {
  label: string
  size: string
  quantity: number
  unitPrice: string
}

export interface OfferModel {
  date: string
  dimension: string
  /** Every quantity of the lines once, e.g. "2" or "2, 4". */
  pieces: string
  seasons: Record<Season, boolean>
  lines: OfferLine[]
  /** Sum of pieces × unit price over all lines (AC34); the extra prices never count. */
  total: string
}

const two = (n: number) => String(n).padStart(2, '0')

/** "1.234,56" – only characters the standard PDF fonts can encode (no narrow spaces, no €). */
export function formatAmount(cents: number): string {
  const euros = Math.floor(cents / 100)
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grouped},${two(cents % 100)}`
}

const sizeOf = (o: TireOffer) => `${o.width}/${o.height} R${o.rim}`

export function buildOfferModel(items: SelectedTyre[], today: Date): OfferModel {
  const seasons: Record<Season, boolean> = { sommer: false, winter: false, ganzjahr: false }
  for (const { offer } of items) if (offer.season) seasons[offer.season] = true
  return {
    date: `${two(today.getDate())}.${two(today.getMonth() + 1)}.${today.getFullYear()}`,
    dimension: [...new Set(items.map((i) => sizeOf(i.offer)))].join(', '),
    pieces: [...new Set(items.map((i) => i.quantity))].join(', '),
    seasons,
    lines: items.map(({ offer, quantity }) => ({
      label: `${offer.brand} ${offer.profile}`.trim(),
      size: `${sizeOf(offer)} ${offer.loadIndex}${offer.speedIndex}`.trim(),
      quantity,
      unitPrice: formatAmount(offer.priceGrossCents),
    })),
    total: items.length
      ? formatAmount(items.reduce((sum, i) => sum + i.quantity * i.offer.priceGrossCents, 0))
      : '',
  }
}

export function offerFileName(today: Date): string {
  return `Reifen-Angebot_${today.getFullYear()}-${two(today.getMonth() + 1)}-${two(today.getDate())}.pdf`
}
