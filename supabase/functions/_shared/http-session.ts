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

export class ShopSession {
  constructor(_opts: SessionOptions) {}
  get(_path: string, _opts?: RequestOptions): Promise<HttpResult> {
    throw new Error('not implemented')
  }
  post(_path: string, _form: Record<string, string>, _opts?: RequestOptions): Promise<HttpResult> {
    throw new Error('not implemented')
  }
  cookie(_name: string): string | undefined {
    throw new Error('not implemented')
  }
}
