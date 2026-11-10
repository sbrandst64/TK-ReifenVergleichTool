import { describe, expect, it } from 'vitest'
import {
  isAllowedGoeggelUrl,
  isNurVerfuegbarActive,
  parseGoeggelDetailEan,
  parseGoeggelPaging,
  parseGoeggelResults,
  searchGoeggel,
} from '../../supabase/functions/_shared/adapters/goeggel.ts'
import { AdapterError, type SearchQuery } from '../../supabase/functions/_shared/types.ts'
import {
  fakeFetch,
  fixture,
  htmlResponse,
  jsonResponse,
  redirectResponse,
  type FakeRoute,
} from '../helpers/fake-fetch.ts'

const SESS = '0'.repeat(32)
const P1 = fixture('goeggel/search-p1.json')
const P2 = fixture('goeggel/page2.json')
const MICHELIN = fixture('goeggel/michelin-sommer.json')
const NURVFG_OFF = fixture('goeggel/nurvfg-off.json')
const DETAIL = fixture('goeggel/detail.json')
const ergtab = (json: string) => (JSON.parse(json) as { ergtab: string }).ergtab
const filter = (json: string) => (JSON.parse(json) as { filter: string }).filter
const LOGIN_PAGE = `<form name="login" method="POST" action="/login.php?lo=&m=search&lang=de&f=1&h=goeggel&sess-shop=${SESS}">
<input type="hidden" name="s" value="1" /><input type="text" name="id" id='idinploginuser'><input type="password" id='idinploginpwd' name="pw"></form>`
const UTF8_HTML = 'text/html; charset=UTF-8'

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  width: 205,
  height: 55,
  rim: 16,
  quantity: 4,
  seasons: [],
  brands: [],
  ...over,
})

// What Göggel really sends to an AJAX call when the session has expired (seen live 2026-11-07).
const EXPIRED_REDIRECT = `<!DOCTYPE html><html><head>
<script type="text/javascript" language="Javascript"><!--
parent.location.href='login.php?m=search';
//--></script><title></title></head></html>`

function shop(
  opts: { nurvfgInitiallyOff?: boolean; detailStatus?: number; sessionExpired?: boolean } = {},
) {
  let nurvfgOff = opts.nurvfgInitiallyOff ?? false
  const routes: FakeRoute[] = [
    {
      path: '/login.php',
      respond: () =>
        htmlResponse(LOGIN_PAGE, { cookies: [`sess-shop=${SESS}; Max-Age=28800; path=/`] }),
    },
    {
      method: 'POST',
      path: '/login.php',
      when: (f) => f.get('id') === 'user' && f.get('pw') === 'pass',
      respond: () => redirectResponse('/search.php', [`sess-shop=${SESS}; Max-Age=28800; path=/`]),
    },
    { method: 'POST', path: '/login.php', respond: () => htmlResponse(LOGIN_PAGE) },
    { path: '/search.php', respond: () => htmlResponse('<input id="idinp_breite">') },
    {
      method: 'POST',
      path: '/includes/php_ajax/ajax_search.php',
      when: (f) => f.get('func') === 'holeSuchergebnis',
      respond: (c) => {
        if (opts.sessionExpired) return htmlResponse(EXPIRED_REDIRECT, { contentType: UTF8_HTML })
        if (nurvfgOff) return jsonResponse(NURVFG_OFF, UTF8_HTML)
        return jsonResponse(c.form.get('hersteller') === 'MICHELIN' ? MICHELIN : P1, UTF8_HTML)
      },
    },
    {
      method: 'POST',
      path: '/includes/php_ajax/ajax_search.php',
      when: (f) => f.get('func') === 'filtereSuchergebnis' && f.get('filterart') === 'nurvfg',
      respond: () => {
        nurvfgOff = false
        return jsonResponse(P1, UTF8_HTML)
      },
    },
    {
      method: 'POST',
      path: '/includes/php_ajax/ajax_search.php',
      when: (f) => f.get('func') === 'filtereSuchergebnis' && f.get('filterart') === 'blaettern',
      respond: () => jsonResponse(P2, UTF8_HTML),
    },
    {
      method: 'POST',
      path: '/includes/php_ajax/ajax_global.php',
      when: (f) => f.get('func') === 'ladeBildanzeige',
      respond: () =>
        htmlResponse(DETAIL, { status: opts.detailStatus ?? 200, contentType: UTF8_HTML }),
    },
  ]
  return fakeFetch(routes)
}

const deps = (fetchFn: typeof fetch, maxOffers = 20) => ({
  credentials: { user: 'user', password: 'pass' },
  maxOffers,
  fetchFn,
  timeoutMs: 2000,
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof AdapterError) return e.code
    throw e
  }
  return 'NO_ERROR'
}

