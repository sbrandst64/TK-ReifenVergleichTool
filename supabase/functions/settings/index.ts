// Supabase Edge Function `settings`: editable PDF texts, stored in the app_settings table.
import { handleSettings } from '../_shared/settings-handler.ts'
import { supabaseSettingsStore } from '../_shared/settings-store-supabase.ts'

Deno.serve((req: Request) => {
  const env = Deno.env.toObject()
  return handleSettings(req, env, supabaseSettingsStore(env))
})
