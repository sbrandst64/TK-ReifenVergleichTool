import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PDF_TEXTS } from '../supabase/functions/_shared/pdf-texts.ts'
import { createSettingsApi, UnauthorizedError } from './api.ts'

describe('createSettingsApi', () => {
  it('loads the texts with the workshop code', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ texts: DEFAULT_PDF_TEXTS }))
    const api = createSettingsApi('http://api/functions/v1/', fetchFn)
    expect(await api.load('abc')).toEqual(DEFAULT_PDF_TEXTS)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://api/functions/v1/settings')
    expect(new Headers(init?.headers).get('x-werkstatt-code')).toBe('abc')
  })

  it('saves with PUT and returns what the server stored', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ texts: DEFAULT_PDF_TEXTS }))
    const api = createSettingsApi('http://api', fetchFn)
    expect(await api.save('abc', DEFAULT_PDF_TEXTS)).toEqual(DEFAULT_PDF_TEXTS)
    const init = fetchFn.mock.calls[0][1]
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ texts: DEFAULT_PDF_TEXTS })
  })

  it('throws UnauthorizedError on 401 and an error on other failures', async () => {
    const api401 = createSettingsApi('http://api', async () => new Response(null, { status: 401 }))
    await expect(api401.load('x')).rejects.toBeInstanceOf(UnauthorizedError)
    const api500 = createSettingsApi('http://api', async () => new Response(null, { status: 500 }))
    await expect(api500.save('x', DEFAULT_PDF_TEXTS)).rejects.toThrow('500')
  })
})
