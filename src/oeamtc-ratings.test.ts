import { describe, expect, it } from 'vitest'
import { oeamtcRating, OEAMTC_TEST_URL } from './oeamtc-ratings.ts'

const tyre = (over: Partial<Parameters<typeof oeamtcRating>[0]> = {}) => ({
  brand: 'CONTINENTAL',
  profile: 'WinterContact TS 870',
  width: 185,
  height: 65,
  rim: 15,
  ...over,
})

describe('oeamtcRating (ÖAMTC Winterreifentest 2026, spec AC43)', () => {
  it('returns the overall grade and verdict of a tested tyre in a tested size', () => {
    expect(oeamtcRating(tyre())).toEqual({ grade: '2,2', verdict: 'gut' })
  })

  it('matches brand and model regardless of case, spaces and symbols', () => {
    expect(oeamtcRating(tyre({ brand: 'Continental', profile: 'WinterContact TS870' }))).toEqual({
      grade: '2,2',
      verdict: 'gut',
    })
    expect(
      oeamtcRating({
        brand: 'HANKOOK',
        profile: 'Winter i*cept RS3',
        width: 185,
        height: 65,
        rim: 15,
      }),
    ).toEqual({ grade: '3,1', verdict: 'befriedigend' })
  })

  it('gives no rating for a tested model in an untested size', () => {
    expect(oeamtcRating(tyre({ width: 205, height: 55, rim: 16 }))).toBeUndefined()
  })

  it('gives no rating for a model that was not tested', () => {
    expect(oeamtcRating(tyre({ profile: 'Alpin 6' }))).toBeUndefined()
    expect(oeamtcRating(tyre({ brand: 'MICHELIN' }))).toBeUndefined()
  })

  it('uses the 225/50 R17 table for that size', () => {
    expect(
      oeamtcRating({
        brand: 'PIRELLI',
        profile: 'Cinturato Winter 3',
        width: 225,
        height: 50,
        rim: 17,
      }),
    ).toEqual({ grade: '2,2', verdict: 'gut' })
  })

  it('links to the ÖAMTC test overview as source', () => {
    expect(OEAMTC_TEST_URL).toBe('https://www.oeamtc.at/tests/reifentest/winterreifentest-2026/')
  })
})