describe('parseGoeggelResults', () => {
  const offers = parseGoeggelResults(ergtab(P1))

  it('reads all 20 rows of a page', () => {
    expect(offers).toHaveLength(20)
  })

  it('reads the fields of a row', () => {
    expect(offers[0]).toMatchObject({
      shop: 'goeggel',
      shopArticleId: '981016000186162',
      ean: null,
      brand: 'LINGLONG',
      profile: 'SPORT MASTER',
      width: 205,
      height: 55,
      rim: 16,
      loadIndex: '91',
      speedIndex: 'V',
      stockImmediate: 0,
      stockTotal: 0,
      deliveryNote: 'ca. 3 Tage',
      season: 'sommer',
      netEkCents: 3500,
    })
  })

  it('reads own stock as immediately available', () => {
    const kumho = offers.find((o) => o.shopArticleId === '981016000095204')
    expect(kumho).toMatchObject({
      brand: 'KUMHO',
      stockImmediate: 184,
      stockTotal: 184,
      deliveryNote: 'sofort',
    })
  })

  it('keeps rows without load index, taking the speed index from the size', () => {
    const nankang = offers.find((o) => o.brand === 'NANKANG')
    expect(nankang).toMatchObject({ profile: 'NA-1', loadIndex: '', speedIndex: 'V', width: 205 })
  })

  it('returns no offers for an empty table', () => {
    expect(parseGoeggelResults('')).toEqual([])
  })

  it('AC23: a row without price is a layout change', () => {
    const broken = ergtab(P1).replace(/clsdiv_search_ek preiszahl/g, 'clsdiv_x')
    expect(() => parseGoeggelResults(broken)).toThrow(AdapterError)
  })
})

describe('Göggel page helpers', () => {
  it('reads the paging info', () => {
    expect(parseGoeggelPaging(filter(P1) + ergtab(P1))).toEqual({ from: 0, to: 20, total: 566 })
    expect(parseGoeggelPaging('nothing')).toBeNull()
  })

  it('detects whether "nur verfügbare Artikel" is active', () => {
    expect(isNurVerfuegbarActive(filter(P1))).toBe(true)
    expect(isNurVerfuegbarActive(filter(NURVFG_OFF))).toBe(false)
  })

  it('reads the EAN from the detail layer', () => {
    const html = (JSON.parse(DETAIL) as { html: string }).html
    expect(parseGoeggelDetailEan(html)).toBe('8808956238469')
    expect(parseGoeggelDetailEan('<table></table>')).toBeNull()
  })
})

describe('isAllowedGoeggelUrl', () => {
  const u = (p: string) => new URL(`https://goeggel-shop.com${p}`)
  it('allows login, search and the read-only AJAX functions', () => {
    expect(isAllowedGoeggelUrl(u('/login.php?m=search'))).toBe(true)
    expect(isAllowedGoeggelUrl(u('/search.php'))).toBe(true)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_search.php'), { func: 'holeSuchergebnis' }),
    ).toBe(true)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_search.php?sess-shop=1'), {
        func: 'filtereSuchergebnis',
      }),
    ).toBe(true)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_global.php'), { func: 'ladeBildanzeige' }),
    ).toBe(true)
  })

  it('AC21: refuses cart, order and other AJAX functions', () => {
    expect(isAllowedGoeggelUrl(u('/scart.php?site=write&s=1'))).toBe(false)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_global.php'), { func: 'ladeWkInhalt' }),
    ).toBe(false)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_modalfenster.php'), {
        func: 'updateWarenkorb',
      }),
    ).toBe(false)
    expect(
      isAllowedGoeggelUrl(u('/includes/php_ajax/ajax_search.php'), { func: 'artikelInAngebot' }),
    ).toBe(false)
    expect(isAllowedGoeggelUrl(new URL('https://evil.example/search.php'))).toBe(false)
  })
})

describe('searchGoeggel', () => {
  it('AC2: logs in, pages through the price-sorted list and keeps only stocked offers', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(query(), deps(fetchFn))
    // page 1: 2 stocked KUMHO, page 2: FALKEN + KUMHO; further pages repeat page 2 → stop
    expect(offers.map((o) => o.shopArticleId)).toEqual([
      '981016000095204',
      '981016000095233',
      '981016000219321',
      '981016000179479',
    ])
    expect(offers.every((o) => o.stockImmediate >= 4)).toBe(true)
    const search = calls.find((c) => c.form.get('func') === 'holeSuchergebnis')
    expect(Object.fromEntries(search!.form)).toMatchObject({
      suchart: 'bqz',
      breite: '205',
      querschnitt: '55',
      zoll: '16',
      saison: 'Alle',
      hersteller: '',
    })
  })

  it('AC13: fetches the EAN for every returned offer', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(query(), deps(fetchFn))
    expect(offers.every((o) => o.ean === '8808956238469')).toBe(true)
    expect(calls.filter((c) => c.form.get('func') === 'ladeBildanzeige')).toHaveLength(4)
  })

  it('keeps offers without EAN when the detail request fails', async () => {
    const { fetchFn } = shop({ detailStatus: 500 })
    const offers = await searchGoeggel(query(), deps(fetchFn))
    expect(offers).toHaveLength(4)
    expect(offers.every((o) => o.ean === null)).toBe(true)
  })

  it('AC6: stops at N offers', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(query(), deps(fetchFn, 2))
    expect(offers).toHaveLength(2)
    expect(calls.filter((c) => c.form.get('filterart') === 'blaettern')).toHaveLength(0)
  })

  it('AC3/AC3a: passes brand and season (Ganzjahr = allwetter)', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(
      query({ brands: ['MICHELIN'], seasons: ['sommer', 'ganzjahr'] }),
      deps(fetchFn),
    )
    const searches = calls.filter((c) => c.form.get('func') === 'holeSuchergebnis')
    expect(searches.map((c) => [c.form.get('hersteller'), c.form.get('saison')])).toEqual([
      ['MICHELIN', 'sommer'],
      ['MICHELIN', 'allwetter'],
    ])
    expect(offers.every((o) => o.brand === 'MICHELIN')).toBe(true)
  })

  it('switches "nur verfügbare Artikel" on when it is off', async () => {
    const { fetchFn, calls } = shop({ nurvfgInitiallyOff: true })
    await searchGoeggel(query(), deps(fetchFn))
    expect(calls.filter((c) => c.form.get('filterart') === 'nurvfg')).toHaveLength(1)
  })

  it('AC22: wrong credentials → LOGIN_FAILED', async () => {
    const { fetchFn } = shop()
    const p = searchGoeggel(query(), {
      ...deps(fetchFn),
      credentials: { user: 'user', password: 'x' },
    })
    expect(await codeOf(p)).toBe('LOGIN_FAILED')
  })

  it('missing credentials → LOGIN_FAILED', async () => {
    const { fetchFn } = shop()
    expect(await codeOf(searchGoeggel(query(), { ...deps(fetchFn), credentials: null }))).toBe(
      'LOGIN_FAILED',
    )
  })
})

