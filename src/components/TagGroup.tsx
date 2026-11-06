// Selectable tags ("pills"). Multi mode toggles; single mode always keeps exactly one active.
// The active state is shown with a check mark, not only by colour (AC5a).
import { useId, useState } from 'react'

export interface TagOption {
  value: string
  label: string
}
export interface TagGroupProps {
  label: string
  options: TagOption[]
  selected: string[]
  onChange: (next: string[]) => void
  mode: 'single' | 'multi'
  /** Show only this many options (plus selected ones) until expanded. */
  collapsedCount?: number
  moreLabel?: string
}

export function TagGroup({
  label,
  options,
  selected,
  onChange,
  mode,
  collapsedCount,
  moreLabel = 'Alle anzeigen',
}: TagGroupProps) {
  const labelId = useId()
  const [expanded, setExpanded] = useState(false)
  const collapsed = collapsedCount !== undefined && !expanded && options.length > collapsedCount
  const visible = collapsed
    ? options.filter((o, i) => i < collapsedCount || selected.includes(o.value))
    : options

  const toggle = (value: string) => {
    if (mode === 'single') onChange([value])
    else
      onChange(
        selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
      )
  }

  return (
    <div className="tag-group" role="group" aria-labelledby={labelId}>
      <span className="tag-group__label" id={labelId}>
        {label}
      </span>
      <div className="tag-group__tags">
        {visible.map((o) => {
          const active = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              className={active ? 'tag tag--active' : 'tag'}
              aria-pressed={active}
              onClick={() => toggle(o.value)}
            >
              {active && <span aria-hidden="true">✓ </span>}
              {o.label}
            </button>
          )
        })}
        {collapsed && (
          <button type="button" className="tag tag--more" onClick={() => setExpanded(true)}>
            {moreLabel}
          </button>
        )}
      </div>
    </div>
  )
}
