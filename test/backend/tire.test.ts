import { describe, expect, it } from 'vitest'
import {
  normalizeToken,
  parseGoeggelSize,
  parseLoadSpeed,
  parseWeichbergerDescription,
  seasonFromGoeggelIcon,
} from '../../supabase/functions/_shared/tire.ts'

describe('parseWeichbergerDescription', () => {
  it.each([
    ['SUM 205/55R16 WT200 91H BLK 3PMSF M&S TL', 'WT200', '91', 'H'],
    ['BRI 205/55R16 TURANZA ALL SEASON 6 91H', 'TURANZA ALL SEASON 6', '91', 'H'],
    ['CON 205/55R16 WINTERCONTACT TS 870 94V', 'WINTERCONTACT TS 870', '94', 'V'],
    ['NOK 205/55R16 POWERPROOF 2 94V XL TL', 'POWERPROOF 2', '94', 'V'],
    ['SEM 205/55R16 SPEED-GRIP 5 91T EVC 3PMSF', 'SPEED-GRIP 5', '91', 'T'],
    ['MIC 205/55ZR16 PILOT SPORT 5 94Y XL', 'PILOT SPORT 5', '94', 'Y'],
  ])('%s', (desc, profile, li, si) => {
    expect(parseWeichbergerDescription(desc)).toEqual({
      width: 205,
      height: 55,
      rim: 16,
      profile,
      loadIndex: li,
      speedIndex: si,
    })
  })

  it('returns null for unparseable text', () => {
    expect(parseWeichbergerDescription('Schneekette XMR69')).toBeNull()
  })
})

describe('parseGoeggelSize', () => {
  it.each([
    ['205/55HR16TL', { width: 205, height: 55, rim: 16 }],
    ['205/55VR16TLXL', { width: 205, height: 55, rim: 16 }],
    ['225/45ZR17TLXL', { width: 225, height: 45, rim: 17 }],
    ['195/65R15TL', { width: 195, height: 65, rim: 15 }],
  ])('%s', (artikel, size) => {
    expect(parseGoeggelSize(artikel)).toEqual(size)
  })

  it('returns null for unparseable text', () => {
    expect(parseGoeggelSize('Ventil')).toBeNull()
  })
})

describe('parseLoadSpeed', () => {
  it.each([
    ['91 V  EA BMW', '91', 'V'],
    ['94 W', '94', 'W'],
    ['91H', '91', 'H'],
    ['98/96 H', '98/96', 'H'],
  ])('%s', (text, loadIndex, speedIndex) => {
    expect(parseLoadSpeed(text)).toEqual({ loadIndex, speedIndex })
  })

  it('returns null without load index', () => {
    expect(parseLoadSpeed('')).toBeNull()
    expect(parseLoadSpeed('XL')).toBeNull()
  })
})

describe('normalizeToken', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normalizeToken('Speed-Grip 5')).toBe(normalizeToken('SPEED-GRIP 5'))
    expect(normalizeToken('WinterContact TS 870')).toBe('WINTERCONTACTTS870')
  })

  it('keeps "+" distinguishable (Primacy 4 ≠ Primacy 4+)', () => {
    expect(normalizeToken('Primacy 4+')).toBe('PRIMACY4PLUS')
    expect(normalizeToken('Primacy 4+')).not.toBe(normalizeToken('Primacy 4'))
  })
})

describe('seasonFromGoeggelIcon', () => {
  it.each([
    ['./templates/goeggel1/images/sommer_15.png', 'sommer'],
    ['./templates/goeggel1/images/winter_15.png', 'winter'],
    ['./templates/goeggel1/images/allwetter_15.png', 'ganzjahr'],
    ['./templates/goeggel1/images/unbekannt.png', null],
  ])('%s', (src, season) => {
    expect(seasonFromGoeggelIcon(src)).toBe(season)
  })
})
