// The last searched tyre sizes (AC53), kept in this browser so the next search is one tap.
// Storage may be missing or blocked (private mode); the list is then simply empty.
export interface TyreSize {
  width: number
  height: number
  rim: number
}

const KEY = 'letzte-groessen'
const MAX = 5

const isSize = (v: unknown): v is TyreSize =>
  typeof v === 'object' &&
  v !== null &&
  (['width', 'height', 'rim'] as const).every((k) =>
    Number.isInteger((v as Record<string, unknown>)[k]),
  )

const same = (a: TyreSize, b: TyreSize) =>
  a.width === b.width && a.height === b.height && a.rim === b.rim

export const sizeLabel = (s: TyreSize) => `${s.width}/${s.height} R${s.rim}`

export function loadRecentSizes(): TyreSize[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored
      .filter(isSize)
      .map(({ width, height, rim }) => ({ width, height, rim }))
      .slice(0, MAX)
  } catch {
    return []
  }
}

/** Puts the size in front (once) and returns the new list, newest first. */
export function rememberSize(size: TyreSize): TyreSize[] {
  const { width, height, rim } = size
  const next = [{ width, height, rim }, ...loadRecentSizes().filter((s) => !same(s, size))].slice(
    0,
    MAX,
  )
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // not stored: the list lasts for this page only
  }
  return next
}
