import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PDF_TEXTS, type PdfTexts } from '../../supabase/functions/_shared/pdf-texts.ts'
import { tyre } from '../../test/helpers/offers.ts'
import { buildOfferModel } from './offer-model.ts'
import { createOfferPdf } from './offer-pdf.ts'

const header = new Uint8Array(readFileSync('public/angebot/kopf.jpg'))
const today = new Date(2026, 10, 7)

async function render(count: number, texts?: PdfTexts) {
  const items = Array.from({ length: count }, (_, i) => ({
    offer: tyre({ profile: `P${i + 1}`, season: 'winter', priceGrossCents: 10000 + i }),
    quantity: 4,
  }))
  const bytes = await createOfferPdf(buildOfferModel(items, today), header, texts)
  return PDFDocument.load(bytes)
}

/** Static page text as it is drawn: Standard-14 fonts write WinAnsi hex strings. */
function pageContent(page: PDFPage): string {
  const contents = page.node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
  return streams
    .map((ref) => page.doc.context.lookup(ref))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => inflateSync(Buffer.from(s.contents)).toString('latin1'))
    .join('\n')
    .toLowerCase()
}
const hex = (text: string) => Buffer.from(text, 'latin1').toString('hex')

describe('createOfferPdf', () => {
  it('AC32: customer fields are empty, fillable text fields; date, size and pieces are filled', async () => {
    const form = (await render(2)).getForm()
    for (const name of ['kunde', 'email', 'telefon']) {
      expect(form.getTextField(name).getText() ?? '').toBe('')
      expect(form.getTextField(name).isReadOnly()).toBe(false)
    }
    expect(form.getTextField('datum').getText()).toBe('07.11.2026')
    expect(form.getTextField('dimension').getText()).toBe('205/55 R16')
    expect(form.getTextField('stueck').getText()).toBe('4')
  })

  it('AC33/AC34: one editable row per tyre, season boxes; total sums all rows and stays editable', async () => {
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
    expect(form.getTextField('gesamtpreis').isReadOnly()).toBe(false)
  })

  it('AC34: a single tyre gets its total', async () => {
    expect((await render(1)).getForm().getTextField('gesamtpreis').getText()).toBe('400,00')
  })

  it('draws the template texts by default', async () => {
    const page = pageContent((await render(1)).getPage(0))
    expect(page).toContain(hex('REIFEN - ANGEBOT'))
    expect(page).toContain(hex('Räder einlagern:'))
  })

  it('AC37/AC38: uses the configured texts, extra rows only as information', async () => {
    const texts: PdfTexts = {
      ...DEFAULT_PDF_TEXTS,
      title: 'WINTERREIFEN - ANGEBOT',
      kunde: 'Firma:',
      extras: [{ text: 'Felgen lackieren', price: '€ 80,-' }],
    }
    const doc = await render(2, texts)
    const page = pageContent(doc.getPage(0))
    expect(page).toContain(hex('WINTERREIFEN - ANGEBOT'))
    expect(page).toContain(hex('Firma:'))
    expect(page).toContain(hex('Felgen lackieren'))
    expect(page).not.toContain(hex('Räder einlagern:'))
    // extras are information only: the total is the tyres alone
    expect(doc.getForm().getTextField('gesamtpreis').getText()).toBe('800,04')
  })

  it('copes with very long and non-Latin texts (shrinks, never throws)', async () => {
    const texts: PdfTexts = {
      ...DEFAULT_PDF_TEXTS,
      kunde: 'Name der Kundin oder des Kunden laut Ausweis:',
      title: 'Ангебот ' + 'X'.repeat(150),
      extras: Array.from({ length: 20 }, (_, i) => ({ text: `Zusatz ${i}`, price: '€ 1,-' })),
    }
    const doc = await render(3, texts)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
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
