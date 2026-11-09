// Ticked tyres (AC31) in their own area outside the filters: the list, "Auswahl aufheben" and the
// actions on the selection (offer PDF, later cart). Wide PC: a column at the right screen edge;
// narrower screens: a block between filters and results, with the actions floating bottom right.
import { useState } from 'react'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import type { SelectedTyre } from '../pdf/offer-model.ts'

export interface SelectionProps {
  items: SelectedTyre[]
  onRemove: (item: SelectedTyre) => void
  onClear: () => void
  onOfferPdf: () => Promise<void>
}

export function Selection({ items, onRemove, onClear, onOfferPdf }: SelectionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (items.length === 0) return null

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
    <section className="selection" aria-label="Auswahl">
      <strong className="selection__count">{items.length} Reifen ausgewählt</strong>
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
      <button type="button" className="button selection__clear" onClick={onClear}>
        Auswahl aufheben
      </button>
      <div className="flyout" role="group" aria-label="Aktionen zur Auswahl">
        {error && (
          <p className="error flyout__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="flyout__primary" onClick={makePdf} disabled={busy}>
          {busy ? 'PDF wird erstellt …' : 'Angebot als PDF'}
        </button>
      </div>
    </section>
  )
}
