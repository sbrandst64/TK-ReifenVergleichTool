// In-memory fake of a shop server for adapter tests. No network access.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface RecordedCall {
  method: string
  url: URL
  form: URLSearchParams
  cookie: string | null
  headers: Headers
}

export interface FakeRoute {
  method?: 'GET' | 'POST'
  /** Matches pathname (string) or pathname+search (RegExp). */
  path: string | RegExp
  when?: (form: URLSearchParams, url: URL) => boolean
  respond: (call: RecordedCall) => Response | Promise<Response>
}

export function fakeFetch(routes: FakeRoute[]) {
  const calls: RecordedCall[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    const headers = new Headers(init?.headers)
    const call: RecordedCall = { method, url, form, cookie: headers.get('cookie'), headers }
    calls.push(call)
    const target = url.pathname + url.search
    const route = routes.find(
      (r) =>
        (r.method ?? 'GET') === method &&
        (typeof r.path === 'string' ? r.path === url.pathname : r.path.test(target)) &&
        (!r.when || r.when(form, url)),
    )
    if (!route) return new Response(`no route for ${method} ${target}`, { status: 404 })
    return route.respond(call)
  }) as typeof fetch
  return { fetchFn, calls }
}

export function htmlResponse(
  body: string,
  init: { status?: number; cookies?: string[]; contentType?: string } = {},
): Response {
  const headers = new Headers({ 'content-type': init.contentType ?? 'text/html; charset=utf-8' })
  for (const c of init.cookies ?? []) headers.append('set-cookie', c)
  return new Response(body, { status: init.status ?? 200, headers })
}

export function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

export function jsonResponse(
  body: unknown | string,
  contentType = 'application/json; charset=utf-8',
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    headers: { 'content-type': contentType },
  })
}

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8')
}
