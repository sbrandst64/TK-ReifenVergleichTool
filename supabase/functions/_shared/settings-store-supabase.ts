// Settings store on Supabase: one row in `app_settings` (see supabase/migrations), accessed via
// PostgREST with the service-role key that Supabase provides to Edge Functions. RLS has no
// policies, so the table is not reachable with the public anon key.
import type { Env } from './http-common.ts'
import type { PdfTexts } from './pdf-texts.ts'
import type { SettingsStore } from './settings-handler.ts'

const KEY = 'pdf_texts'

export function supabaseSettingsStore(env: Env, fetchFn: typeof fetch = fetch): SettingsStore {
  const base = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !serviceKey) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen')
  const table = new URL('/rest/v1/app_settings', base)
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  }
  return {
    async load() {
      const url = new URL(table)
      url.searchParams.set('key', `eq.${KEY}`)
      url.searchParams.set('select', 'value')
      const res = await fetchFn(url, { headers })
      if (!res.ok) throw new Error(`app_settings lesen: HTTP ${res.status}`)
      const rows = (await res.json()) as { value: unknown }[]
      return rows[0]?.value ?? null
    },
    async save(texts: PdfTexts) {
      const res = await fetchFn(table, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: KEY, value: texts, updated_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(`app_settings schreiben: HTTP ${res.status}`)
    },
  }
}
