import { describe, expect, it } from 'vitest'
import { tyre } from '../../test/helpers/offers.ts'
import { buildOfferModel, formatAmount, offerFileName } from './offer-model.ts'

const today = new Date(2026, 10, 7) // 07.11.2026

const front = tyre({
  brand: 'Pirelli',
  profile: 'W Sotozero 3',
  width: 245,
  height: 45,
  rim: 19,
  loadIndex: '102',
  speedIndex: 'V',
  season: 'winter',
  priceGrossCents: 24370,
})
const rear = tyre({
  brand: 'Hankook',
  profile: 'IW 01',
  width: 275,
  height: 40,
  rim: 19,
  loadIndex: '105',
  speedIndex: 'V',
  season: 'winter',
  priceGrossCents: 27410,
})

describe('buildOfferModel', () => {
  it('AC32: date of today, every size once, pieces = sum of all lines', () => {
    const m = buildOfferModel(
      [
        { offer: front, quantity: 2 },
        { offer: rear, quantity: 2 },
        { offer: tyre({ width: 245, height: 45, rim: 19 }), quantity: 2 },
      ],
      today,
    )
    expect(m.date).toBe('07.11.2026')
    expect(m.dimension).toBe('245/45 R19, 275/40 R19')
    expect(m.pieces).toBe(6)
  })

  it('AC33: one line per tyre in selection order with label, size incl. LI/SI, pieces, unit price', () => {
    const m = buildOfferModel(
      [
        { offer: front, quantity: 2 },
        { offer: rear, quantity: 2 },
      ],
      today,
    )
    expect(m.lines).toEqual([
      { label: 'Pirelli W Sotozero 3', size: '245/45 R19 102V', quantity: 2, unitPrice: '243,70' },
      { label: 'Hankook IW 01', size: '275/40 R19 105V', quantity: 2, unitPrice: '274,10' },
    ])
  })

  it('AC33: ticks exactly the seasons of the chosen tyres', () => {
    const m = buildOfferModel(
      [
        { offer: front, quantity: 4 },
        { offer: tyre({ season: 'ganzjahr' }), quantity: 4 },
        { offer: tyre({ season: null }), quantity: 4 },
      ],
      today,
    )
    expect(m.seasons).toEqual({ sommer: false, winter: true, ganzjahr: true })
  })

  it('AC34: total = sum of pieces × unit price over all lines', () => {
    const m = buildOfferModel(
      [
        { offer: front, quantity: 2 },
        { offer: rear, quantity: 2 },
      ],
      today,
    )
    expect(m.totalCents).toBe(2 * 24370 + 2 * 27410)
    expect(m.total).toBe('1.035,60')
  })
})

describe('formatAmount', () => {
  it('uses a dot for thousands and a comma for cents (PDF-safe characters only)', () => {
    expect(formatAmount(0)).toBe('0,00')
    expect(formatAmount(24370)).toBe('243,70')
    expect(formatAmount(123456789)).toBe('1.234.567,89')
  })
})

describe('offerFileName', () => {
  it('names the file after the date', () => {
    expect(offerFileName(today)).toBe('Reifen-Angebot_2026-11-07.pdf')
  })
})
