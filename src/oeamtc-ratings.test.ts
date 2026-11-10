import { describe, expect, it } from 'vitest'
import { OEAMTC_RESULTS, OEAMTC_TESTS } from './oeamtc-data.ts'
import { gradeTone, NAME_VARIANTS, oeamtcRating, oeamtcStars, tyreKey } from './oeamtc-ratings.ts'

const BASE = 'https://www.oeamtc.at/tests/reifentest/'
const tyre = (over: Partial<Parameters<typeof oeamtcRating>[0]> = {}) => ({
  brand: 'CONTINENTAL',
  profile: 'WinterContact TS 870',
  width: 185,
  height: 65,
  rim: 15,
  ...over,
})

describe('oeamtcRating (all ÖAMTC tyre tests 2018–2026, spec AC43)', () => {
  it('returns grade, verdict, test and the detail page of a tested tyre in a tested size', () => {
    expect(oeamtcRating(tyre())).toEqual({
      grade: '2,2',
      verdict: 'gut',
      test: 'Winter 2026',
      url: `${BASE}winterreifentest-2026/continental-wintercontact-ts-870-89453540`,
    })
  })

  it('the same tyre in another tested size gets the result of that test', () => {
    expect(oeamtcRating(tyre({ width: 205, height: 55, rim: 16 }))).toMatchObject({
      grade: '2,0',
      test: 'Winter 2024',
    })
  })

  it('a tyre tested several times in the same size shows the newest test', () => {
    // Pirelli Cinturato P1 Verde 185/65 R15: Sommer 2019 3,4 and Sommer 2022 2,3
    expect(
      oeamtcRating({
        brand: 'PIRELLI',
        profile: 'Cinturato P1 Verde',
        width: 185,
        height: 65,
        rim: 15,
      }),
    ).toMatchObject({ grade: '2,3', verdict: 'gut', test: 'Sommer 2022' })
  })

  it('finds older tests too', () => {
    expect(
      oeamtcRating({ brand: 'NEXEN', profile: 'N blue 4Season', width: 175, height: 65, rim: 14 }),
    ).toMatchObject({ grade: '2,7', verdict: 'befriedigend', test: 'Ganzjahr 2018' })
  })

  it('matches brand and model regardless of case, spaces and symbols', () => {
    expect(
      oeamtcRating(tyre({ brand: 'Continental', profile: 'WinterContact TS870' })),
    ).toMatchObject({
      grade: '2,2',
    })
    expect(
      oeamtcRating({
        brand: 'HANKOOK',
        profile: 'Winter i*cept RS3',
        width: 185,
        height: 65,
        rim: 15,
      }),
    ).toMatchObject({ grade: '3,1', verdict: 'befriedigend' })
  })

  it('knows that the shops write "Nokian" where ÖAMTC writes "Nokian Tyres"', () => {
    expect(
      oeamtcRating({ brand: 'NOKIAN', profile: 'Snowproof 2', width: 185, height: 65, rim: 15 }),
    ).toMatchObject({ grade: '3,8', test: 'Winter 2026' })
  })

  it('reads superscript digits as digits ("Kinergy 4S²" = "Kinergy 4S2")', () => {
    expect(
      oeamtcRating({ brand: 'HANKOOK', profile: 'Kinergy 4S2', width: 205, height: 55, rim: 16 }),
    ).toMatchObject({ grade: '2,7', test: 'Ganzjahr 2024' })
  })

  it.each([
    ['HANKOOK', 'K 435 KINERGY eco 2', '3,4', 'Sommer 2019'],
    ['HANKOOK', 'Kinergy 4S2 ( H 750 )', '3,0', 'Ganzjahr 2026'],
    ['NEXEN', 'WG SNOW G 3 WH21', '3,3', 'Winter 2022'],
  ])('knows the shop name "%s %s" (185/65 R15)', (brand, profile, grade, test) => {
    expect(oeamtcRating({ brand, profile, width: 185, height: 65, rim: 15 })).toMatchObject({
      grade,
      test,
    })
  })

  it('ÖAMTC itself writes a tyre two ways: both spellings reach the shop name', () => {
    const prime3 = { brand: 'HANKOOK', profile: 'K 125 Ventus Prime 3' }
    // ÖAMTC: "Hankook ventus PRime 3 K125" in 2021, "Hankook Ventus Prime 3" in 2020
    expect(oeamtcRating({ ...prime3, width: 205, height: 55, rim: 16 })).toMatchObject({
      grade: '2,7',
      test: 'Sommer 2021',
    })
    expect(oeamtcRating({ ...prime3, width: 235, height: 55, rim: 17 })).toMatchObject({
      grade: '2,7',
      test: 'Sommer 2020',
    })
  })

  it('knows that the shops write "General" where ÖAMTC writes "General Tire"', () => {
    expect(
      oeamtcRating({
        brand: 'GENERAL',
        profile: 'Altimax Winter 3',
        width: 195,
        height: 65,
        rim: 15,
      }),
    ).toMatchObject({ grade: '3,5', test: 'Winter 2021' })
  })

  it('special versions for car makers or run-flat are not the tested tyre', () => {
    expect(
      oeamtcRating({
        brand: 'PIRELLI',
        profile: 'W Sottozero 3 AO',
        width: 225,
        height: 50,
        rim: 17,
      }),
    ).toBeUndefined()
    expect(
      oeamtcRating({ brand: 'PIRELLI', profile: 'W Sottozero 3', width: 225, height: 50, rim: 17 }),
    ).toMatchObject({ grade: '3,3', test: 'Winter 2021' })
  })

  it('a name variant still needs the tested size', () => {
    expect(
      oeamtcRating({
        brand: 'NEXEN',
        profile: 'WG SNOW G 3 WH21',
        width: 205,
        height: 55,
        rim: 16,
      }),
    ).toBeUndefined()
  })

  it('gives no rating for a tested model in an untested size', () => {
    expect(oeamtcRating(tyre({ width: 195, height: 55, rim: 20 }))).toBeUndefined()
  })

  it('gives no rating for a model that was not tested', () => {
    expect(oeamtcRating(tyre({ profile: 'Alpin 6' }))).toBeUndefined()
    expect(oeamtcRating(tyre({ brand: 'MICHELIN' }))).toBeUndefined()
  })
})

