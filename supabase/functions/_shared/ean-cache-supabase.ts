// EAN cache on Supabase: table `goeggel_ean` (see supabase/migrations), accessed via PostgREST with
// the service-role key that Supabase provides to Edge Functions. RLS has no policies, so the table
// is not reachable with the public anon key.
import { isArticleId, isEan, type EanCache } from './ean-cache.ts'
import type { Env } from './http-common.ts'

/** null when the function runs without Supabase (e.g. a test or a misconfigured project). */
export function supabaseEanCache(env: Env, fetchFn: typeof fetch = fetch): EanCache | null {
  const base = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !serviceKey) return null
  const table = new URL('/rest/v1/goeggel_ean', base)
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  }
  return {
    async get(articleIds) {
      const ids = articleIds.filter(isArticleId)
      if (ids.length === 0) return new Map()
      const url = new URL(table)
      url.searchParams.set('article_id', `in.(${ids.map((id) => `"${id}"`).join(',')})`)
      url.searchParams.set('select', 'article_id,ean')
      const res = await fetchFn(url, { headers })
      if (!res.ok) throw new Error(`goeggel_ean lesen: HTTP ${res.status}`)
      const rows = (await res.json()) as { article_id: string; ean: unknown }[]
      return new Map(rows.filter((r) => isEan(r.ean)).map((r) => [r.article_id, r.ean as string]))
    },
    async put(entries) {
      const rows = [...entries]
        .filter(([id, ean]) => isArticleId(id) && isEan(ean))
        .map(([article_id, ean]) => ({ article_id, ean }))
      if (rows.length === 0) return
      const res = await fetchFn(table, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(`goeggel_ean schreiben: HTTP ${res.status}`)
    },
  }
}
