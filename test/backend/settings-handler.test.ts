import { describe, expect, it } from 'vitest'
import { DEFAULT_PDF_TEXTS, type PdfTexts } from '../../supabase/functions/_shared/pdf-texts.ts'
import {
  handleSettings,
  type SettingsStore,
} from '../../supabase/functions/_shared/settings-handler.ts'

const ENV = { WERKSTATT_CODE: 'geheim', ALLOWED_ORIGINS: 'http://localhost:5173' }
const URL_ = 'http://localhost/functions/v1/settings'

function memoryStore(initial: unknown = null) {
  let value = initial
  const store: SettingsStore = {
    load: async () => value,
    save: async (v) => {
      value = v
    },
  }
  return { store, current: () => value }
}

const req = (method: string, body?: unknown, code = 'geheim') =>
  new Request(URL_, {
    method,
    headers: {
      origin: 'http://localhost:5173',
      'x-werkstatt-code': code,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('handleSettings', () => {
  it('AC40: returns the template while nothing is stored', async () => {
    const res = await handleSettings(req('GET'), ENV, memoryStore().store)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect((await res.json()).texts).toEqual(DEFAULT_PDF_TEXTS)
  })

  it('AC37: PUT stores the texts centrally and GET returns them to every device', async () => {
    const { store } = memoryStore()
    const texts: PdfTexts = { ...DEFAULT_PDF_TEXTS, title: 'WINTERREIFEN - ANGEBOT' }
    const put = await handleSettings(req('PUT', { texts }), ENV, store)
    expect(put.status).toBe(200)
    const get = await handleSettings(req('GET'), ENV, store)
    expect((await get.json()).texts.title).toBe('WINTERREIFEN - ANGEBOT')
  })

  it('AC40: 401 without the workshop code, nothing is stored', async () => {
    const { store, current } = memoryStore()
    expect((await handleSettings(req('GET', undefined, 'falsch'), ENV, store)).status).toBe(401)
    const put = await handleSettings(req('PUT', { texts: DEFAULT_PDF_TEXTS }, ''), ENV, store)
    expect(put.status).toBe(401)
    expect(current()).toBeNull()
  })

  it('AC40: 400 for invalid texts or broken JSON, 413 for oversized bodies', async () => {
    const { store, current } = memoryStore()
    expect((await handleSettings(req('PUT', { texts: { title: 7 } }), ENV, store)).status).toBe(400)
    expect((await handleSettings(req('PUT', '{nope'), ENV, store)).status).toBe(400)
    const huge = JSON.stringify({ texts: { title: 'x' }, pad: 'y'.repeat(40_000) })
    expect((await handleSettings(req('PUT', huge), ENV, store)).status).toBe(413)
    expect(current()).toBeNull()
  })

  it('answers the CORS preflight, rejects other methods and a missing code config', async () => {
    const { store } = memoryStore()
    const pre = await handleSettings(req('OPTIONS'), ENV, store)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toContain('PUT')
    expect((await handleSettings(req('DELETE'), ENV, store)).status).toBe(405)
    expect((await handleSettings(req('GET'), {}, store)).status).toBe(500)
  })

  it('falls back to the template when the stored value is broken', async () => {
    const res = await handleSettings(req('GET'), ENV, memoryStore({ title: 42 }).store)
    expect((await res.json()).texts).toEqual(DEFAULT_PDF_TEXTS)
  })

  it('reports a store failure as 502 without details', async () => {
    const broken: SettingsStore = {
      load: () => Promise.reject(new Error('db down: secret-host')),
      save: () => Promise.reject(new Error('db down')),
    }
    const res = await handleSettings(req('GET'), ENV, broken)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('secret-host')
  })
})
