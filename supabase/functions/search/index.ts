// Supabase Edge Function "search" (Deno). All logic lives in the runtime-neutral handler,
// which is also used by the local Node dev server (scripts/dev-server.ts).
// Göggel EANs are remembered in the table goeggel_ean (AC46).
import { supabaseEanCache } from '../_shared/ean-cache-supabase.ts'
import { handleSearch } from '../_shared/search-handler.ts'

Deno.serve((req: Request) => {
  const env = Deno.env.toObject()
  return handleSearch(req, env, { eanCache: supabaseEanCache(env) ?? undefined })
})
