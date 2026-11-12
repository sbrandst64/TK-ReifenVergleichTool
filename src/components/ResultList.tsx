// One block per tyre, one row per shop offer (spec 3.3).
// Row layout: phone = shop + price on line 1, delivery/stock on line 2; wide = one line.
import { gradeTone, oeamtcRating, oeamtcStars, type OeamtcRating } from '../oeamtc-ratings.ts'
import type { OfferGroup } from '../../supabase/functions/_shared/matching.ts'
import type { ShopId, TireOffer } from '../../supabase/functions/_shared/types.ts'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import { SEASON_OPTIONS } from '../options.ts'

const seasonLabel = (s: string | null) => SEASON_OPTIONS.find((o) => o.value === s)?.label

/** Availability at a glance (AC30): green = in stock now, yellow = needs the slower stock,
    red = no stock (prepared; only in-stock offers are listed today). */
function availability(o: TireOffer): { tone: 'green' | 'yellow' | 'red'; label: string } {
  if (o.stockTotal <= 0) return { tone: 'red', label: 'Nicht lagernd' }
  if (o.delayed) return { tone: 'yellow', label: '2–3 Tage' }
  return { tone: 'green', label: 'Lagernd' }
}

function AvailabilityTag({ offer }: { offer: TireOffer }) {
  const { tone, label } = availability(offer)
  return <span className={`avail avail--${tone}`}>{label}</span>
}

/** Shop logo on a badge in the shop's colour, so the source is clear at a glance (AC28). */
export function ShopBadge({ shop, mini = false }: { shop: ShopId; mini?: boolean }) {
  return (
    <span className={`shop-badge shop-badge--${shop}${mini ? ' shop-badge--mini' : ''}`}>
      <img
        className="shop-badge__logo"
        src={`${import.meta.env.BASE_URL}logos/${shop}.png`}
        alt={SHOP_LABEL[shop]}
      />
    </span>
  )
}

/** ÖAMTC result in the offer row (AC43): logo, stars like a review, grade in the colour of its
    verdict, test name; one link to the ÖAMTC page of this tyre. Screen only, never in the PDF. */
function Rating({ rating }: { rating: OeamtcRating }) {
  const summary = `ÖAMTC-Test ${rating.test}: Gesamtnote ${rating.grade} (${rating.verdict})`
  const tone = gradeTone(rating.verdict)
  return (
    <a
      className="rating"
      href={rating.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={summary}
      title={`${summary} – ÖAMTC-Testseite öffnen`}
    >
      <img className="rating__logo" src={`${import.meta.env.BASE_URL}logos/oeamtc.png`} alt="" />
      <span className="stars" aria-hidden="true">
        <span
          className="stars__fill"
          style={{ width: `${Math.round(oeamtcStars(rating.grade) * 20)}%` }}
        />
      </span>
      <span className={`grade${tone ? ` grade--${tone}` : ''}`}>{rating.grade}</span>
      <span className="rating__test">{rating.test}</span>
    </a>
  )
}

export const offerKey = (o: TireOffer) => `${o.shop}-${o.shopArticleId}`

interface Selectable {
  /** Keys (offerKey) of the ticked offers. */
  selected?: ReadonlySet<string>
  onToggle?: (offer: TireOffer) => void
  /** Searched quantity: the price of the whole set stands under the unit price (AC51). */
  quantity?: number
}

function TyreGroup({
  group,
  selected,
  onToggle,
  quantity = 1,
}: { group: OfferGroup } & Selectable) {
  const first = group.offers[0]
  const compare = group.offers.length > 1
  const season = seasonLabel(group.offers.find((o) => o.season)?.season ?? null)
  const rating = oeamtcRating(first)
  return (
    <article className="tyre">
      <h2 className="tyre__title">
        {first.brand} {first.profile}
      </h2>
      <p className="tyre__meta">
        {first.width}/{first.height} R{first.rim} {first.loadIndex}
        {first.speedIndex}
        {season && ` · ${season}`}
      </p>
      <ul className="offers">
        {group.offers.map((o) => {
          const best = compare && o.cheapest
          const ticked = selected?.has(offerKey(o)) ?? false
          return (
            <li
              key={offerKey(o)}
              className={['offer', best && 'offer--best', ticked && 'offer--selected']
                .filter(Boolean)
                .join(' ')}
              data-delayed={String(o.delayed)}
            >
              {onToggle && (
                <label className="offer__select">
                  <input
                    type="checkbox"
                    checked={ticked}
                    aria-label={`${o.brand} ${o.profile} (${SHOP_LABEL[o.shop]}) auswählen`}
                    onChange={() => {
                      const { cheapest: _cheapest, ...offer } = o
                      onToggle(offer)
                    }}
                  />
                </label>
              )}
              <span className="offer__who">
                <ShopBadge shop={o.shop} />
                {best && (
                  <span className="badge">
                    {group.provisional ? 'Günstigster (vorläufig)' : 'Günstigster'}
                  </span>
                )}
              </span>
              <span className="offer__info">
                <AvailabilityTag offer={o} />
                <span className="offer__stock">
                  {/* the tag already says how long; keep only "Nebenlager" from the note */}
                  {o.delayed ? `${o.deliveryNote.replace(/\s*\(.*\)\s*$/, '')} · ` : ''}
                  {o.stockTotal} Stk
                </span>
                {!o.shippingConfigured && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="hint">Versand nicht hinterlegt</span>
                  </>
                )}
              </span>
              {rating && <Rating rating={rating} />}
              <span className="offer__price">
                <span className="offer__unit">{formatEuro(o.priceGrossCents)}</span>
                {quantity > 1 && (
                  <span className="offer__set">
                    {quantity} Stk: {formatEuro(quantity * o.priceGrossCents)}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

export function ResultList({
  groups,
  selected,
  onToggle,
  quantity,
}: { groups: OfferGroup[] } & Selectable) {
  if (groups.length === 0) return null
  return (
    <div className="results">
      {groups.map((g) => (
        <TyreGroup
          key={g.id}
          group={g}
          selected={selected}
          onToggle={onToggle}
          quantity={quantity}
        />
      ))}
    </div>
  )
}
