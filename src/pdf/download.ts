// Builds the offer PDF in the browser and saves it (AC35: no request to the search API).
// pdf-lib is loaded only on first use to keep the start page small.
import { buildOfferModel, offerFileName, type SelectedTyre } from './offer-model.ts'

export async function downloadOfferPdf(items: SelectedTyre[]): Promise<void> {
  const today = new Date()
  const [{ createOfferPdf }, header] = await Promise.all([
    import('./offer-pdf.ts'),
    fetch(`${import.meta.env.BASE_URL}angebot/kopf.jpg`).then(async (r) => {
      if (!r.ok) throw new Error(`Kopfbild fehlt (${r.status})`)
      return new Uint8Array(await r.arrayBuffer())
    }),
  ])
  const bytes = await createOfferPdf(buildOfferModel(items, today), header)
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = offerFileName(today)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
