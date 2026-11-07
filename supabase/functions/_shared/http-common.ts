// Shared HTTP pieces of the Edge Functions: CORS for the allowed origins and the
// constant-time check of the workshop code (spec 3.6).
import { allowedOrigins } from './config.ts'

export type Env = Record<string, string | undefined>

export function corsHeaders(req: Request, env: Env, methods: string): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins(env).includes(origin)) return { vary: 'Origin' }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': methods,
    'access-control-allow-headers': 'content-type, x-werkstatt-code, authorization, apikey',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

/** Constant-time comparison so the workshop code cannot be guessed via timing. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
