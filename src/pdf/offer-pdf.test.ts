import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { tyre } from '../../test/helpers/offers.ts'
import { buildOfferModel } from './offer-model.ts'
import { createOfferPdf } from './offer-pdf.ts'

const header = new Uint8Array(readFileSync('public/angebot/kopf.jpg'))
const today = new Date(2026, 10, 7)

async function render(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({
    offer: tyre({ profile: `P${i + 1}`, season: 'winter', priceGrossCents: 10000 + i }),
    quantity: 4,
  }))
  const bytes = await createOfferPdf(buildOfferModel(items, today), header)
  return PDFDocument.load(bytes)
}

describe('createOfferPdf', () => {
  it('AC32: customer fields are empty, fillable text fields; date, size and pieces are filled', async () => {
    const form = (await render(2)).getForm()
    for (const name of ['kunde', 'email', 'telefon']) {
      expect(form.getTextField(name).getText() ?? '').toBe('')
      expect(form.getTextField(name).isReadOnly()).toBe(false)
    }
    expect(form.getTextField('datum').getText()).toBe('07.11.2026')
    expect(form.getTextField('dimension').getText()).toBe('205/55 R16')
    expect(form.getTextField('stueck').getText()).toBe('8')
  })

  it('AC33/AC34: one editable row per tyre, season boxes and the total', async () => {
    const form = (await render(2)).getForm()
    expect(form.getTextField('zeile1_reifen').getText()).toBe('Testmarke P1')
    expect(form.getTextField('zeile1_dimension').getText()).toBe('205/55 R16 91H')
    expect(form.getTextField('zeile1_stueck').getText()).toBe('4')
    expect(form.getTextField('zeile1_preis').getText()).toBe('100,00')
    expect(form.getTextField('zeile2_preis').getText()).toBe('100,01')
    expect(form.getCheckBox('saison_winter').isChecked()).toBe(true)
    expect(form.getCheckBox('saison_sommer').isChecked()).toBe(false)
    expect(form.getCheckBox('saison_ganzjahr').isChecked()).toBe(false)
    expect(form.getTextField('gesamtpreis').getText()).toBe('800,04')
  })

  it('AC33: 6 rows fit on one page; more rows continue on further pages without losing one', async () => {
    expect((await render(6)).getPageCount()).toBe(1)

    const big = await render(40)
    expect(big.getPageCount()).toBeGreaterThan(1)
    const form = big.getForm()
    for (let i = 1; i <= 40; i++) {
      expect(form.getTextField(`zeile${i}_reifen`).getText()).toBe(`Testmarke P${i}`)
    }
  })
})
