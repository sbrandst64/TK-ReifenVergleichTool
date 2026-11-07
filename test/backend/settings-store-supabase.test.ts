import { describe, expect, it } from 'vitest'
import { DEFAULT_PDF_TEXTS } from '../../supabase/functions/_shared/pdf-texts.ts'
import { supabaseSettingsStore } from '../../supabase/functions/_shared/settings-store-supabase.ts'

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }

function recorder(respond: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchFn: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    return respond(url, init)
  }
  return { fetchFn, calls }
}

describe('supabaseSettingsStore', () => {
  it('reads the pdf_texts row from app_settings with the service key', async () => {
    const { fetchFn, calls } = recorder(() => Response.json([{ value: { title: 'X' } }]))
    const value = await supabaseSettingsStore(ENV, fetchFn).load()
    expect(value).toEqual({ title: 'X' })
    expect(calls[0].url.pathname).toBe('/rest/v1/app_settings')
    expect(calls[0].url.searchParams.get('key')).toBe('eq.pdf_texts')
    expect(new Headers(calls[0].init.headers).get('apikey')).toBe('service-key')
  })

  it('returns null when nothing is stored yet', async () => {
    const { fetchFn } = recorder(() => Response.json([]))
    expect(await supabaseSettingsStore(ENV, fetchFn).load()).toBeNull()
  })

  it('upserts the texts', async () => {
    const { fetchFn, calls } = recorder(() => new Response(null, { status: 201 }))
    await supabaseSettingsStore(ENV, fetchFn).save(DEFAULT_PDF_TEXTS)
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('prefer')).toContain(
      'resolution=merge-duplicates',
    )
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      key: 'pdf_texts',
      value: DEFAULT_PDF_TEXTS,
    })
  })

  it('throws on HTTP errors and on missing configuration', async () => {
    const { fetchFn } = recorder(() => new Response('x', { status: 500 }))
    await expect(supabaseSettingsStore(ENV, fetchFn).load()).rejects.toThrow()
    await expect(supabaseSettingsStore(ENV, fetchFn).save(DEFAULT_PDF_TEXTS)).rejects.toThrow()
    expect(() => supabaseSettingsStore({}, fetchFn)).toThrow()
  })
})
