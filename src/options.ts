// Fixed option lists for the search form (spec 3.1, [Annahme] values).
import type { Season } from '../supabase/functions/_shared/types.ts'

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

export const WIDTHS = range(135, 335, 10)
export const HEIGHTS = range(25, 85, 5)
export const RIMS = range(13, 23, 1)
export const QUANTITIES = [1, 2, 4, 6, 8]
export const DEFAULTS = { width: 205, height: 55, rim: 16, quantity: 4 }

export const SEASON_OPTIONS: { value: Season; label: string }[] = [
  { value: 'sommer', label: 'Sommer' },
  { value: 'winter', label: 'Winter' },
  { value: 'ganzjahr', label: 'Ganzjahr' },
]

/** Start list from the Weichberger manufacturer filter (phase0-recon.md); most common first. */
export const BRANDS = [
  'MICHELIN',
  'CONTINENTAL',
  'SEMPERIT',
  'BRIDGESTONE',
  'GOODYEAR',
  'PIRELLI',
  'HANKOOK',
  'NOKIAN',
  'BARUM',
  'DEBICA',
  'DUNLOP',
  'FALKEN',
  'FIRESTONE',
  'FULDA',
  'KUMHO',
  'SAVA',
  'SUMITOMO',
  'UNIROYAL',
  'VREDESTEIN',
  'YOKOHAMA',
]
export const VISIBLE_BRANDS = 8
