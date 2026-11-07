// Ticked tyres (AC31): the list with "Auswahl aufheben" lives in the left panel below "Suchen";
// the actions on the selection (offer PDF, later cart) float bottom right.
import { useState } from 'react'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import type { SelectedTyre } from '../pdf/offer-model.ts'

export interface SelectionListProps {
  items: SelectedTyre[]
  onRemove: (item: SelectedTyre) => void
  onClear: () => void
}

export function SelectionList({ items, onRemove, onClear }: SelectionListProps) {
  if (items.length === 0) return null
  return (
    <section className="selection" aria-label="Auswahl">
      <div className="selection__head">
        <strong className="selection__count">{items.length} Reifen ausgewählt</strong>
        <button type="button" className="button" onClick={onClear}>
          Auswahl aufheben
        </button>
      </div>
      <ul className="selection__list">
        {items.map((item) => {
          const { offer } = item
          const name = `${offer.brand} ${offer.profile}`
          return (
            <li key={`${offer.shop}-${offer.shopArticleId}`} className="selection__item">
              <span className="selection__text">
                {`${name} · ${offer.width}/${offer.height} R${offer.rim} · ${SHOP_LABEL[offer.shop]} · ${item.quantity} Stk · ${formatEuro(offer.priceGrossCents)}`}
              </span>
              <button
                type="button"
                className="selection__remove"
                aria-label={`${name} entfernen`}
                onClick={() => onRemove(item)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export interface SelectionActionsProps {
  count: number
  onOfferPdf: () => Promise<void>
}

export function SelectionActions({ count, onOfferPdf }: SelectionActionsProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (count === 0) return null

  const makePdf = async () => {
    setBusy(true)
    setError(null)
    try {
      await onOfferPdf()
    } catch {
      setError('Angebot konnte nicht erstellt werden – bitte erneut versuchen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flyout" aria-label="Aktionen zur Auswahl">
      {error && (
        <p className="error flyout__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="flyout__primary" onClick={makePdf} disabled={busy}>
        {busy ? 'PDF wird erstellt …' : 'Angebot als PDF'}
      </button>
    </section>
  )
}
