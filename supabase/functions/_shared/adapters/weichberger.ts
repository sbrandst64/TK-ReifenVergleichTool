// Weichberger B2B shop (ASP.NET MVC, server-rendered HTML).
// Flow (phase0-recon.md): login form → TyreSearch (+ redirect sets the search in the session)
// → SearchResult/{cat} with page + stock filter → GET SearchResult (HTML) → footer for page count.
import { parseHTML } from 'linkedom'
import type { Credentials } from '../config.ts'
import { ShopSession, type HttpResult } from '../http-session.ts'
import { parseWeichbergerDescription } from '../tire.ts'
import { AdapterError, type SearchQuery, type Season, type ShopOffer } from '../types.ts'

export interface AdapterDeps {
  credentials: Credentials | null
  maxOffers: number
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export const WEICHBERGER_BASE = 'https://b2b.weichberger.at'
const LOGIN_PATH = '/100/Account/Login'
const MAX_PAGES = 30
const SEASON_CODE: Record<Season, string> = { sommer: '1', winter: '2', ganzjahr: '3' }

const ALLOWED_PATHS = [
  /^\/\d+\/Account\/Login$/,
  /^\/\d+\/Account\/RedirectIntern$/,
  /^\/\d+\/?$/,
  /^\/\d+\/c\/(re|[0-9a-f-]{36})$/,
  /^\/\d+\/Items\/(TyreSearch|SearchResult|SearchFooter)$/,
  /^\/\d+\/Items\/SearchResult\/[0-9a-f-]{36}$/,
]

export function isAllowedWeichbergerUrl(url: URL): boolean {
  return url.origin === WEICHBERGER_BASE && ALLOWED_PATHS.some((r) => r.test(url.pathname))
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const layout = (what: string) =>
  new AdapterError('LAYOUT_CHANGED', `Weichberger: ${what} nicht gefunden`)

function centsFromEuroText(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/)
  return m ? Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]) : null
}

