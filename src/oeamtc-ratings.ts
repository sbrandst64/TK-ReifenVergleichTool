// ÖAMTC tyre test result of an offer (AC43): all car tyre tests since 2018, imported from
// oeamtc.at by scripts/oeamtc-import.ts into oeamtc-data.ts. The match is exact: brand + model and
// size must fit, otherwise there is no result. A tyre tested more than once in the same size
// shows its newest test. Shown on screen only, never in the offer PDF.
import { normalizeToken } from '../supabase/functions/_shared/tire.ts'
import { OEAMTC_RESULTS, OEAMTC_TESTS } from './oeamtc-data.ts'

export interface OeamtcRating {
  /** Gesamtnote as printed by ÖAMTC, e.g. "2,2" (scale 0,5 – 5,5, lower is better). */
  grade: string
  /** Empfehlung for that grade, e.g. "gut". */
  verdict: string
  /** Test the result comes from, e.g. "Winter 2026". */
  test: string
  /** ÖAMTC page of this tyre in that test. */
  url: string
}

/** Brand names ÖAMTC writes longer than the shops do (compared without spaces and symbols). */
const BRAND_ALIASES: [string, string][] = [
  ['NOKIANTYRES', 'NOKIAN'],
  ['TOYOTIRES', 'TOYO'],
  ['COOPERTIRES', 'COOPER'],
]

/** Comparable key of "brand model": upper case, no spaces or symbols, known brand aliases.
 *  NFKD first, so superscript digits count as digits ("4S²" = "4S2"). */
export function tyreKey(name: string): string {
  const key = normalizeToken(name.normalize('NFKD'))
  for (const [long, short] of BRAND_ALIASES)
    if (key.startsWith(long)) return short + key.slice(long.length)
  return key
}

/**
 * Shop names that differ from ÖAMTC's spelling of the same tyre: [as a shop writes it, as ÖAMTC
 * writes it]. Collected by hand from searches of both shops in all tested sizes (2026-11-09);
 * only pairs that are clearly the same tyre. The size must still match.
 */
export const NAME_VARIANTS: [string, string][] = [
  // Göggel adds Hankook's pattern codes
  ['HANKOOK K 435 KINERGY eco 2', 'Hankook Kinergy Eco 2'],
  ['HANKOOK Kinergy 4S2 ( H 750 )', 'Hankook Kinergy 4S 2'],
  // Göggel abbreviates Nexen Winguard
  ['NEXEN WG SNOW G 3 WH21', 'NEXEN WINGUARD SNOW´G3'],
]

let variants: Map<string, string> | null = null
const variantOf = (key: string) => {
  variants ??= new Map(NAME_VARIANTS.map(([shop, oeamtc]) => [tyreKey(shop), tyreKey(oeamtc)]))
  return variants.get(key) ?? key
}

let index: Map<string, OeamtcRating> | null = null

function ratings(): Map<string, OeamtcRating> {
  if (index) return index
  index = new Map()
  // tests are newest first, so the first result for a tyre and size is the newest one
  const ordered = [...OEAMTC_RESULTS].sort((a, b) => a[0] - b[0])
  for (const [test, product, size, grade, verdict, page] of ordered) {
    const key = `${tyreKey(product)}|${size}`
    if (index.has(key)) continue
    const { label, url } = OEAMTC_TESTS[test]
    index.set(key, { grade, verdict, test: label, url: url + page })
  }
  return index
}

/** ÖAMTC result of a tyre, or undefined when that model was not tested in that size. */
export function oeamtcRating(tyre: {
  brand: string
  profile: string
  width: number
  height: number
  rim: number
}): OeamtcRating | undefined {
  const name = variantOf(tyreKey(`${tyre.brand} ${tyre.profile}`))
  return ratings().get(`${name}|${tyre.width}/${tyre.height} R${tyre.rim}`)
}
