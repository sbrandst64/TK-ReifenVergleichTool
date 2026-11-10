// EAN cache for local development: one JSON file instead of the Supabase table.
import { readFile, writeFile } from 'node:fs/promises'
import type { EanCache } from '../supabase/functions/_shared/ean-cache.ts'

export function fileEanCache(path: string): EanCache {
  const load = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Record<string, string>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw e
    }
  }
  return {
    async get(articleIds) {
      const all = await load()
      return new Map(articleIds.filter((id) => id in all).map((id) => [id, all[id]] as const))
    },
    async put(entries) {
      if (entries.size === 0) return
      await writeFile(
        path,
        JSON.stringify({ ...(await load()), ...Object.fromEntries(entries) }),
        'utf8',
      )
    },
  }
}
