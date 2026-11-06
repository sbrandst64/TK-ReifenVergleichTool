// One block per tyre, one row per shop offer (spec 3.3).
// Row layout: phone = shop + price on line 1, delivery/stock on line 2; wide = one line.
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
function ShopBadge({ shop }: { shop: ShopId }) {
  return (
    <span className={`shop-badge shop-badge--${shop}`}>
      <img
        className="shop-badge__logo"
        src={`${import.meta.env.BASE_URL}logos/${shop}.png`}
        alt={SHOP_LABEL[shop]}
      />
    </span>
  )
}

function TyreGroup({ group }: { group: OfferGroup }) {
  const first = group.offers[0]
  const compare = group.offers.length > 1
  const season = seasonLabel(group.offers.find((o) => o.season)?.season ?? null)
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
          return (
            <li
              key={`${o.shop}-${o.shopArticleId}`}
              className={best ? 'offer offer--best' : 'offer'}
              data-delayed={String(o.delayed)}
            >
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
              <span className="offer__price">{formatEuro(o.priceGrossCents)}</span>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

export function ResultList({ groups }: { groups: OfferGroup[] }) {
  if (groups.length === 0) return null
  return (
    <div className="results">
      {groups.map((g) => (
        <TyreGroup key={g.id} group={g} />
      ))}
    </div>
  )
}