export function parseWeichbergerResults(html: string): ShopOffer[] {
  if (/name="Password"/i.test(html) && !html.includes('form_basket_')) {
    throw new AdapterError('SESSION_EXPIRED', 'Weichberger: Sitzung abgelaufen')
  }
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`)
  const forms = [...document.querySelectorAll('form[id^="form_basket_"]')].filter((f) =>
    /^form_basket_\d+$/.test(f.getAttribute('id') ?? ''),
  )
  const offers: ShopOffer[] = []
  for (const form of forms) {
    const article = form.closest('.itemsContainer')?.parentElement
    const small = article?.querySelector('#smallView')
    if (!article || !small) throw layout('Artikelblock')

    const labels = new Map<string, string>()
    for (const h5 of small.querySelectorAll('h5')) {
      const label = clean(h5.textContent)
      if (!label || labels.has(label)) continue
      labels.set(label, clean(h5.parentElement?.textContent).slice(label.length).trim())
    }
    const stock = (label: string) => {
      const value = labels.get(label)
      if (value === undefined) throw layout(label)
      return Number(value.match(/\d+/)?.[0] ?? 0)
    }

    const id = form.querySelector('input[name="itemID"]')?.getAttribute('value')
    const description = clean(
      form.querySelector('input[name="description"]')?.getAttribute('value'),
    )
    const brand = labels.get('Hersteller')
    const net = centsFromEuroText(article.querySelector('#netprice')?.textContent ?? '')
    if (!id) throw layout('Artikel-ID')
    if (!brand) throw layout('Hersteller')
    if (net === null) throw layout('Netto-EK')

    const tyre = parseWeichbergerDescription(description)
    if (!tyre) continue // not a regular tyre description; skip instead of guessing

    const branch = stock('Bestand')
    const central = stock('Bestand Zentrallager')
    const secondary = stock('Bestand Nebenlager')
    offers.push({
      shop: 'weichberger',
      shopArticleId: id,
      ean: article.innerHTML.match(/eannumber\s*=\s*'(\d{8,14})'/)?.[1] ?? null,
      brand,
      ...tyre,
      description,
      stockImmediate: branch + central,
      stockTotal: branch + central + secondary,
      deliveryNote: '',
      season: null,
      netEkCents: net,
    })
  }
  return offers
}

export function parseWeichbergerPageCount(footerHtml: string): number {
  const pages = [...footerHtml.matchAll(/setPage\((\d+)\)/g)].map((m) => Number(m[1]))
  return Math.max(1, ...pages)
}

function ensureLoggedIn(res: HttpResult): HttpResult {
  if (/\/Account\/Login$/i.test(new URL(res.url).pathname)) {
    throw new AdapterError('SESSION_EXPIRED', 'Weichberger: Sitzung abgelaufen')
  }
  return res
}

async function login(session: ShopSession, creds: Credentials): Promise<string> {
  await session.get(LOGIN_PATH)
  const res = await session.post(LOGIN_PATH, {
    returnUrl: '',
    area: '',
    a: '',
    c: '',
    q: '',
    UserName: creds.user,
    Password: creds.password,
    RememberMe: 'false',
  })
  const path = new URL(res.url).pathname
  const base = path.match(/^\/(\d+)(?:\/|$)/)?.[1]
  if (!base || /\/Account\/Login$/i.test(path) || /name="Password"/i.test(res.text)) {
    throw new AdapterError('LOGIN_FAILED', 'Weichberger: Anmeldung fehlgeschlagen')
  }
  return `/${base}`
}

async function categoryId(session: ShopSession, base: string): Promise<string> {
  const res = ensureLoggedIn(await session.get(`${base}/c/re`))
  const id = res.text.match(/catID=([0-9a-f-]{36})/i)?.[1]
  if (!id) throw layout('Reifen-Kategorie')
  return id
}

interface Combo {
  brand: string | null
  season: Season | null
}

export function searchCombos(query: SearchQuery): Combo[] {
  const brands = query.brands.length ? query.brands : [null]
  const seasons = query.seasons.length ? query.seasons : [null]
  return brands.flatMap((brand) => seasons.map((season) => ({ brand, season })))
}

async function searchCombo(
  session: ShopSession,
  base: string,
  cat: string,
  query: SearchQuery,
  combo: Combo,
  maxOffers: number,
): Promise<ShopOffer[]> {
  ensureLoggedIn(
    await session.post(`${base}/Items/TyreSearch`, {
      Preference: '1;100',
      TyreWidth: String(query.width),
      AspectRatio: String(query.height),
      WheelDiameter: String(query.rim),
      Manufacturer: combo.brand ?? '',
      categoryId: cat,
      quantity: '',
      TyreType: combo.season ? SEASON_CODE[combo.season] : '0',
    }),
  )
  const found = new Map<string, ShopOffer>()
  let pages = 1
  for (let page = 0; page < Math.min(pages, MAX_PAGES); page++) {
    const started = ensureLoggedIn(
      await session.post(
        `${base}/Items/SearchResult/${cat}`,
        { page: String(page), quantity: String(query.quantity) },
        { xhr: true },
      ),
    )
    if (!/"success"\s*:\s*true/.test(started.text)) throw layout('Suchergebnis')
    const result = ensureLoggedIn(await session.get(`${base}/Items/SearchResult`, { xhr: true }))
    for (const o of parseWeichbergerResults(result.text))
      if (!found.has(o.shopArticleId)) found.set(o.shopArticleId, o)
    if (page === 0) {
      pages = parseWeichbergerPageCount(
        (await session.get(`${base}/Items/SearchFooter`, { xhr: true })).text,
      )
    }
    if (found.size >= maxOffers) break
  }
  return [...found.values()]
}

export async function searchWeichberger(
  query: SearchQuery,
  deps: AdapterDeps,
): Promise<ShopOffer[]> {
  if (!deps.credentials) throw new AdapterError('LOGIN_FAILED', 'Weichberger: Zugangsdaten fehlen')
  const session = new ShopSession({
    baseUrl: WEICHBERGER_BASE,
    isAllowed: isAllowedWeichbergerUrl,
    fetchFn: deps.fetchFn,
    timeoutMs: deps.timeoutMs,
  })
  const base = await login(session, deps.credentials)
  return runWeichbergerSearch(session, base, query, deps.maxOffers)
}

/** Search part only, for an already logged-in session (base path e.g. "/115"). */
export async function runWeichbergerSearch(
  session: ShopSession,
  base: string,
  query: SearchQuery,
  maxOffers: number,
): Promise<ShopOffer[]> {
  const cat = await categoryId(session, base)
  const all = new Map<string, ShopOffer>()
  // Sequential on purpose: the search lives in the server session (spec 3.1).
  for (const combo of searchCombos(query)) {
    for (const o of await searchCombo(session, base, cat, query, combo, maxOffers)) {
      if (!all.has(o.shopArticleId)) all.set(o.shopArticleId, o)
    }
  }
  return [...all.values()]
    .filter((o) => o.stockTotal >= query.quantity)
    .sort((a, b) => a.netEkCents - b.netEkCents)
    .slice(0, maxOffers)
}
