import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PDF_TEXTS,
  MAX_EXTRAS,
  MAX_TEXT_LENGTH,
  parsePdfTexts,
} from '../../supabase/functions/_shared/pdf-texts.ts'

describe('DEFAULT_PDF_TEXTS', () => {
  it('holds the texts of the Excel template', () => {
    expect(DEFAULT_PDF_TEXTS.title).toBe('REIFEN - ANGEBOT')
    expect(DEFAULT_PDF_TEXTS.validity).toBe(
      '*Angebot nur an diesem Tag gültig, da Preisschwankungen bestehen',
    )
    expect(DEFAULT_PDF_TEXTS.extras).toHaveLength(5)
    expect(DEFAULT_PDF_TEXTS.extras[0]).toEqual({
      text: 'Räder umstecken PKW bis 17":',
      price: '€ 34,-',
    })
  })
})

describe('parsePdfTexts', () => {
  it('AC40: fills missing texts from the template and ignores unknown keys', () => {
    const t = parsePdfTexts({ title: 'ANGEBOT', unknown: 'x' })
    expect(t?.title).toBe('ANGEBOT')
    expect(t?.kunde).toBe(DEFAULT_PDF_TEXTS.kunde)
    expect(t).not.toHaveProperty('unknown')
  })

  it('AC38: drops empty extra rows', () => {
    const t = parsePdfTexts({
      extras: [
        { text: 'Felgen lackieren', price: '€ 80,-' },
        { text: '  ', price: '' },
      ],
    })
    expect(t?.extras).toEqual([{ text: 'Felgen lackieren', price: '€ 80,-' }])
  })

  it('AC40: rejects non-texts, too long texts and too many extra rows', () => {
    expect(parsePdfTexts(null)).toBeNull()
    expect(parsePdfTexts('x')).toBeNull()
    expect(parsePdfTexts({ title: 5 })).toBeNull()
    expect(parsePdfTexts({ title: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toBeNull()
    expect(parsePdfTexts({ extras: 'x' })).toBeNull()
    expect(parsePdfTexts({ extras: [{ text: 1, price: '' }] })).toBeNull()
    const many = Array.from({ length: MAX_EXTRAS + 1 }, (_, i) => ({ text: `Z${i}`, price: '1' }))
    expect(parsePdfTexts({ extras: many })).toBeNull()
  })
})
