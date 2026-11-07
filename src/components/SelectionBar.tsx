// Bottom bar with the ticked tyres (AC31) and the actions on them (offer PDF, later cart).
import { useState } from 'react'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import type { SelectedTyre } from '../pdf/offer-model.ts'

export interface SelectionBarProps {
  items: SelectedTyre[]
  onRemove: (item: SelectedTyre) => void
  onClear: () => void
  onOfferPdf: () => Promise<void>
}

export function SelectionBar({ items, onRemove, onClear, onOfferPdf }: SelectionBarProps) {
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
      <div className="selection__head">
        <strong className="selection__count">{items.length} Reifen ausgewählt</strong>
        <div className="selection__actions">
          <button type="button" className="button" onClick={onClear}>
            Auswahl aufheben
          </button>
          <button type="button" className="selection__primary" onClick={makePdf} disabled={busy}>
            {busy ? 'PDF wird erstellt …' : 'Angebot als PDF'}
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
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
