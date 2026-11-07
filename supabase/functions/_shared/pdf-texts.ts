// Editable texts of the offer PDF (spec 3.7, AC36–AC40). Shared by the settings service
// (validation) and the frontend (dialog + PDF), so both agree on keys and limits.

export const MAX_TEXT_LENGTH = 200
export const MAX_EXTRAS = 20

export interface ExtraLine {
  text: string
  price: string
}

/** Every single-line text of the PDF, in the order the settings dialog shows them. */
export const PDF_TEXT_FIELDS = [
  { key: 'title', label: 'Titel', group: 'Kopf' },
  { key: 'datum', label: 'Beschriftung Datum', group: 'Kopf' },
  { key: 'kunde', label: 'Beschriftung Kunde', group: 'Kopf' },
  { key: 'email', label: 'Beschriftung E-Mail', group: 'Kopf' },
  { key: 'telefon', label: 'Beschriftung Telefon', group: 'Kopf' },
  { key: 'dimension', label: 'Beschriftung Dimension', group: 'Kopf' },
  { key: 'stueck', label: 'Beschriftung Stück', group: 'Kopf' },
  { key: 'sommer', label: 'Saison Sommer', group: 'Saison' },
  { key: 'winter', label: 'Saison Winter', group: 'Saison' },
  { key: 'ganzjahr', label: 'Saison Ganzjahr', group: 'Saison' },
  { key: 'priceHead', label: 'Preisblock Überschrift', group: 'Preisblock' },
  { key: 'priceNote1', label: 'Preisblock Zeile 1', group: 'Preisblock' },
  { key: 'priceNote2', label: 'Preisblock Zeile 2', group: 'Preisblock' },
  { key: 'vatNote', label: 'Hinweis MwSt.', group: 'Preisblock' },
  { key: 'marke', label: 'Beschriftung Marke', group: 'Reifenliste' },
  { key: 'colReifen', label: 'Spalte Reifen', group: 'Reifenliste' },
  { key: 'colDimension', label: 'Spalte Dimension', group: 'Reifenliste' },
  { key: 'colStueck', label: 'Spalte Stück', group: 'Reifenliste' },
  { key: 'colPreis', label: 'Spalte Preis', group: 'Reifenliste' },
  { key: 'continuation', label: 'Folgeseite', group: 'Reifenliste' },
  { key: 'validity', label: 'Hinweis Gültigkeit', group: 'Fußbereich' },
  { key: 'extrasLabel', label: 'Beschriftung zusätzlich', group: 'Fußbereich' },
  { key: 'gesamtpreis', label: 'Beschriftung Gesamtpreis', group: 'Fußbereich' },
] as const

export type PdfTextKey = (typeof PDF_TEXT_FIELDS)[number]['key']
export type PdfTexts = Record<PdfTextKey, string> & { extras: ExtraLine[] }

/** Texts of the workshop's Excel template ("Reifen Angebot_email_2026.xlsx"). */
export const DEFAULT_PDF_TEXTS: PdfTexts = {
  title: 'REIFEN - ANGEBOT',
  datum: 'Datum:',
  kunde: 'Kunde:',
  email: 'E-Mail:',
  telefon: 'Tel:Nr:',
  dimension: 'Dimension:',
  stueck: 'Stück:',
  sommer: 'Sommer',
  winter: 'Winter',
  ganzjahr: 'Ganzjahres',
  priceHead: 'VK-Preis  /  Stück',
  priceNote1: 'inkl.  Montage auf Felge,',
  priceNote2: 'Wuchten und Altreifenentsorgung',
  vatNote: 'alle Preise inkl.  MwSt.',
  marke: 'Marke:',
  colReifen: 'Reifen',
  colDimension: 'Dimension',
  colStueck: 'Stk',
  colPreis: '€ / Stk',
  continuation: '(Fortsetzung)',
  validity: '*Angebot nur an diesem Tag gültig, da Preisschwankungen bestehen',
  extrasLabel: 'zusätzlich:',
  gesamtpreis: 'Gesamtpreis:',
  extras: [
    { text: 'Räder umstecken PKW bis 17":', price: '€ 34,-' },
    { text: 'Räder umstecken SUV/LLKW/ab 18":', price: '€ 36,-' },
    { text: 'Räder einlagern:', price: '€ 32,-' },
    { text: 'Räder waschen (maschinell):', price: '€ 15,-' },
    { text: 'Räder TPMS Diagnose', price: '€ 15,-' },
  ],
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT_LENGTH

/**
 * Validates stored or submitted texts. Missing keys fall back to the template, unknown keys are
 * dropped, empty extra rows are removed. Returns null for anything that is not plain text.
 */
export function parsePdfTexts(input: unknown): PdfTexts | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const texts = { ...DEFAULT_PDF_TEXTS, extras: [...DEFAULT_PDF_TEXTS.extras] }
  for (const { key } of PDF_TEXT_FIELDS) {
    if (!(key in source)) continue
    const value = source[key]
    if (!isText(value)) return null
    texts[key] = value
  }
  if ('extras' in source) {
    const extras = source.extras
    if (!Array.isArray(extras) || extras.length > MAX_EXTRAS) return null
    const lines: ExtraLine[] = []
    for (const line of extras) {
      if (typeof line !== 'object' || line === null) return null
      const { text, price } = line as Record<string, unknown>
      if (!isText(text) || !isText(price)) return null
      if (text.trim() || price.trim()) lines.push({ text, price })
    }
    texts.extras = lines
  }
  return texts
}
