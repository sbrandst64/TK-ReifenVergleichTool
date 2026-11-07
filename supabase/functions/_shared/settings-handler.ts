// HTTP handler of the `settings` Edge Function: the editable PDF texts, stored centrally so every
// device of the workshop uses the same ones (spec 3.7, AC37, AC40). Runtime-neutral like search.
import { corsHeaders, json, safeEqual, type Env } from './http-common.ts'
import { DEFAULT_PDF_TEXTS, parsePdfTexts, type PdfTexts } from './pdf-texts.ts'

export interface SettingsStore {
  /** Stored value or null when nothing was saved yet. */
  load(): Promise<unknown>
  save(texts: PdfTexts): Promise<void>
}

const MAX_BODY_BYTES = 32 * 1024

export async function handleSettings(
  req: Request,
  env: Env,
  store: SettingsStore,
): Promise<Response> {
  const cors = corsHeaders(req, env, 'GET, PUT, OPTIONS')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET' && req.method !== 'PUT')
    return json(405, { error: 'Nur GET und PUT erlaubt' }, cors)

  const code = env.WERKSTATT_CODE ?? ''
  if (!code) {
    console.error('settings: WERKSTATT_CODE missing')
    return json(500, { error: 'Server-Konfiguration fehlerhaft' }, cors)
  }
  if (!safeEqual(req.headers.get('x-werkstatt-code') ?? '', code))
    return json(401, { error: 'Werkstatt-Code ungültig' }, cors)

  try {
    if (req.method === 'GET') {
      const texts = parsePdfTexts(await store.load()) ?? DEFAULT_PDF_TEXTS
      return json(200, { texts }, cors)
    }
    const raw = await req.text()
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES)
      return json(413, { error: 'Anfrage zu groß' }, cors)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return json(400, { error: 'Ungültige Texte' }, cors)
    }
    const texts = parsePdfTexts((body as { texts?: unknown } | null)?.texts)
    if (!texts) return json(400, { error: 'Ungültige Texte' }, cors)
    await store.save(texts)
    return json(200, { texts }, cors)
  } catch (e) {
    console.error(`settings: store ${(e as Error)?.name ?? 'error'}`)
    return json(502, { error: 'Speicher nicht erreichbar' }, cors)
  }
}
