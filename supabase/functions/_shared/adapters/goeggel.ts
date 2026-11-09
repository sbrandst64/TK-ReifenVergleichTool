// Göggel B2B shop (PHP, jQuery AJAX returning JSON with HTML fragments).
// Flow (phase0-recon.md): login form → holeSuchergebnis (price ascending) → page with
// filtereSuchergebnis/blaettern until enough stocked offers → EAN from the detail layer.
// Cart (spec 3.4): the result list is one form; a row is addressed by a row number ("key") that
// only exists in the session that searched. So: login → same search → find the row → post the
// whole page form with the quantity in that row → the shop answers with the cart page.
import { parseHTML } from 'linkedom'
import type { Credentials } from '../config.ts'
import { ShopSession } from '../http-session.ts'
import { normalizeToken, parseGoeggelSize, parseLoadSpeed, seasonFromGoeggelIcon } from '../tire.ts'
import {
  AdapterError,
  cartFailed,
  cartOk,
  type CartItem,
  type CartItemResult,
  type SearchQuery,
  type Season,
  type ShopOffer,
} from '../types.ts'
import { searchCombos, type AdapterDeps } from './weichberger.ts'

export const GOEGGEL_BASE = 'https://goeggel-shop.com'
export interface PagingInfo {
  from: number
  to: number
  total: number
}

const AJAX_SEARCH = '/includes/php_ajax/ajax_search.php'
const AJAX_GLOBAL = '/includes/php_ajax/ajax_global.php'
const CART = '/scart.php'
/** Fields of the result-list form as the browser sends them; nothing of the order form. */
const CART_WRITE_FIELD = /^(anz\d+|key\d+|vkpreis|opt7)$/
const SEARCH_FUNCS = new Set(['holeSuchergebnis', 'filtereSuchergebnis'])
const GLOBAL_FUNCS = new Set(['ladeBildanzeige'])
const SEASON_VALUE: Record<Season, string> = {
  sommer: 'sommer',
  winter: 'winter',
  ganzjahr: 'allwetter',
}
const MAX_PAGES = 40
const DETAIL_CONCURRENCY = 4

