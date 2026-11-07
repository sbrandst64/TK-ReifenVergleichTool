// Offer PDF after the workshop's Excel template (spec 3.7). Built in the browser with pdf-lib:
// customer fields are fillable AcroForm fields, every prefilled value is a field too (editable).
import {
  PDFDocument,
  StandardFonts,
  TextAlignment,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFPage,
} from 'pdf-lib'
import type { OfferModel } from './offer-model.ts'

/** Texts from the template; change here if the workshop updates its form. */
export const OFFER_TEXT = {
  title: 'REIFEN - ANGEBOT',
  priceHead: 'VK-Preis  /  Stück',
  priceNote: ['inkl.  Montage auf Felge,', 'Wuchten und Altreifenentsorgung'],
  vatNote: 'alle Preise inkl.  MwSt.',
  validity: '*Angebot nur an diesem Tag gültig, da Preisschwankungen bestehen',
  /** Information only – never part of the total (AC34). */
  extras: [
    ['Räder umstecken PKW bis 17":', '€ 34,-'],
    ['Räder umstecken SUV/LLKW/ab 18":', '€ 36,-'],
    ['Räder einlagern:', '€ 32,-'],
    ['Räder waschen (maschinell):', '€ 15,-'],
    ['Räder TPMS Diagnose', '€ 15,-'],
  ],
} as const

const A4: [number, number] = [595.28, 841.89]
const LEFT = 50
const RIGHT = 545
const ROW_STEP = 24
const FIRST_ROW_TOP = 378 // first tyre row on page 1
const NEXT_ROW_TOP = 760 // first tyre row on continuation pages
const PAGE_BOTTOM = 60 // lowest row on a page without footer
const FOOTER_TOP = 258 // lowest row on the page that carries the footer
const INK = rgb(0.07, 0.09, 0.15)
const MUTED = rgb(0.29, 0.33, 0.39)
const LINE = rgb(0.45, 0.48, 0.53)
const FILL_HINT = rgb(0.93, 0.95, 1) // marks the fields the workshop fills in

interface Ctx {
  doc: PDFDocument
  form: PDFForm
  font: PDFFont
  bold: PDFFont
}

/** Standard PDF fonts only know Latin-1 (+ € and –); strip accents elsewhere instead of failing. */
export function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF€–]/g, (ch) => {
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    return /^[\x20-\x7E]+$/.test(plain) ? plain : '?'
  })
}

function label(page: PDFPage, ctx: Ctx, text: string, x: number, y: number, size = 11) {
  page.drawText(text, { x, y, size, font: ctx.bold, color: INK })
  const w = ctx.bold.widthOfTextAtSize(text, size)
  page.drawLine({ start: { x, y: y - 2 }, end: { x: x + w, y: y - 2 }, thickness: 0.8, color: INK })
}

function field(
  page: PDFPage,
  ctx: Ctx,
  name: string,
  value: string,
  box: { x: number; y: number; width: number; height?: number },
  opts: { size?: number; align?: TextAlignment; bold?: boolean; hint?: boolean } = {},
) {
  const height = box.height ?? 18
  const f = ctx.form.createTextField(name)
  f.addToPage(page, {
    x: box.x,
    y: box.y,
    width: box.width,
    height,
    font: opts.bold ? ctx.bold : ctx.font,
    borderWidth: 0,
    backgroundColor: opts.hint ? FILL_HINT : undefined,
    textColor: INK,
  })
  f.setFontSize(opts.size ?? 11)
  if (opts.align !== undefined) f.setAlignment(opts.align)
  if (value) f.setText(pdfSafe(value))
  page.drawLine({
    start: { x: box.x, y: box.y },
    end: { x: box.x + box.width, y: box.y },
    thickness: 0.6,
    color: LINE,
  })
}

function drawHead(
  page: PDFPage,
  ctx: Ctx,
  model: OfferModel,
  header: Awaited<ReturnType<PDFDocument['embedJpg']>>,
) {
  const width = RIGHT - LEFT
  const height = (width * header.height) / header.width
  page.drawImage(header, { x: LEFT, y: A4[1] - 28 - height, width, height })

  const titleSize = 20
  const tw = ctx.bold.widthOfTextAtSize(OFFER_TEXT.title, titleSize)
  label(page, ctx, OFFER_TEXT.title, (A4[0] - tw) / 2, 650, titleSize)

  const rows: [string, string, string, boolean][] = [
    ['Datum:', 'datum', model.date, false],
    ['Kunde:', 'kunde', '', true],
    ['E-Mail:', 'email', '', true],
    ['Tel:Nr:', 'telefon', '', true],
  ]
  rows.forEach(([text, name, value, hint], i) => {
    const y = 610 - i * 25
    label(page, ctx, text, LEFT, y)
    field(page, ctx, name, value, { x: 140, y: y - 4, width: 330 }, { hint })
  })

  label(page, ctx, 'Dimension:', LEFT, 505)
  field(page, ctx, 'dimension', model.dimension, { x: 140, y: 501, width: 255 })
  label(page, ctx, 'Stück:', 410, 505)
  field(
    page,
    ctx,
    'stueck',
    String(model.pieces),
    { x: 455, y: 501, width: 60 },
    {
      align: TextAlignment.Center,
    },
  )

  const seasons: [keyof OfferModel['seasons'], string, number][] = [
    ['sommer', 'Sommer', 140],
    ['winter', 'Winter', 220],
    ['ganzjahr', 'Ganzjahres', 296],
  ]
  for (const [key, text, x] of seasons) {
    const box = ctx.form.createCheckBox(`saison_${key}`)
    box.addToPage(page, { x, y: 459, width: 12, height: 12, borderWidth: 0.8, borderColor: INK })
    if (model.seasons[key]) box.check()
    page.drawText(text, { x: x + 17, y: 461, size: 10, font: ctx.bold, color: INK })
  }

  label(page, ctx, OFFER_TEXT.priceHead, 400, 470, 13)
  OFFER_TEXT.priceNote.forEach((t, i) =>
    page.drawText(t, { x: 400, y: 455 - i * 11, size: 8.5, font: ctx.font, color: INK }),
  )
  page.drawText(OFFER_TEXT.vatNote, { x: 400, y: 428, size: 8.5, font: ctx.bold, color: INK })

  label(page, ctx, 'Marke:', LEFT, 418)
}

