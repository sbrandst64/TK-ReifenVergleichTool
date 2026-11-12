// Order and two filters above the result list (AC52), with the count of tyres shown.
import { type ListSort, type ListView } from '../list-view.ts'
import { TagGroup } from './TagGroup.tsx'

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: 'price', label: 'Preis' },
  { value: 'rating', label: 'ÖAMTC-Note' },
]

const FILTER_OPTIONS = [
  { value: 'onlyBoth', label: 'In beiden Shops' },
  { value: 'onlyNow', label: 'Sofort lagernd' },
] as const

export function ListTools({
  view,
  onChange,
  shown,
  total,
}: {
  view: ListView
  onChange: (view: ListView) => void
  /** Tyres left after the filters. */
  shown: number
  /** Tyres in the search result. */
  total: number
}) {
  const filters = FILTER_OPTIONS.filter((f) => view[f.value]).map((f) => f.value)
  return (
    <section className="list-tools" aria-label="Liste sortieren und filtern">
      <TagGroup
        label="Sortieren"
        mode="single"
        options={SORT_OPTIONS}
        selected={[view.sort]}
        onChange={([v]) => onChange({ ...view, sort: v as ListSort })}
      />
      <TagGroup
        label="Eingrenzen"
        mode="multi"
        options={[...FILTER_OPTIONS]}
        selected={filters}
        onChange={(v) =>
          onChange({ ...view, onlyBoth: v.includes('onlyBoth'), onlyNow: v.includes('onlyNow') })
        }
      />
      <p className="list-tools__count" data-testid="list-count">
        {shown === total ? `${total} Reifen` : `${shown} von ${total} Reifen`}
      </p>
    </section>
  )
}
