// Minimal browser-like HTTP session: cookie jar, redirects, form posts, timeouts.
// Every request and redirect target is checked against an allowlist BEFORE it is sent,
// so adapters can never reach order/checkout endpoints (spec 3.4, AC21).
import { AdapterError } from './types.ts'

export interface HttpResult {
  status: number
  url: string
  text: string
}
export interface SessionOptions {
  baseUrl: string
  /** Allowlist check, applied to every request and redirect target before it is sent. */
  isAllowed: (url: URL, form?: Record<string, string>) => boolean
  fetchFn?: typeof fetch
  timeoutMs?: number
  userAgent?: string
}
export interface RequestOptions {
  xhr?: boolean
  followRedirects?: boolean
}

const MAX_REDIRECTS = 8
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export class ShopSession {
  private readonly opts: SessionOptions
  private readonly origin: string
  private readonly jar = new Map<string, string>()

  constructor(opts: SessionOptions) {
    this.opts = opts
    this.origin = new URL(opts.baseUrl).origin
  }

  get(path: string, opts: RequestOptions = {}): Promise<HttpResult> {
    return this.request('GET', path, undefined, opts)
  }

  post(path: string, form: Record<string, string>, opts: RequestOptions = {}): Promise<HttpResult> {
    return this.request('POST', path, form, opts)
  }

  cookie(name: string): string | undefined {
    return this.jar.get(name)
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    form: Record<string, string> | undefined,
    opts: RequestOptions,
  ): Promise<HttpResult> {
    let url = new URL(path, this.opts.baseUrl)
    let currentMethod = method
    let currentForm = form
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      this.assertAllowed(url, currentForm)
      const headers: Record<string, string> = {
        'user-agent': this.opts.userAgent ?? DEFAULT_UA,
        accept: '*/*',
      }
      const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ')
      if (cookie) headers.cookie = cookie
      if (currentForm) headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
      if (opts.xhr) headers['x-requested-with'] = 'XMLHttpRequest'

      const res = await this.send(url, {
        method: currentMethod,
        headers,
        body: currentForm ? new URLSearchParams(currentForm).toString() : undefined,
        redirect: 'manual',
      })
      this.storeCookies(res.headers)

      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location && opts.followRedirects !== false) {
        await res.body?.cancel()
        url = new URL(location, url)
        if (url.origin !== this.origin) {
          throw new AdapterError(
            'FORBIDDEN_ENDPOINT',
            'Weiterleitung auf einen fremden Server abgelehnt',
          )
        }
        if (res.status !== 307 && res.status !== 308) {
          currentMethod = 'GET'
          currentForm = undefined
        }
        continue
      }
      if (res.status === 403 || res.status === 429) {
        await res.body?.cancel()
        throw new AdapterError('BLOCKED', `Shop blockiert Anfragen (HTTP ${res.status})`)
      }
      if (res.status >= 400) {
        await res.body?.cancel()
        throw new AdapterError('UPSTREAM_ERROR', `Shop meldet Fehler (HTTP ${res.status})`)
      }
      return { status: res.status, url: url.href, text: await decode(res) }
    }
    throw new AdapterError('UPSTREAM_ERROR', 'Zu viele Weiterleitungen')
  }

  private assertAllowed(url: URL, form?: Record<string, string>): void {
    if (url.origin !== this.origin || !this.opts.isAllowed(url, form)) {
      throw new AdapterError(
        'FORBIDDEN_ENDPOINT',
        `Nicht freigegebener Shop-Endpunkt: ${url.pathname}`,
      )
    }
  }

  private async send(url: URL, init: RequestInit): Promise<Response> {
    const signal = AbortSignal.timeout(this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      return await (this.opts.fetchFn ?? fetch)(url.href, { ...init, signal })
    } catch (e) {
      const name = (e as { name?: string } | null)?.name
      if (signal.aborted || name === 'TimeoutError' || name === 'AbortError') {
        throw new AdapterError('TIMEOUT', 'Shop antwortet nicht')
      }
      throw new AdapterError('UPSTREAM_ERROR', 'Shop nicht erreichbar')
    }
  }

  private storeCookies(headers: Headers): void {
    const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
    for (const line of list) {
      const [pair, ...attrs] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (isExpired(attrs)) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }
}

function isExpired(attrs: string[]): boolean {
  for (const raw of attrs) {
    const [k, ...rest] = raw.split('=')
    const key = k.trim().toLowerCase()
    const value = rest.join('=').trim()
    if (key === 'max-age' && Number(value) <= 0) return true
    if (key === 'expires' && Date.parse(value) < Date.now()) return true
  }
  return false
}

async function decode(res: Response): Promise<string> {
  const charset = (res.headers.get('content-type') ?? '')
    .match(/charset=([^;]+)/i)?.[1]
    ?.trim()
    .toLowerCase()
  const latin = charset === 'iso-8859-1' || charset === 'latin1' || charset === 'windows-1252'
  return new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(await res.arrayBuffer())
}
