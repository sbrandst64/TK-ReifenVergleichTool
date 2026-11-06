// Göggel B2B shop (PHP, jQuery AJAX returning JSON with HTML fragments).
// Flow (phase0-recon.md): login form → holeSuchergebnis (price ascending) → page with
// filtereSuchergebnis/blaettern until enough stocked offers → EAN from the detail layer.
import { parseHTML } from 'linkedom'
import type { Credentials } from '../config.ts'
import { ShopSession } from '../http-session.ts'
import { parseGoeggelSize, parseLoadSpeed, seasonFromGoeggelIcon } from '../tire.ts'
import { AdapterError, type SearchQuery, type Season, type ShopOffer } from '../types.ts'
import { searchCombos, type AdapterDeps } from './weichberger.ts'

export const GOEGGEL_BASE = 'https://goeggel-shop.com'
export interface PagingInfo {
  from: number
  to: number
  total: number
}

const AJAX_SEARCH = '/includes/php_ajax/ajax_search.php'
const AJAX_GLOBAL = '/includes/php_ajax/ajax_global.php'
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
  if (/idinploginpwd/.test(res.text))
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

async function searchCombo(
  session: ShopSession,
  query: SearchQuery,
  combo: { brand: string | null; season: Season | null },
  maxOffers: number,
): Promise<ShopOffer[]> {
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

  const seen = new Set<string>()
  const stocked = new Map<string, ShopOffer>()
  for (let page = 1; ; page++) {
    let added = 0
    for (const o of parseGoeggelResults(data.ergtab)) {
      if (seen.has(o.shopArticleId)) continue
      seen.add(o.shopArticleId)
      added++
      if (o.stockImmediate >= query.quantity) stocked.set(o.shopArticleId, o)
    }
    const paging = parseGoeggelPaging(data.filter + data.ergtab)
    if (
      stocked.size >= maxOffers ||
      !paging ||
      paging.to >= paging.total ||
      added === 0 ||
      page >= MAX_PAGES
    )
      break
    data = await ajax(session, filterUrl, {
      func: 'filtereSuchergebnis',
      filterart: 'blaettern',
      filterwert: 'hoch',
    })
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
