// Offer PDF after the workshop's Excel template (spec 3.7). Built in the browser with pdf-lib:
// customer fields are fillable AcroForm fields, every prefilled value is a field too (editable).
// All static texts come from the central settings (PdfTexts, AC37); defaults = Excel template.
import {
  PDFDocument,
  StandardFonts,
  TextAlignment,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
import { DEFAULT_PDF_TEXTS, type PdfTexts } from '../../supabase/functions/_shared/pdf-texts.ts'
import type { OfferModel } from './offer-model.ts'

const A4: [number, number] = [595.28, 841.89]
const LEFT = 50
const RIGHT = 545
const ROW_STEP = 24
const FIRST_ROW_TOP = 378 // first tyre row on page 1
const NEXT_ROW_TOP = 760 // first tyre row on continuation pages
const PAGE_BOTTOM = 60 // lowest row on a page without footer
const EXTRA_STEP = 17
const TOTAL_Y = 80
const INK = rgb(0.07, 0.09, 0.15)
const MUTED = rgb(0.29, 0.33, 0.39)
const LINE = rgb(0.45, 0.48, 0.53)
const FILL_HINT = rgb(0.93, 0.95, 1) // marks the fields the workshop fills in

interface Ctx {
  form: PDFForm
  font: PDFFont
  bold: PDFFont
  texts: PdfTexts
}

/** Standard PDF fonts only know Latin-1 (+ € and –); strip accents elsewhere instead of failing. */
export function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF€–]/g, (ch) => {
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    return /^[\x20-\x7E]+$/.test(plain) ? plain : '?'
  })
}

/** Font size at which the text fits into maxWidth (never below 6 pt), so edited texts never overlap. */
function fitSize(font: PDFFont, text: string, size: number, maxWidth: number): number {
  let s = size
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5
  return s
}

function text(
  page: PDFPage,
  ctx: Ctx,
  value: string,
  at: { x: number; y: number; size: number; maxWidth: number; bold?: boolean; color?: typeof INK },
): number {
  const font = at.bold ? ctx.bold : ctx.font
  const safe = pdfSafe(value)
  const size = fitSize(font, safe, at.size, at.maxWidth)
  page.drawText(safe, { x: at.x, y: at.y, size, font, color: at.color ?? INK })
  return font.widthOfTextAtSize(safe, size)
}

