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

export function TagGroup(_props: TagGroupProps) {
  return null
}
