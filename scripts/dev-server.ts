// Local stand-in for the Supabase Edge Functions: serves the same handlers on
// http://localhost:8787/functions/v1/search and /settings using Node's built-in HTTP server.
// Credentials come from supabase/functions/.env (git-ignored), loaded via --env-file.
// PDF texts are kept in supabase/.dev-settings.json (git-ignored) instead of the Supabase table.
// Usage: npm run dev:api
import { createServer } from 'node:http'
import { handleSearch } from '../supabase/functions/_shared/search-handler.ts'
import { handleSettings } from '../supabase/functions/_shared/settings-handler.ts'
import { fileSettingsStore } from './file-settings-store.ts'

const port = Number(process.env.DEV_API_PORT ?? 8787)
const settingsStore = fileSettingsStore(
  process.env.DEV_SETTINGS_FILE ?? 'supabase/.dev-settings.json',
)

createServer(async (req, res) => {
  try {
    const path = req.url?.split('?')[0]
    if (path !== '/functions/v1/search' && path !== '/functions/v1/settings') {
      res.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    })
    const response =
      path === '/functions/v1/settings'
        ? await handleSettings(request, process.env, settingsStore)
        : await handleSearch(request, process.env)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (e) {
    console.error('dev-server:', (e as Error).name)
    res.writeHead(500).end()
  }
}).listen(port, () => {
  console.log(`Dev-API läuft: http://localhost:${port}/functions/v1/search und /settings`)
  for (const name of ['WERKSTATT_CODE', 'WEICHBERGER_USER', 'GOEGGEL_USER']) {
    if (!process.env[name])
      console.log(`  Hinweis: ${name} ist nicht gesetzt (supabase/functions/.env)`)
  }
})
