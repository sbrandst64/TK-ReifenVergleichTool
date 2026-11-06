// One block per tyre, one row per shop offer (spec 3.3).
// Row layout: phone = shop + price on line 1, delivery/stock on line 2; wide = one line.
import type { OfferGroup } from '../../supabase/functions/_shared/matching.ts'
import type { ShopId } from '../../supabase/functions/_shared/types.ts'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import { SEASON_OPTIONS } from '../options.ts'

const seasonLabel = (s: string | null) => SEASON_OPTIONS.find((o) => o.value === s)?.label

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
              className={['offer', best && 'offer--best', o.delayed && 'offer--delayed']
                .filter(Boolean)
                .join(' ')}
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
                <span className="offer__delivery">{o.deliveryNote}</span>
                <span> · {o.stockTotal} Stk lagernd</span>
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
