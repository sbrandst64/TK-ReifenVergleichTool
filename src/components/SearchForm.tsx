// Size as dropdowns, quantity/season/brand as tags (spec 3.1).
import { useId, useState } from 'react'
import {
  SHOPS,
  type SearchQuery,
  type Season,
  type ShopId,
} from '../../supabase/functions/_shared/types.ts'
import {
  BRANDS,
  DEFAULTS,
  HEIGHTS,
  PROVIDER_OPTIONS,
  QUANTITIES,
  RIMS,
  SEASON_OPTIONS,
  VISIBLE_BRANDS,
  WIDTHS,
} from '../options.ts'
import { sizeLabel, type TyreSize } from '../recent-sizes.ts'
import { seasonForDate } from '../season-default.ts'
import { TagGroup } from './TagGroup.tsx'

function SizeSelect(props: {
  id: string
  label: string
  values: number[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="size__field">
      <label htmlFor={props.id}>{props.label}</label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      >
        {props.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The last searched sizes as buttons (AC53); a tap sets the size and searches at once. */
function RecentSizes({ sizes, onPick }: { sizes: TyreSize[]; onPick: (size: TyreSize) => void }) {
  const labelId = useId()
  if (sizes.length === 0) return null
  return (
    <div className="tag-group recent" role="group" aria-labelledby={labelId}>
      <span className="tag-group__label" id={labelId}>
        Zuletzt gesucht
      </span>
      <div className="tag-group__tags">
        {sizes.map((s) => (
          <button
            key={sizeLabel(s)}
            type="button"
            className="tag recent__size"
            onClick={() => onPick(s)}
          >
            {sizeLabel(s)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SearchForm({
  onSearch,
  onQuantityChange,
  recentSizes = [],
}: {
  onSearch: (query: SearchQuery, shops: ShopId[]) => void
  /** Tells the app the marked quantity at once, so a tick uses it without a new search (AC31). */
  onQuantityChange?: (quantity: number) => void
  /** Last searched sizes, newest first (AC53). */
  recentSizes?: TyreSize[]
}) {
  const [provider, setProvider] = useState('beide')
  const [width, setWidth] = useState(DEFAULTS.width)
  const [height, setHeight] = useState(DEFAULTS.height)
  const [rim, setRim] = useState(DEFAULTS.rim)
  const [quantity, setQuantity] = useState(DEFAULTS.quantity)
  // the season of the time of year is ticked when the page opens (AC54)
  const [seasons, setSeasons] = useState<Season[]>(() => seasonForDate(new Date()))
  const [brands, setBrands] = useState<string[]>([])

  const submit = (size: TyreSize) => {
    const shops = provider === 'beide' ? [...SHOPS] : SHOPS.filter((s) => s === provider)
    onSearch({ ...size, quantity, seasons, brands }, shops)
  }

  const pick = (size: TyreSize) => {
    setWidth(size.width)
    setHeight(size.height)
    setRim(size.rim)
    submit(size)
  }

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        submit({ width, height, rim })
      }}
    >
      <TagGroup
        label="Anbieter"
        mode="single"
        className="tag-group--even"
        options={PROVIDER_OPTIONS}
        selected={[provider]}
        onChange={([v]) => setProvider(v)}
      />
      <div className="size" aria-label="Reifengröße" role="group">
        <SizeSelect id="width" label="Breite" values={WIDTHS} value={width} onChange={setWidth} />
        <span className="size__sep" aria-hidden="true">
          /
        </span>
        <SizeSelect id="height" label="Höhe" values={HEIGHTS} value={height} onChange={setHeight} />
        <span className="size__sep" aria-hidden="true">
          R
        </span>
        <SizeSelect id="rim" label="Zoll" values={RIMS} value={rim} onChange={setRim} />
      </div>
      <RecentSizes sizes={recentSizes} onPick={pick} />
      <TagGroup
        label="Stückzahl"
        mode="single"
        className="tag-group--even"
        options={QUANTITIES.map((q) => ({ value: String(q), label: String(q) }))}
        selected={[String(quantity)]}
        onChange={([v]) => {
          setQuantity(Number(v))
          onQuantityChange?.(Number(v))
        }}
      />
      <TagGroup
        label="Saison"
        mode="multi"
        className="tag-group--even"
        options={SEASON_OPTIONS}
        selected={seasons}
        onChange={(v) => setSeasons(v as Season[])}
      />
      <TagGroup
        label="Marke"
        mode="multi"
        options={BRANDS.map((b) => ({ value: b, label: b }))}
        selected={brands}
        onChange={setBrands}
        collapsedCount={VISIBLE_BRANDS}
        moreLabel="Alle Marken anzeigen"
      />
      <button type="submit" className="search__submit">
        Suchen
      </button>
    </form>
  )
}