/** Bold, underlined label like in the Excel template. */
function label(
  page: PDFPage,
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
) {
  const w = text(page, ctx, value, { x, y, size, maxWidth, bold: true })
  if (w > 0)
    page.drawLine({
      start: { x, y: y - 2 },
      end: { x: x + w, y: y - 2 },
      thickness: 0.8,
      color: INK,
    })
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

function drawHead(page: PDFPage, ctx: Ctx, model: OfferModel, header: PDFImage) {
  const t = ctx.texts
  const width = RIGHT - LEFT
  const height = (width * header.height) / header.width
  page.drawImage(header, { x: LEFT, y: A4[1] - 28 - height, width, height })

  const title = pdfSafe(t.title)
  const titleSize = fitSize(ctx.bold, title, 20, width)
  const tw = ctx.bold.widthOfTextAtSize(title, titleSize)
  label(page, ctx, title, (A4[0] - tw) / 2, 650, titleSize, width)

  const rows: [string, string, string, boolean][] = [
    [t.datum, 'datum', model.date, false],
    [t.kunde, 'kunde', '', true],
    [t.email, 'email', '', true],
    [t.telefon, 'telefon', '', true],
  ]
  rows.forEach(([caption, name, value, hint], i) => {
    const y = 610 - i * 25
    label(page, ctx, caption, LEFT, y, 11, 85)
    field(page, ctx, name, value, { x: 140, y: y - 4, width: 330 }, { hint })
  })

  label(page, ctx, t.dimension, LEFT, 505, 11, 85)
  field(page, ctx, 'dimension', model.dimension, { x: 140, y: 501, width: 255 })
  label(page, ctx, t.stueck, 410, 505, 11, 42)
  field(
    page,
    ctx,
    'stueck',
    model.pieces,
    { x: 455, y: 501, width: 60 },
    {
      align: TextAlignment.Center,
    },
  )

  const seasons: [keyof OfferModel['seasons'], string, number, number][] = [
    ['sommer', t.sommer, 140, 60],
    ['winter', t.winter, 220, 56],
    ['ganzjahr', t.ganzjahr, 296, 82],
  ]
  for (const [key, caption, x, maxWidth] of seasons) {
    const box = ctx.form.createCheckBox(`saison_${key}`)
    box.addToPage(page, { x, y: 459, width: 12, height: 12, borderWidth: 0.8, borderColor: INK })
    if (model.seasons[key]) box.check()
    text(page, ctx, caption, { x: x + 17, y: 461, size: 10, maxWidth, bold: true })
  }

  label(page, ctx, t.priceHead, 400, 470, 13, 145)
  text(page, ctx, t.priceNote1, { x: 400, y: 455, size: 8.5, maxWidth: 145 })
  text(page, ctx, t.priceNote2, { x: 400, y: 444, size: 8.5, maxWidth: 145 })
  text(page, ctx, t.vatNote, { x: 400, y: 428, size: 8.5, maxWidth: 145, bold: true })

  label(page, ctx, t.marke, LEFT, 418, 11, 300)
}

function drawColumnHeads(page: PDFPage, ctx: Ctx, y: number) {
  const t = ctx.texts
  const heads: [string, number, number][] = [
    [t.colReifen, LEFT, 230],
    [t.colDimension, 288, 106],
    [t.colStueck, 404, 30],
    [t.colPreis, 470, 75],
  ]
  for (const [caption, x, maxWidth] of heads)
    text(page, ctx, caption, { x, y, size: 8, maxWidth, color: MUTED })
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

/** Footer grows with the number of extra rows; returns the y of its validity line. */
function footerLayout(extras: number) {
  const firstExtraY = extras > 0 ? TOTAL_Y + 50 + (extras - 1) * EXTRA_STEP : TOTAL_Y + 25
  const validityY = firstExtraY + 29
  return { firstExtraY, validityY, lowestRow: validityY + 27 }
}

function drawFooter(page: PDFPage, ctx: Ctx, model: OfferModel) {
  const t = ctx.texts
  const { firstExtraY, validityY } = footerLayout(t.extras.length)
  if (t.validity.trim()) {
    page.drawRectangle({
      x: LEFT - 4,
      y: validityY - 5,
      width: RIGHT - LEFT + 8,
      height: 17,
      color: rgb(0.9, 0.9, 0.9),
    })
    text(page, ctx, t.validity, {
      x: LEFT,
      y: validityY,
      size: 10.5,
      maxWidth: RIGHT - LEFT,
      bold: true,
    })
  }

  if (t.extras.length > 0)
    text(page, ctx, t.extrasLabel, { x: LEFT, y: firstExtraY, size: 11, maxWidth: 76, bold: true })
  t.extras.forEach((extra, i) => {
    const y = firstExtraY - i * EXTRA_STEP
    text(page, ctx, extra.text, { x: 130, y, size: 11, maxWidth: 262, bold: true })
    text(page, ctx, extra.price, { x: 400, y, size: 11, maxWidth: 145, bold: true })
  })

  label(page, ctx, t.gesamtpreis, 300, TOTAL_Y, 14, 115)
  page.drawText('€', { x: 420, y: TOTAL_Y, size: 13, font: ctx.bold, color: INK })
  field(
    page,
    ctx,
    'gesamtpreis',
    model.total,
    { x: 434, y: TOTAL_Y - 6, width: 111, height: 22 },
    {
      size: 13,
      bold: true,
      align: TextAlignment.Right,
      // highlighted only if there is no sum to show
      hint: model.total === '',
    },
  )
}

const rowsFit = (top: number, bottom: number) =>
  top >= bottom ? Math.floor((top - bottom) / ROW_STEP) + 1 : 0

export async function createOfferPdf(
  model: OfferModel,
  headerJpg: Uint8Array,
  texts: PdfTexts = DEFAULT_PDF_TEXTS,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(pdfSafe(`${texts.title} ${model.date}`))
  const ctx: Ctx = {
    form: doc.getForm(),
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    texts,
  }
  const header = await doc.embedJpg(headerJpg)
  const footerLowestRow = footerLayout(texts.extras.length).lowestRow

  let page = doc.addPage(A4)
  drawHead(page, ctx, model, header)
  let top = FIRST_ROW_TOP
  drawColumnHeads(page, ctx, top + 20)

  let next = 0
  for (;;) {
    const remaining = model.lines.length - next
    if (remaining <= rowsFit(top, footerLowestRow)) {
      for (let i = 0; i < remaining; i++) drawRow(page, ctx, model, next + i, top - i * ROW_STEP)
      drawFooter(page, ctx, model)
      break
    }
    // Fill this page; keep one row back so the footer never stands alone on the last page.
    let here = Math.min(remaining, rowsFit(top, PAGE_BOTTOM))
    if (here === remaining && rowsFit(NEXT_ROW_TOP, footerLowestRow) >= 1) here--
    for (let i = 0; i < here; i++) drawRow(page, ctx, model, next + i, top - i * ROW_STEP)
    next += here
    page = doc.addPage(A4)
    text(page, ctx, `${texts.title} - ${model.date} ${texts.continuation}`, {
      x: LEFT,
      y: 800,
      size: 12,
      maxWidth: RIGHT - LEFT,
      bold: true,
    })
    top = NEXT_ROW_TOP
    drawColumnHeads(page, ctx, top + 20)
  }

  ctx.form.updateFieldAppearances(ctx.font)
  return doc.save()
}
