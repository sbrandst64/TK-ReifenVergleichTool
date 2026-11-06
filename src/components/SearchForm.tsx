// Size as dropdowns, quantity/season/brand as tags (spec 3.1).
import { useState } from 'react'
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

export function SearchForm({
  onSearch,
}: {
  onSearch: (query: SearchQuery, shops: ShopId[]) => void
}) {
  const [provider, setProvider] = useState('beide')
  const [width, setWidth] = useState(DEFAULTS.width)
  const [height, setHeight] = useState(DEFAULTS.height)
  const [rim, setRim] = useState(DEFAULTS.rim)
  const [quantity, setQuantity] = useState(DEFAULTS.quantity)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [brands, setBrands] = useState<string[]>([])

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        const shops = provider === 'beide' ? [...SHOPS] : SHOPS.filter((s) => s === provider)
        onSearch({ width, height, rim, quantity, seasons, brands }, shops)
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
      <TagGroup
        label="Stückzahl"
        mode="single"
        className="tag-group--even"
        options={QUANTITIES.map((q) => ({ value: String(q), label: String(q) }))}
        selected={[String(quantity)]}
        onChange={([v]) => setQuantity(Number(v))}
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
