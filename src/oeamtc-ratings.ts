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
  ['GENERALTIRE', 'GENERAL'],
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
 * Names that mean the same tyre as an ÖAMTC name: [other spelling, ÖAMTC spelling]. Mostly how the
 * shops write it, a few are ÖAMTC's own second spelling. Collected by hand on 2026-11-09 from a
 * search of both shops for every tested brand in every tested size; only pairs that are clearly the
 * same tyre. Not included on purpose: versions for car makers (MO, AO, *, VOL …), run-flat and
 * Seal versions, and other generations (e.g. "Gen-2" vs "Gen-3"). The size must still match.
 */
export const NAME_VARIANTS: [string, string][] = [
  // Göggel puts Hankook's pattern codes into the name
  ['HANKOOK K 435 KINERGY eco 2', 'Hankook Kinergy Eco 2'],
  ['HANKOOK Kinergy 4S2 ( H 750 )', 'Hankook Kinergy 4S 2'],
  ['HANKOOK W 462 Winter i*cept RS 3', 'Hankook Winter i*cept RS3'],
  ['HANKOOK W 330 Winter i*cept evo3', 'Hankook Winter i*cept evo3 W330'],
  ['HANKOOK K 125 Ventus Prime 3', 'Hankook Ventus Prime 3'],
  ['Hankook ventus PRime 3 K125', 'Hankook Ventus Prime 3'], // ÖAMTC 2021
  ['HANKOOK RA 18 Vantra LT', 'Hankook Vantra LT'],
  // Göggel writes Kumho without the model line
  ['KUMHO WP52+', 'Kumho WinterCraft WP52+'],
  ['KUMHO WP52', 'Kumho WinterCraft WP52'],
  ['KUMHO PS71', 'Kumho Ecsta PS71'],
  ['KUMHO HS52', 'Kumho Ecsta HS52'],
  ['KUMHO ES31', 'KUMHO ecowing ES31'],
  ['KUMHO KC53', 'Kumho PorTran KC53'],
  ['KUMHO HA32+', 'Kumho Solus 4S HA32+'],
  // other short forms, pattern codes and typos
  ['NEXEN WG SNOW G 3 WH21', 'NEXEN WINGUARD SNOW´G3'],
  ['PIRELLI W Sottozero 3', 'PIRELLI WINTER SOTTOZERO 3'],
  ['PIRELLI P 1 Cinturato Verde', 'PIRELLI Cinturato P1 VERDE'],
  ['PIRELLI Scorpion All Terrain Plus', 'Pirelli Scorpion A/T+'],
  ['BRIDGESTONE A005 EVO', 'Bridgestone Weather Control A005-Evo'],
  ['BRIDGESTONE A005', 'Bridgestone Weather Control A005'],
  ['BRIDGESTONE Turanza All Sseason 6', 'Bridgestone Turanza All Season 6'],
  ['BRIDGESTONE Dueler All Terrain A/T002', 'Bridgestone Dueler A/T002'],
  ['GOODYEAR Vector 4 Seasons Generation 3', 'Goodyear Vector 4Seasons Gen-3'],
  ['GOODYEAR Vector 4 Seasons Generation 2', 'Goodyear Vector 4Seasons Gen-2'],
  ['CONTINENTAL Premiumcontact 5', 'Continental ContiPremiumContact 5'],
  ['FULDA Montero 3', 'FULDA KRISTALL MONTERO 3'],
  ['FALKEN ZIEX ZE310 EC', 'Falken ZIEX ZE310 ECORUN'],
  ['MAXXIS Mecotra 3 ME3', 'Maxxis Mecotra 3'],
  ['MAXXIS Premitra 5 HP5', 'Maxxis Premitra 5'],
  ['YOKOHAMA BluEarth-4S AW21', 'Yokohama BluEarth-4S'],
  ['BFGOODRICH Adavantage All-Season', 'BFGoodrich Advantage All-Season'],
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
    const key = `${variantOf(tyreKey(product))}|${size}`
    if (index.has(key)) continue
    const { label, url } = OEAMTC_TESTS[test]
    index.set(key, { grade, verdict, test: label, url: url + page })
  }
  return index
}

/** Stars like a review: 5,5 − grade, so 0,5 = 5 stars and 5,5 = 0 stars, exact to a tenth. */
export function oeamtcStars(grade: string): number {
  const tenths = Number(grade.replace(',', ''))
  return Math.min(50, Math.max(0, 55 - tenths)) / 10
}

const TONES = {
  'sehr gut': 'sehr-gut',
  gut: 'gut',
  befriedigend: 'befriedigend',
  genügend: 'genuegend',
  'nicht genügend': 'nicht-genuegend',
} as const

export type GradeTone = (typeof TONES)[keyof typeof TONES]

/** CSS colour name of an ÖAMTC verdict, undefined for an unknown one. */
export function gradeTone(verdict: string): GradeTone | undefined {
  return TONES[verdict as keyof typeof TONES]
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
