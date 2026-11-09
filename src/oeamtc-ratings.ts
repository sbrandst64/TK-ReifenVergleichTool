// ÖAMTC Winterreifentest 2026: Gesamtnote je getestetem Modell (AC43).
// Eingetragen aus der ÖAMTC-Ergebnistabelle (PDF und Testseite, Stand 2026-11-09). Die Zuordnung ist
// exakt: Marke, Modell und Größe müssen zusammenpassen, sonst gibt es keinen Wert. Jeder Eintrag
// stammt aus der Tabelle; neue Tests bitte nur mit der Quelle hier ergänzen.
import { normalizeToken } from '../supabase/functions/_shared/tire.ts'

export const OEAMTC_TEST_URL = 'https://www.oeamtc.at/tests/reifentest/winterreifentest-2026/'

export interface OeamtcRating {
  /** Gesamtnote as printed by ÖAMTC, e.g. "2,2" (scale 0,5 bis 5,5, lower is better). */
  grade: string
  /** Urteil word from the Notengrenzen, e.g. "gut". */
  verdict: string
}

interface Entry extends OeamtcRating {
  brand: string
  model: string
  /** Tested size as the shops write it, e.g. "185/65 R15". */
  size: string
}

const SIZE_185 = '185/65 R15'
const SIZE_225 = '225/50 R17'

const ENTRIES: Entry[] = [
  // 185/65 R15
  {
    brand: 'Continental',
    model: 'WinterContact TS 870',
    size: SIZE_185,
    grade: '2,2',
    verdict: 'gut',
  },
  { brand: 'Michelin', model: 'Alpin 7', size: SIZE_185, grade: '2,5', verdict: 'gut' },
  {
    brand: 'Hankook',
    model: 'Winter i*cept RS3',
    size: SIZE_185,
    grade: '3,1',
    verdict: 'befriedigend',
  },
  {
    brand: 'Linglong',
    model: 'Sport Master Winter',
    size: SIZE_185,
    grade: '3,1',
    verdict: 'befriedigend',
  },
  {
    brand: 'Optimo',
    model: 'Winter Touring OW41',
    size: SIZE_185,
    grade: '3,2',
    verdict: 'befriedigend',
  },
  {
    brand: 'Goodyear',
    model: 'UltraGrip Performance 3',
    size: SIZE_185,
    grade: '3,3',
    verdict: 'befriedigend',
  },
  {
    brand: 'GT Radial',
    model: 'WinterPro2 Evo',
    size: SIZE_185,
    grade: '3,5',
    verdict: 'befriedigend',
  },
  {
    brand: 'Bridgestone',
    model: 'Blizzak LM 005',
    size: SIZE_185,
    grade: '3,8',
    verdict: 'genügend',
  },
  {
    brand: 'Nokian Tyres',
    model: 'Snowproof 2',
    size: SIZE_185,
    grade: '3,8',
    verdict: 'genügend',
  },
  { brand: 'Vredestein', model: 'Wintrac', size: SIZE_185, grade: '3,8', verdict: 'genügend' },
  { brand: 'Barum', model: 'Polaris 6', size: SIZE_185, grade: '3,8', verdict: 'genügend' },
  { brand: 'Kumho', model: 'WinterCraft WP52+', size: SIZE_185, grade: '3,9', verdict: 'genügend' },
  { brand: 'Viking', model: 'WinTech NewGen', size: SIZE_185, grade: '3,9', verdict: 'genügend' },
  {
    brand: 'Sunny',
    model: 'Winter-max NW611',
    size: SIZE_185,
    grade: '4,8',
    verdict: 'nicht genügend',
  },
  {
    brand: 'Atlas',
    model: 'Polarbear HP',
    size: SIZE_185,
    grade: '5,5',
    verdict: 'nicht genügend',
  },
  {
    brand: 'Rockblade',
    model: 'Rock 868S',
    size: SIZE_185,
    grade: '5,5',
    verdict: 'nicht genügend',
  },
  // 225/50 R17
  { brand: 'Pirelli', model: 'Cinturato Winter 3', size: SIZE_225, grade: '2,2', verdict: 'gut' },
  {
    brand: 'Continental',
    model: 'WinterContact TS 870',
    size: SIZE_225,
    grade: '2,3',
    verdict: 'gut',
  },
  {
    brand: 'Goodyear',
    model: 'UltraGrip Performance 3',
    size: SIZE_225,
    grade: '2,4',
    verdict: 'gut',
  },
  { brand: 'Michelin', model: 'Alpin 7', size: SIZE_225, grade: '2,5', verdict: 'gut' },
  {
    brand: 'Bridgestone',
    model: 'Blizzak 6',
    size: SIZE_225,
    grade: '2,6',
    verdict: 'befriedigend',
  },
  {
    brand: 'Hankook',
    model: 'Winter i*cept RS3',
    size: SIZE_225,
    grade: '2,7',
    verdict: 'befriedigend',
  },
  {
    brand: 'ESA+TECAR',
    model: 'Supergrip Pro2',
    size: SIZE_225,
    grade: '2,7',
    verdict: 'befriedigend',
  },
  { brand: 'Dunlop', model: 'Winter', size: SIZE_225, grade: '2,9', verdict: 'befriedigend' },
  {
    brand: 'Yokohama',
    model: 'BluEarth Winter V906',
    size: SIZE_225,
    grade: '3,1',
    verdict: 'befriedigend',
  },
  {
    brand: 'Vredestein',
    model: 'Wintrac Pro+',
    size: SIZE_225,
    grade: '3,1',
    verdict: 'befriedigend',
  },
  {
    brand: 'Falken',
    model: 'Eurowinter HS02 Pro',
    size: SIZE_225,
    grade: '4,8',
    verdict: 'nicht genügend',
  },
  {
    brand: 'Toyo Tires',
    model: 'Observe EWS1',
    size: SIZE_225,
    grade: '5,3',
    verdict: 'nicht genügend',
  },
  {
    brand: 'Tracmax',
    model: 'Ice-Plus S210',
    size: SIZE_225,
    grade: '5,4',
    verdict: 'nicht genügend',
  },
  { brand: 'Aptany', model: 'RW211', size: SIZE_225, grade: '5,4', verdict: 'nicht genügend' },
  {
    brand: 'Royal Black',
    model: 'Royalwinter UHP',
    size: SIZE_225,
    grade: '5,5',
    verdict: 'nicht genügend',
  },
  { brand: 'Sunwide', model: 'Snowide', size: SIZE_225, grade: '5,5', verdict: 'nicht genügend' },
]

/** Rating of a tyre from the ÖAMTC winter test, or undefined when that model and size were not tested. */
export function oeamtcRating(tyre: {
  brand: string
  profile: string
  width: number
  height: number
  rim: number
}): OeamtcRating | undefined {
  const size = `${tyre.width}/${tyre.height} R${tyre.rim}`
  const brand = normalizeToken(tyre.brand)
  const model = normalizeToken(tyre.profile)
  const hit = ENTRIES.find(
    (e) =>
      e.size === size && normalizeToken(e.brand) === brand && normalizeToken(e.model) === model,
  )
  return hit ? { grade: hit.grade, verdict: hit.verdict } : undefined
}