describe('NAME_VARIANTS', () => {
  const tested = new Set(OEAMTC_RESULTS.map((r) => tyreKey(r[1])))

  it('every variant points to a tyre that ÖAMTC tested', () => {
    for (const [shopName, oeamtcName] of NAME_VARIANTS) {
      expect(tested.has(tyreKey(oeamtcName)), `${shopName} → ${oeamtcName}`).toBe(true)
    }
  })

  it('a variant is only needed when the names really differ', () => {
    for (const [shopName, oeamtcName] of NAME_VARIANTS) {
      expect(tyreKey(shopName), shopName).not.toBe(tyreKey(oeamtcName))
    }
  })
})

describe('ÖAMTC data (imported from oeamtc.at)', () => {
  const BANDS: [number, string][] = [
    [1.5, 'sehr gut'],
    [2.5, 'gut'],
    [3.5, 'befriedigend'],
    [4.5, 'genügend'],
    [5.5, 'nicht genügend'],
  ]
  const band = (grade: string) => BANDS.find(([max]) => Number(grade.replace(',', '.')) <= max)?.[1]

  it('has all 20 tests since 2018, newest first, each with its own page', () => {
    expect(OEAMTC_TESTS).toHaveLength(20)
    expect(OEAMTC_TESTS[0].label).toBe('Winter 2026')
    expect(new Set(OEAMTC_TESTS.map((t) => t.label)).size).toBe(20)
    expect(OEAMTC_TESTS.every((t) => t.url.startsWith('https://www.oeamtc.at/tests/'))).toBe(true)
  })

  it('has 488 results with a valid test, size, grade and the verdict of its grade band', () => {
    expect(OEAMTC_RESULTS).toHaveLength(488)
    for (const [test, product, size, grade, verdict] of OEAMTC_RESULTS) {
      expect(OEAMTC_TESTS[test], product).toBeDefined()
      expect(size, product).toMatch(/^\d{3}\/\d{2} R\d{2}$/)
      expect(grade, product).toMatch(/^\d,\d$/)
      expect(verdict, `${product} ${grade}`).toBe(band(grade))
    }
  })
})

describe('ÖAMTC grade as stars and colour (AC43)', () => {
  it('turns the grade (0,5 best – 5,5 worst) into 0–5 stars, linear, exact to a tenth', () => {
    expect(oeamtcStars('0,5')).toBe(5)
    expect(oeamtcStars('1,0')).toBe(4.5)
    expect(oeamtcStars('2,2')).toBe(3.3)
    expect(oeamtcStars('3,0')).toBe(2.5)
    expect(oeamtcStars('5,5')).toBe(0)
  })

  it('gives each ÖAMTC verdict its own colour, and every verdict in the data has one', () => {
    expect(gradeTone('sehr gut')).toBe('sehr-gut')
    expect(gradeTone('gut')).toBe('gut')
    expect(gradeTone('befriedigend')).toBe('befriedigend')
    expect(gradeTone('genügend')).toBe('genuegend')
    expect(gradeTone('nicht genügend')).toBe('nicht-genuegend')
    for (const [, product, , , verdict] of OEAMTC_RESULTS)
      expect(gradeTone(verdict), product).toBeDefined()
  })
})