function drawColumnHeads(page: PDFPage, ctx: Ctx, y: number) {
  const heads: [string, number][] = [
    ['Reifen', LEFT],
    ['Dimension', 288],
    ['Stk', 404],
    ['€ / Stk', 470],
  ]
  for (const [t, x] of heads) page.drawText(t, { x, y, size: 8, font: ctx.font, color: MUTED })
}

function drawRow(page: PDFPage, ctx: Ctx, model: OfferModel, index: number, y: number) {
  const line = model.lines[index]
  const n = index + 1
  field(page, ctx, `zeile${n}_reifen`, line.label, { x: LEFT, y, width: 232 }, { size: 10 })
  field(page, ctx, `zeile${n}_dimension`, line.size, { x: 288, y, width: 108 }, { size: 10 })
  field(
    page,
    ctx,
    `zeile${n}_stueck`,
    String(line.quantity),
    { x: 400, y, width: 34 },
    {
      size: 10,
      align: TextAlignment.Center,
    },
  )
  page.drawText('€', { x: 444, y: y + 5, size: 10, font: ctx.font, color: INK })
  field(
    page,
    ctx,
    `zeile${n}_preis`,
    line.unitPrice,
    { x: 456, y, width: 89 },
    {
      size: 10,
      align: TextAlignment.Right,
    },
  )
}

function drawFooter(page: PDFPage, ctx: Ctx, model: OfferModel) {
  page.drawRectangle({
    x: LEFT - 4,
    y: 226,
    width: RIGHT - LEFT + 8,
    height: 17,
    color: rgb(0.9, 0.9, 0.9),
  })
  page.drawText(OFFER_TEXT.validity, { x: LEFT, y: 231, size: 10.5, font: ctx.bold, color: INK })

  page.drawText('zusätzlich:', { x: LEFT, y: 202, size: 11, font: ctx.bold, color: INK })
  OFFER_TEXT.extras.forEach(([text, price], i) => {
    const y = 202 - i * 17
    page.drawText(text, { x: 130, y, size: 11, font: ctx.bold, color: INK })
    page.drawText(price, { x: 400, y, size: 11, font: ctx.bold, color: INK })
  })

  label(page, ctx, 'Gesamtpreis:', 300, 80, 14)
  page.drawText('€', { x: 420, y: 80, size: 13, font: ctx.bold, color: INK })
  field(
    page,
    ctx,
    'gesamtpreis',
    model.total,
    { x: 434, y: 74, width: 111, height: 22 },
    {
      size: 13,
      bold: true,
      align: TextAlignment.Right,
    },
  )
}

const rowsFit = (top: number, bottom: number) => Math.floor((top - bottom) / ROW_STEP) + 1

export async function createOfferPdf(
  model: OfferModel,
  headerJpg: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Reifen-Angebot ${model.date}`)
  const ctx: Ctx = {
    doc,
    form: doc.getForm(),
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const header = await doc.embedJpg(headerJpg)

  let page = doc.addPage(A4)
  drawHead(page, ctx, model, header)
  let top = FIRST_ROW_TOP
  drawColumnHeads(page, ctx, top + 20)

  let next = 0
  for (;;) {
    const remaining = model.lines.length - next
    if (remaining <= rowsFit(top, FOOTER_TOP)) {
      for (let i = 0; i < remaining; i++) drawRow(page, ctx, model, next + i, top - i * ROW_STEP)
      drawFooter(page, ctx, model)
      break
    }
    // Fill this page but leave at least one row for the page that carries the footer.
    const here = Math.min(remaining - 1, rowsFit(top, PAGE_BOTTOM))
    for (let i = 0; i < here; i++) drawRow(page, ctx, model, next + i, top - i * ROW_STEP)
    next += here
    page = doc.addPage(A4)
    page.drawText(`${OFFER_TEXT.title} vom ${model.date} (Fortsetzung)`, {
      x: LEFT,
      y: 800,
      size: 12,
      font: ctx.bold,
      color: INK,
    })
    top = NEXT_ROW_TOP
    drawColumnHeads(page, ctx, top + 20)
  }

  ctx.form.updateFieldAppearances(ctx.font)
  return doc.save()
}
