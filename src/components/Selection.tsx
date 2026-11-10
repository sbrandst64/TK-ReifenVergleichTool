// Ticked tyres (AC31) in their own area outside the filters: the list, "Auswahl aufheben" and the
// actions on the selection (into the shop carts, offer PDF). Wide PC: a column at the right screen
// edge that is always there, so the tyre list keeps its width when the first tyre is ticked (AC49);
// narrower screens: a block between filters and results (hidden while empty), with the actions in
// a bar at the bottom of the screen (AC50).
import { useState } from 'react'
import { formatEuro } from '../messages.ts'
import type { SelectedTyre } from '../pdf/offer-model.ts'
import { offerKey, ShopBadge } from './ResultList.tsx'

/** Where a ticked tyre stands with the cart of its shop (spec 3.4). */
export type CartEntry =
  { status: 'pending' } | { status: 'ok' } | { status: 'error'; message: string }

export interface SelectionProps {
  items: SelectedTyre[]
  onRemove: (item: SelectedTyre) => void
  onClear: () => void
  onOfferPdf: () => Promise<void>
  /** Cart state per ticked tyre, keyed by offerKey. */
  cart: Record<string, CartEntry>
  onAddToCart: () => Promise<void>
}

export function Selection({
  items,
  onRemove,
  onClear,
  onOfferPdf,
  cart,
  onAddToCart,
}: SelectionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (items.length === 0)
    return (
      <section className="selection selection--empty" aria-label="Auswahl">
        <strong className="selection__count">Auswahl</strong>
        <p className="selection__empty">
          Noch kein Reifen ausgewählt. Einen Haken an einem Angebot setzen – dann lässt sich daraus
          ein Angebot als PDF erstellen oder der Reifen in den Warenkorb legen.
        </p>
      </section>
    )

  const adding = items.some((i) => cart[offerKey(i.offer)]?.status === 'pending')
  // nothing left to put into a cart: a further click must not add the tyres a second time
  const allInCart = items.every((i) => cart[offerKey(i.offer)]?.status === 'ok')

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
          const entry = cart[offerKey(offer)]
          return (
            <li key={`${offer.shop}-${offer.shopArticleId}`} className="selection__item">
              <span className="selection__text">
                <span className="selection__name">
                  {`${name} · ${offer.width}/${offer.height} R${offer.rim}`}
                </span>
                <span className="selection__detail">
                  <ShopBadge shop={offer.shop} mini />
                  {`${item.quantity} Stk · ${formatEuro(offer.priceGrossCents)}`}
                </span>
                {entry?.status === 'pending' && (
                  <span className="selection__cart">wird in den Warenkorb gelegt …</span>
                )}
                {entry?.status === 'ok' && (
                  <span className="selection__cart selection__cart--ok">
                    <span aria-hidden="true">✓ </span>
                    <span>Im Warenkorb</span>
                  </span>
                )}
                {entry?.status === 'error' && (
                  <span className="selection__cart selection__cart--error" role="alert">
                    {entry.message}
                  </span>
                )}
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
        <button
          type="button"
          className="button button--confirm flyout__cart"
          onClick={onAddToCart}
          disabled={adding || allInCart}
        >
          {adding ? 'Wird abgelegt …' : 'In den Warenkorb'}
        </button>
        <button type="button" className="flyout__primary" onClick={makePdf} disabled={busy}>
          {busy ? 'PDF wird erstellt …' : 'Angebot als PDF'}
        </button>
      </div>
    </section>
  )
}
