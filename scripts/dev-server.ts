// Local stand-in for the Supabase Edge Function: serves the same handler on
// http://localhost:8787/functions/v1/search using Node's built-in HTTP server.
// Credentials come from supabase/functions/.env (git-ignored), loaded via --env-file.
// Usage: npm run dev:api
import { createServer } from 'node:http'
import { handleSearch } from '../supabase/functions/_shared/search-handler.ts'

const port = Number(process.env.DEV_API_PORT ?? 8787)

createServer(async (req, res) => {
  try {
    if (!req.url?.startsWith('/functions/v1/search')) {
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
    const response = await handleSearch(request, process.env)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (e) {
    console.error('dev-server:', (e as Error).name)
    res.writeHead(500).end()
  }
}).listen(port, () => {
  console.log(`Dev-API läuft: http://localhost:${port}/functions/v1/search`)
  for (const name of ['WERKSTATT_CODE', 'WEICHBERGER_USER', 'GOEGGEL_USER']) {
    if (!process.env[name])
      console.log(`  Hinweis: ${name} ist nicht gesetzt (supabase/functions/.env)`)
  }
})
