import { describe, expect, it } from 'vitest'
import {
  isAllowedWeichbergerUrl,
  parseWeichbergerPageCount,
  parseWeichbergerResults,
  searchWeichberger,
} from '../../supabase/functions/_shared/adapters/weichberger.ts'
import { AdapterError, type SearchQuery } from '../../supabase/functions/_shared/types.ts'
import {
  fakeFetch,
  fixture,
  htmlResponse,
  jsonResponse,
  redirectResponse,
  type FakeRoute,
} from '../helpers/fake-fetch.ts'

const CAT = '40d3d9b0-2490-4905-850b-a0b2b892196a'
const P1 = fixture('weichberger/result-p1.html')
const LAST = fixture('weichberger/result-last.html')
const FOOTER = fixture('weichberger/footer.html')
const LOGIN_FORM =
  '<form action="/100/Account/Login" method="post"><input name="UserName"/><input name="Password" type="password"/></form>'

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  width: 205,
  height: 55,
  rim: 16,
  quantity: 4,
  seasons: [],
  brands: [],
  ...over,
})

function shop(opts: { expireOnResults?: boolean } = {}) {
  let page = 0
  const routes: FakeRoute[] = [
    {
      path: '/100/Account/Login',
      respond: () => htmlResponse(LOGIN_FORM, { cookies: ['ASP.NET_SessionId=s1; path=/; HttpOnly'] }),
    },
    {
      method: 'POST',
      path: '/100/Account/Login',
      when: (f) => f.get('UserName') === 'user' && f.get('Password') === 'pass',
      respond: () => redirectResponse('/115/Account/RedirectIntern?time=415', ['.ASPXAUTH=tok; path=/; HttpOnly']),
    },
    { method: 'POST', path: '/100/Account/Login', respond: () => htmlResponse(LOGIN_FORM) },
    { path: '/115/Account/RedirectIntern', respond: () => redirectResponse('/115') },
    { path: '/115', respond: () => htmlResponse('<a href="/115/Account/LogOff">Abmelden</a>') },
    {
      path: '/115/c/re',
      respond: () => htmlResponse(`<script>$("#h").load('/115/Items/SearchHeader?catID=${CAT}');</script>`),
    },
    {
      method: 'POST',
      path: '/115/Items/TyreSearch',
      respond: () => redirectResponse(`/115/c/${CAT}?back=0&tyreRimSearch=True&TyreWidth=205`),
    },
    { path: `/115/c/${CAT}`, respond: () => htmlResponse('<div id="search-content"></div>') },
    {
      method: 'POST',
      path: `/115/Items/SearchResult/${CAT}`,
      respond: (c) => {
        page = Number(c.form.get('page'))
        return jsonResponse({ success: true, redirectToUrl: null })
      },
    },
    {
      path: '/115/Items/SearchResult',
      respond: () =>
        opts.expireOnResults ? redirectResponse('/100/Account/Login') : htmlResponse(page === 0 ? P1 : LAST),
    },
    { path: '/115/Items/SearchFooter', respond: () => htmlResponse(FOOTER) },
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

describe('parseWeichbergerResults', () => {
  const offers = parseWeichbergerResults(P1)

  it('reads all 15 articles of a result page', () => {
    expect(offers).toHaveLength(15)
  })

  it('reads the fields of an article', () => {
    expect(offers[0]).toMatchObject({
      shop: 'weichberger',
      shopArticleId: '1061530',
      ean: '4250427419633',
      brand: 'SUMITOMO',
      profile: 'WT200',
      width: 205,
      height: 55,
      rim: 16,
      loadIndex: '91',
      speedIndex: 'H',
      stockImmediate: 20,
      stockTotal: 35,
      netEkCents: 4000,
    })
  })

  it('counts Nebenlager only in the total stock', () => {
    const falken = offers.find((o) => o.brand === 'FALKEN')
    expect(falken).toMatchObject({ stockImmediate: 0, stockTotal: 7 })
  })

  it('returns no offers for a page without articles', () => {
    expect(parseWeichbergerResults('<div id="searchHeaderText"></div><div class="items row"></div>')).toEqual([])
  })

  it('AC18/AC23: a missing price is a layout change, not a wrong price', () => {
    const broken = P1.replace(/id="netprice"/g, 'id="other"')
    expect(() => parseWeichbergerResults(broken)).toThrow(AdapterError)
    try {
      parseWeichbergerResults(broken)
    } catch (e) {
      expect((e as AdapterError).code).toBe('LAYOUT_CHANGED')
    }
  })

  it('a login page instead of results means the session expired', () => {
    expect(() => parseWeichbergerResults(LOGIN_FORM)).toThrow(/Sitzung/)
  })
})

describe('parseWeichbergerPageCount', () => {
  it('reads the highest page from the footer', () => {
    expect(parseWeichbergerPageCount(FOOTER)).toBe(4)
  })

  it('is 1 without pagination', () => {
    expect(parseWeichbergerPageCount('')).toBe(1)
  })
})

describe('isAllowedWeichbergerUrl', () => {
  it.each([
    '/100/Account/Login',
    '/115/Account/RedirectIntern?time=1',
    '/115',
    '/115/c/re',
    `/115/c/${CAT}?TyreWidth=205`,
    '/115/Items/TyreSearch',
    `/115/Items/SearchResult/${CAT}`,
    '/115/Items/SearchResult',
    '/115/Items/SearchFooter',
  ])('allows %s', (path) => {
    expect(isAllowedWeichbergerUrl(new URL(`https://b2b.weichberger.at${path}`))).toBe(true)
  })

  it.each(['/115/ck/Checkout', '/115/b/JsonInsertIntoBasket', '/115/cu/Orders', '/115/Account/LogOff'])(
    'AC21: refuses %s',
    (path) => {
      expect(isAllowedWeichbergerUrl(new URL(`https://b2b.weichberger.at${path}`))).toBe(false)
    },
  )

  it('refuses other hosts', () => {
    expect(isAllowedWeichbergerUrl(new URL('https://evil.example/115/c/re'))).toBe(false)
  })
})

describe('searchWeichberger', () => {
  it('logs in, searches with the stock filter and pages until enough offers', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchWeichberger(query(), deps(fetchFn))
    // 15 from page 1 + 2 distinct from the later pages (repeated) = 17
    expect(offers).toHaveLength(17)
    const tyreSearch = calls.find((c) => c.url.pathname === '/115/Items/TyreSearch')
    expect(Object.fromEntries(tyreSearch!.form)).toMatchObject({
      TyreWidth: '205',
      AspectRatio: '55',
      WheelDiameter: '16',
      Manufacturer: '',
      TyreType: '0',
      categoryId: CAT,
    })
    const resultPosts = calls.filter((c) => c.method === 'POST' && c.url.pathname.startsWith('/115/Items/SearchResult/'))
    expect(resultPosts.map((c) => c.form.get('page'))).toEqual(['0', '1', '2', '3'])
    expect(resultPosts.every((c) => c.form.get('quantity') === '4')).toBe(true)
  })

  it('AC6: returns at most N offers, cheapest first, without fetching further pages', async () => {
    const { fetchFn, calls } = shop()
    const offers = await searchWeichberger(query(), deps(fetchFn, 5))
    expect(offers).toHaveLength(5)
    const prices = offers.map((o) => o.netEkCents)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
    expect(calls.filter((c) => c.url.pathname.startsWith('/115/Items/SearchResult/'))).toHaveLength(1)
  })

  it('AC2: drops offers whose total stock is below the quantity', async () => {
    const { fetchFn } = shop()
    const offers = await searchWeichberger(query({ quantity: 8 }), deps(fetchFn))
    expect(offers.every((o) => o.stockTotal >= 8)).toBe(true)
    expect(offers.some((o) => o.brand === 'FALKEN' && o.stockTotal === 7)).toBe(false)
  })

  it('AC3/AC3a: one search per brand and season, in the same session', async () => {
    const { fetchFn, calls } = shop()
    await searchWeichberger(query({ brands: ['MICHELIN', 'CONTINENTAL'], seasons: ['sommer'] }), deps(fetchFn, 5))
    const searches = calls.filter((c) => c.url.pathname === '/115/Items/TyreSearch')
    expect(searches.map((c) => [c.form.get('Manufacturer'), c.form.get('TyreType')])).toEqual([
      ['MICHELIN', '1'],
      ['CONTINENTAL', '1'],
    ])
    expect(calls.filter((c) => c.method === 'POST' && c.url.pathname === '/100/Account/Login')).toHaveLength(1)
  })

  it('maps seasons to the shop codes', async () => {
    const { fetchFn, calls } = shop()
    await searchWeichberger(query({ seasons: ['winter', 'ganzjahr'] }), deps(fetchFn, 5))
    const types = calls.filter((c) => c.url.pathname === '/115/Items/TyreSearch').map((c) => c.form.get('TyreType'))
    expect(types).toEqual(['2', '3'])
  })

  it('AC22: wrong credentials → LOGIN_FAILED', async () => {
    const { fetchFn } = shop()
    const p = searchWeichberger(query(), { ...deps(fetchFn), credentials: { user: 'user', password: 'wrong' } })
    expect(await codeOf(p)).toBe('LOGIN_FAILED')
  })

  it('missing credentials → LOGIN_FAILED without contacting the shop', async () => {
    const { fetchFn, calls } = shop()
    expect(await codeOf(searchWeichberger(query(), { ...deps(fetchFn), credentials: null }))).toBe('LOGIN_FAILED')
    expect(calls).toHaveLength(0)
  })

  it('AC24: redirect to the login page during the search → SESSION_EXPIRED', async () => {
    const { fetchFn } = shop({ expireOnResults: true })
    expect(await codeOf(searchWeichberger(query(), deps(fetchFn)))).toBe('SESSION_EXPIRED')
  })
})
