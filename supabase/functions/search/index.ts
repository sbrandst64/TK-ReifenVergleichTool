// Supabase Edge Function "search" (Deno). All logic lives in the runtime-neutral handler,
// which is also used by the local Node dev server (scripts/dev-server.ts).
import { handleSearch } from '../_shared/search-handler.ts'

Deno.serve((req: Request) => handleSearch(req, Deno.env.toObject()))