describe('Göggel session expiry', () => {
  it('AC41: the JS redirect to the login page is reported as SESSION_EXPIRED, not LAYOUT_CHANGED', async () => {
    const { fetchFn } = shop({ sessionExpired: true })
    expect(await codeOf(searchGoeggel(query(), deps(fetchFn)))).toBe('SESSION_EXPIRED')
  })
})

describe('Göggel EAN cache (AC46)', () => {
  const DETAIL_EAN = '8808956238469'
  const cache = (
    known: Record<string, string> = {},
    opts: { failGet?: boolean; failPut?: boolean } = {},
  ) => {
    const puts: Map<string, string>[] = []
    return {
      puts,
      eanCache: {
        async get(ids: string[]) {
          if (opts.failGet) throw new Error('db down')
          return new Map(ids.filter((i) => i in known).map((i) => [i, known[i]] as const))
        },
        async put(entries: Map<string, string>) {
          if (opts.failPut) throw new Error('db down')
          puts.push(entries)
        },
      },
    }
  }
  const detailCalls = (calls: { form: URLSearchParams }[]) =>
    calls.filter((c) => c.form.get('func') === 'ladeBildanzeige').map((c) => c.form.get('int'))
  const ids = async () =>
    (await searchGoeggel(query(), deps(shop().fetchFn))).map((o) => o.shopArticleId)

  it('takes known EANs from the cache, asks the shop only for the others and stores those', async () => {
    const [a, b, c, d] = await ids()
    const { eanCache, puts } = cache({ [a]: '1111111111111', [b]: '2222222222222' })
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(query(), { ...deps(fetchFn), eanCache })
    const ean = (id: string) => offers.find((o) => o.shopArticleId === id)?.ean
    expect([ean(a), ean(b), ean(c), ean(d)]).toEqual([
      '1111111111111',
      '2222222222222',
      DETAIL_EAN,
      DETAIL_EAN,
    ])
    expect(detailCalls(calls).sort()).toEqual([c, d].sort())
    expect(puts).toHaveLength(1)
    expect([...puts[0]].sort()).toEqual(
      [
        [c, DETAIL_EAN],
        [d, DETAIL_EAN],
      ].sort(),
    )
  })

  it('asks the shop for no detail when every EAN is cached', async () => {
    const all = await ids()
    const { eanCache, puts } = cache(Object.fromEntries(all.map((i) => [i, '3333333333333'])))
    const { fetchFn, calls } = shop()
    const offers = await searchGoeggel(query(), { ...deps(fetchFn), eanCache })
    expect(offers.every((o) => o.ean === '3333333333333')).toBe(true)
    expect(detailCalls(calls)).toEqual([])
    expect(puts).toEqual([])
  })

  it('still answers with EANs from the shop when the cache cannot be read or written', async () => {
    for (const opts of [{ failGet: true }, { failPut: true }]) {
      const { fetchFn, calls } = shop()
      const offers = await searchGoeggel(query(), { ...deps(fetchFn), ...cache({}, opts) })
      expect(offers).toHaveLength(4)
      expect(offers.every((o) => o.ean === DETAIL_EAN)).toBe(true)
      expect(detailCalls(calls)).toHaveLength(4)
    }
  })

  it('never stores a missing EAN', async () => {
    const { eanCache, puts } = cache()
    const { fetchFn } = shop({ detailStatus: 500 })
    const offers = await searchGoeggel(query(), { ...deps(fetchFn), eanCache })
    expect(offers.every((o) => o.ean === null)).toBe(true)
    expect(puts).toEqual([])
  })
})
