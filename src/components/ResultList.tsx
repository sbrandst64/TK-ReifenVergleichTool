// One card per tyre, one row per shop offer (spec 3.3).
import type { OfferGroup } from '../../supabase/functions/_shared/matching.ts'
import { formatEuro, SHOP_LABEL } from '../messages.ts'
import { SEASON_OPTIONS } from '../options.ts'

const seasonLabel = (s: string | null) => SEASON_OPTIONS.find((o) => o.value === s)?.label

function GroupCard({ group }: { group: OfferGroup }) {
  const first = group.offers[0]
  const compare = group.offers.length > 1
  const season = seasonLabel(group.offers.find((o) => o.season)?.season ?? null)
  return (
    <article className="card">
      <header className="card__head">
        <h2 className="card__title">
          {first.brand} {first.profile}
        </h2>
        <p className="card__meta">
          {first.width}/{first.height} R{first.rim} {first.loadIndex}
          {first.speedIndex}
          {season && ` · ${season}`}
        </p>
      </header>
      <ul className="offers">
        {group.offers.map((o) => (
          <li
            key={`${o.shop}-${o.shopArticleId}`}
            className={[
              'offer',
              o.delayed && 'offer--delayed',
              compare && o.cheapest && 'offer--best',
            ]
              .filter(Boolean)
              .join(' ')}
            data-delayed={String(o.delayed)}
          >
            <span className={`shop shop--${o.shop}`}>{SHOP_LABEL[o.shop]}</span>
            <span className="offer__price">{formatEuro(o.priceGrossCents)}</span>
            {compare && o.cheapest && (
              <span className="badge">
                {group.provisional ? 'Günstigster (vorläufig)' : 'Günstigster'}
              </span>
            )}
            <span className="offer__stock">
              {o.deliveryNote} · {o.stockTotal} Stk lagernd
            </span>
            {!o.shippingConfigured && <span className="hint">Versand nicht hinterlegt</span>}
          </li>
        ))}
      </ul>
    </article>
  )
}

export function ResultList({ groups }: { groups: OfferGroup[] }) {
  if (groups.length === 0) return null
  return (
    <section className="results" aria-label="Ergebnisse">
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} />
      ))}
    </section>
  )
}
