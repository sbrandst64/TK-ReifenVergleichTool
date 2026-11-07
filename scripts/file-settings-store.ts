// Settings store for local development: one JSON file instead of the Supabase table.
import { readFile, writeFile } from 'node:fs/promises'
import type { SettingsStore } from '../supabase/functions/_shared/settings-handler.ts'

export function fileSettingsStore(path: string): SettingsStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as unknown
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async save(texts) {
      await writeFile(path, JSON.stringify(texts, null, 2), 'utf8')
    },
  }
}