export function isAllowedGoeggelUrl(url: URL, form?: Record<string, string>): boolean {
  if (url.origin !== GOEGGEL_BASE) return false
  switch (url.pathname) {
    case '/login.php':
    case '/search.php':
      return true
    case AJAX_SEARCH:
      return SEARCH_FUNCS.has(form?.func ?? '')
    case AJAX_GLOBAL:
      return GLOBAL_FUNCS.has(form?.func ?? '')
    case CART: {
      // Only "show" (GET) and "write" (POST of the result-list form). The order steps
      // (site=header …), deleting and address changes stay unreachable (AC21).
      const site = url.searchParams.get('site')
      if (site === 'show') return form === undefined
      if (site === 'write')
        return form !== undefined && Object.keys(form).every((k) => CART_WRITE_FIELD.test(k))
      return false
    }
    default:
      return false
  }
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const layout = (what: string) =>
  new AdapterError('LAYOUT_CHANGED', `Göggel: ${what} nicht gefunden`)

export function parseGoeggelResults(ergtabHtml: string): ShopOffer[] {
  if (!ergtabHtml.trim()) return []
  const { document } = parseHTML(`<!doctype html><html><body>${ergtabHtml}</body></html>`)
  const offers: ShopOffer[] = []
  for (const row of document.querySelectorAll('.clsdiv_search_ergtable_row')) {
    const text = (cls: string) => clean(row.querySelector(`.${cls}`)?.textContent)
    const artikel = text('clsdiv_searcherg_artikel')
    const brand = text('clsdiv_searcherg_hersteller')
    const id = row.querySelector('[data-int]')?.getAttribute('data-int')
    const ek = Number(text('clsdiv_search_ek') || NaN)
    if (!id) throw layout('Artikelnummer')
    if (!artikel || !brand) throw layout('Artikel/Hersteller')
    if (!Number.isFinite(ek)) throw layout('EK-Preis')

    const size = parseGoeggelSize(artikel)
    if (!size) continue // not a regular tyre row; skip instead of guessing
    // Some rows have no LI/SI text; the speed index is then still part of the size ("205/55VR16").
    const ls = parseLoadSpeed(text('clsdiv_searcherg_bezeichnung')) ?? {
      loadIndex: '',
      speedIndex: artikel.match(/\d{2}\s*([A-Y])R\s*\d{2}/i)?.[1]?.toUpperCase() ?? '',
    }

    const stock = Number(row.querySelector('input[id^="bestand"]')?.getAttribute('value') ?? 0) || 0
    offers.push({
      shop: 'goeggel',
      shopArticleId: id,
      ean: null,
      brand,
      profile: text('clsdiv_searcherg_profil'),
      ...size,
      ...ls,
      description: clean(`${artikel} ${text('clsdiv_searcherg_bezeichnung')}`),
      stockImmediate: stock,
      stockTotal: stock,
      deliveryNote: text('clsdiv_bestandsanzeige_lieferzeit'),
      season: seasonFromGoeggelIcon(
        row.querySelector('.clsdiv_searcherg_saison img')?.getAttribute('src') ?? '',
      ),
      netEkCents: Math.round(ek * 100),
    })
  }
  return offers
}

export function parseGoeggelPaging(html: string): PagingInfo | null {
  const m = html.match(/(\d+)\s*-\s*(\d+)\s+von\s+(\d+)/)
  return m ? { from: Number(m[1]), to: Number(m[2]), total: Number(m[3]) } : null
}

const nurVerfuegbarButton = (filterHtml: string) =>
  filterHtml.match(/<button\b[^>]*idbtn_filter_nur_vfg[^>]*>/i)?.[0]

export function isNurVerfuegbarActive(filterHtml: string): boolean {
  const tag = nurVerfuegbarButton(filterHtml)
  return !!tag && /class=['"][^'"]*\bfilterselected\b/.test(tag)
}

export function parseGoeggelDetailEan(html: string): string | null {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`)
  for (const td of document.querySelectorAll('td')) {
    if (clean(td.textContent) === 'EAN-Nummer:') {
      const value = clean(td.nextElementSibling?.textContent)
      return /^\d{8,14}$/.test(value) ? value : null
    }
  }
  return null
}

interface ResultJson {
  filter: string
  ergtab: string
}

async function ajax(
  session: ShopSession,
  path: string,
  form: Record<string, string>,
): Promise<ResultJson> {
  const res = await session.post(path, form, { xhr: true })
  // Expired session: either the login form itself or a tiny page that sends the browser there
  // via JS (`parent.location.href='login.php?m=search'`, seen live 2026-11-07).
  if (/idinploginpwd/.test(res.text) || /location\.href\s*=\s*["'][^"']*login\.php/i.test(res.text))
    throw new AdapterError('SESSION_EXPIRED', 'Göggel: Sitzung abgelaufen')
  try {
    const json = JSON.parse(res.text) as Partial<ResultJson>
    if (typeof json.ergtab !== 'string') throw new Error('ergtab')
    return { filter: typeof json.filter === 'string' ? json.filter : '', ergtab: json.ergtab }
  } catch {
    throw layout('Suchergebnis')
  }
}

async function login(session: ShopSession, creds: Credentials): Promise<void> {
  const page = await session.get('/login.php?m=search')
  const form = page.text.match(/<form\b[^>]*name=["']login["'][^>]*>/i)?.[0]
  const action = form?.match(/action=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&')
  if (!action) throw layout('Login-Formular')
  const res = await session.post(action, { s: '1', id: creds.user, pw: creds.password, send: '' })
  if (/idinploginpwd/.test(res.text) || new URL(res.url).pathname === '/login.php') {
    throw new AdapterError('LOGIN_FAILED', 'Göggel: Anmeldung fehlgeschlagen')
  }
}

/** Result pages of one search as the shop pages them: only available articles, 20 rows each. */
async function* resultPages(
  session: ShopSession,
  query: Pick<SearchQuery, 'width' | 'height' | 'rim'>,
  combo: { brand: string | null; season: Season | null },
): AsyncGenerator<ResultJson> {
  const filterUrl = `${AJAX_SEARCH}?sess-shop=${encodeURIComponent(session.cookie('sess-shop') ?? '')}`
  let data = await ajax(session, AJAX_SEARCH, {
    func: 'holeSuchergebnis',
    suchart: 'bqz',
    breite: String(query.width),
    querschnitt: String(query.height),
    zoll: String(query.rim),
    saison: combo.season ? SEASON_VALUE[combo.season] : 'Alle',
    hersteller: combo.brand ?? '',
  })
  if (nurVerfuegbarButton(data.filter) && !isNurVerfuegbarActive(data.filter)) {
    data = await ajax(session, filterUrl, {
      func: 'filtereSuchergebnis',
      filterart: 'nurvfg',
      filterwert: 'vfg',
    })
    if (!isNurVerfuegbarActive(data.filter)) throw layout('Filter „nur verfügbare Artikel“')
  }

  for (let page = 1; ; page++) {
    yield data
    const paging = parseGoeggelPaging(data.filter + data.ergtab)
    if (!paging || paging.to >= paging.total || page >= MAX_PAGES) return
    data = await ajax(session, filterUrl, {
      func: 'filtereSuchergebnis',
      filterart: 'blaettern',
      filterwert: 'hoch',
    })
  }
}

async function searchCombo(
  session: ShopSession,
  query: SearchQuery,
  combo: { brand: string | null; season: Season | null },
  maxOffers: number,
): Promise<ShopOffer[]> {
  const seen = new Set<string>()
  const stocked = new Map<string, ShopOffer>()
  for await (const data of resultPages(session, query, combo)) {
    let added = 0
    for (const o of parseGoeggelResults(data.ergtab)) {
      if (seen.has(o.shopArticleId)) continue
      seen.add(o.shopArticleId)
      added++
      if (o.stockImmediate >= query.quantity) stocked.set(o.shopArticleId, o)
    }
    // leaving the loop stops the paging before the next page is requested
    if (stocked.size >= maxOffers || added === 0) break
  }
  return [...stocked.values()]
}

async function fillEans(session: ShopSession, offers: ShopOffer[]): Promise<void> {
  for (let i = 0; i < offers.length; i += DETAIL_CONCURRENCY) {
    await Promise.all(
      offers.slice(i, i + DETAIL_CONCURRENCY).map(async (o) => {
        try {
          const res = await session.post(
            AJAX_GLOBAL,
            { func: 'ladeBildanzeige', int: o.shopArticleId, bildnr: 'dummy' },
            { xhr: true },
          )
          o.ean = parseGoeggelDetailEan((JSON.parse(res.text) as { html?: string }).html ?? '')
        } catch {
          o.ean = null // EAN is optional; matching falls back to brand/profile/size
        }
      }),
    )
  }
}

export async function searchGoeggel(query: SearchQuery, deps: AdapterDeps): Promise<ShopOffer[]> {
  if (!deps.credentials) throw new AdapterError('LOGIN_FAILED', 'Göggel: Zugangsdaten fehlen')
  const session = new ShopSession({
    baseUrl: GOEGGEL_BASE,
    isAllowed: isAllowedGoeggelUrl,
    fetchFn: deps.fetchFn,
    timeoutMs: deps.timeoutMs,
  })
  await login(session, deps.credentials)
  return runGoeggelSearch(session, query, deps.maxOffers)
}

/** Search part only, for an already logged-in session. */
export async function runGoeggelSearch(
  session: ShopSession,
  query: SearchQuery,
  maxOffers: number,
): Promise<ShopOffer[]> {
  const all = new Map<string, ShopOffer>()
  for (const combo of searchCombos(query)) {
    for (const o of await searchCombo(session, query, combo, maxOffers)) {
      if (!all.has(o.shopArticleId)) all.set(o.shopArticleId, o)
    }
  }
  const offers = [...all.values()].sort((a, b) => a.netEkCents - b.netEkCents).slice(0, maxOffers)
  await fillEans(session, offers)
  return offers
}

export interface GoeggelOrderRow {
  shopArticleId: string
  /** Name of the row's quantity input, e.g. "anz4". */
  quantityField: string
  /** Name and value of the row number the shop expects back, e.g. "key4" = "600". */
  keyField: string
  key: string
  artikel: string
  brand: string
  profile: string
}

/** Order fields of every row of a result page (the page is one form posted as a whole). */
export function parseGoeggelOrderRows(ergtabHtml: string): GoeggelOrderRow[] {
  if (!ergtabHtml.trim()) return []
  const { document } = parseHTML(`<!doctype html><html><body>${ergtabHtml}</body></html>`)
  const rows: GoeggelOrderRow[] = []
  for (const row of document.querySelectorAll('.clsdiv_search_ergtable_row')) {
    const text = (cls: string) => clean(row.querySelector(`.${cls}`)?.textContent)
    const id = row.querySelector('[data-int]')?.getAttribute('data-int')
    const quantityField = row.querySelector('input[name^="anz"]')?.getAttribute('name') ?? ''
    const keyInput = row.querySelector('input[name^="key"]')
    const keyField = keyInput?.getAttribute('name') ?? ''
    const key = keyInput?.getAttribute('value') ?? ''
    if (!id) throw layout('Artikelnummer')
    // both fields must carry the same row index, otherwise the quantity could land on another tyre
    const index = quantityField.match(/^anz(\d+)$/)?.[1]
    if (index === undefined || keyField !== `key${index}` || !/^\d+$/.test(key))
      throw layout('Bestellfeld')
    rows.push({
      shopArticleId: id,
      quantityField,
      keyField,
      key,
      artikel: text('clsdiv_searcherg_artikel'),
      brand: text('clsdiv_searcherg_hersteller'),
      profile: text('clsdiv_searcherg_profil'),
    })
  }
  return rows
}

export interface GoeggelCartPosition {
  artikel: string
  profile: string
  brand: string
  quantity: number
}

/** Positions shown on the cart page (hidden fields artikel<i>/profil<i>/hersteller<i>, anz<i>). */
export function parseGoeggelCartPositions(html: string): GoeggelCartPosition[] {
  const { document } = parseHTML(
    /<html[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`,
  )
  // index → fields; rows are numbered artikel0/profil0/hersteller0/anz0, artikel1/…
  const byIndex = new Map<string, Record<string, string>>()
  for (const input of document.querySelectorAll('input')) {
    const m = (input.getAttribute('name') ?? '').match(/^(artikel|profil|hersteller|anz)(\d+)$/)
    if (!m) continue
    const fields = byIndex.get(m[2]) ?? {}
    fields[m[1]] = input.getAttribute('value') ?? ''
    byIndex.set(m[2], fields)
  }
  return [...byIndex.values()]
    .filter((f) => f.artikel !== undefined)
    .map((f) => ({
      artikel: clean(f.artikel),
      profile: clean(f.profil),
      brand: clean(f.hersteller),
      quantity: Number(f.anz ?? 0) || 0,
    }))
}

/** Finds the tyre again in a fresh search of its size; returns its page (all rows) and its row. */
async function findOrderRow(
  session: ShopSession,
  item: CartItem,
): Promise<{ rows: GoeggelOrderRow[]; row: GoeggelOrderRow } | null> {
  const seen = new Set<string>()
  for await (const data of resultPages(session, item, { brand: null, season: null })) {
    const rows = parseGoeggelOrderRows(data.ergtab)
    const row = rows.find((r) => r.shopArticleId === item.shopArticleId)
    if (row) return { rows, row }
    const fresh = rows.filter((r) => !seen.has(r.shopArticleId))
    if (fresh.length === 0) return null // the shop repeats pages: nothing new will come
    for (const r of fresh) seen.add(r.shopArticleId)
  }
  return null
}

const same = (a: string, b: string) => normalizeToken(a) === normalizeToken(b)

async function writeToCart(session: ShopSession, item: CartItem): Promise<CartItemResult> {
  try {
    const found = await findOrderRow(session, item)
    if (!found) {
      throw new AdapterError('ITEM_NOT_FOUND', 'Göggel: Reifen nicht mehr in der Trefferliste')
    }
    // The browser posts the whole page: every row with its key, the quantity only where wanted.
    const form: Record<string, string> = {}
    for (const r of found.rows) {
      form[r.quantityField] = r === found.row ? String(item.quantity) : ''
      form[r.keyField] = r.key
    }
    form.vkpreis = 'vkpreis_opt'
    form.opt7 = ''
    const sess = encodeURIComponent(session.cookie('sess-shop') ?? '')
    // The shop answers with a redirect to the cart page (site=show), which is read below.
    const res = await session.post(`${CART}?site=write&s=1&sess-shop=${sess}`, form)
    if (/idinploginpwd/.test(res.text)) {
      throw new AdapterError('SESSION_EXPIRED', 'Göggel: Sitzung abgelaufen')
    }
    const inCart = parseGoeggelCartPositions(res.text).some(
      (p) =>
        same(p.artikel, found.row.artikel) &&
        same(p.profile, found.row.profile) &&
        same(p.brand, found.row.brand) &&
        p.quantity >= item.quantity,
    )
    if (!inCart) {
      throw new AdapterError('CART_REJECTED', 'Göggel: Position steht nicht im Warenkorb')
    }
    return cartOk(item.shopArticleId)
  } catch (e) {
    return cartFailed(item.shopArticleId, e)
  }
}

/** Puts the items into the Göggel cart. Never orders (spec 3.4, AC21). */
export async function addToCartGoeggel(
  items: CartItem[],
  deps: AdapterDeps,
): Promise<CartItemResult[]> {
  if (!deps.credentials) throw new AdapterError('LOGIN_FAILED', 'Göggel: Zugangsdaten fehlen')
  const session = new ShopSession({
    baseUrl: GOEGGEL_BASE,
    isAllowed: isAllowedGoeggelUrl,
    fetchFn: deps.fetchFn,
    timeoutMs: deps.timeoutMs,
  })
  await login(session, deps.credentials)
  const results: CartItemResult[] = []
  // Sequential on purpose: the search and its row numbers live in the server session.
  for (const item of items) results.push(await writeToCart(session, item))
  return results
}
