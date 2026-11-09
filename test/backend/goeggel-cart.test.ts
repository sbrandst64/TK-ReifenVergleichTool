import { describe, expect, it } from 'vitest'
import {
  addToCartGoeggel,
  isAllowedGoeggelUrl,
  parseGoeggelCartPositions,
  parseGoeggelOrderRows,
} from '../../supabase/functions/_shared/adapters/goeggel.ts'
import { ShopSession } from '../../supabase/functions/_shared/http-session.ts'
import { AdapterError, type CartItem } from '../../supabase/functions/_shared/types.ts'
import {
  fakeFetch,
  fixture,
  htmlResponse,
  jsonResponse,
  redirectResponse,
  type FakeRoute,
  type RecordedCall,
} from '../helpers/fake-fetch.ts'

const SESS = '0'.repeat(32)
const P1 = fixture('goeggel/search-p1.json')
const P2 = fixture('goeggel/page2.json')
const ergtab = (json: string) => (JSON.parse(json) as { ergtab: string }).ergtab
const LOGIN_PAGE = `<form name="login" method="POST" action="/login.php?lo=&m=search&lang=de&f=1&h=goeggel&sess-shop=${SESS}">
<input type="hidden" name="s" value="1" /><input type="text" name="id" id='idinploginuser'><input type="password" id='idinploginpwd' name="pw"></form>`
const UTF8_HTML = 'text/html; charset=UTF-8'

// Row 4 of the first result page and row 0 of the second one (anonymized fixtures).
const ON_PAGE_1 = { id: '981016000137571', index: 4, key: '600' }
const ON_PAGE_2 = { id: '981016000065772', index: 0, key: '503' }

interface Position {
  artikel: string
  profil: string
  hersteller: string
  anz: number
}
const BERLIN: Position = {
  artikel: '205/55VR16TLXL',
  profil: 'Summer HP 1',
  hersteller: 'BERLINTYRES',
  anz: 2,
}

/** Cart page with the markup of the real shop (position rows only, no customer data). */
const cartPage = (
  positions: Position[],
) => `<FORM name="warenkorb" action="/scart.php?site=header&s=1&sess-shop=${SESS}" method="POST">
<input type="hidden" name="anzds" value="${positions.length}">
<div CLASS='clsdiv_scart_postable_row clsdiv_scart_postable_header TABHEADERBACK'><div class="clsdiv_scart_postable_artikel">Artikel</div></div>
${positions
  .map(
    (p, i) => `<div CLASS="clsdiv_scart_postable_row TR2">
<input type='hidden' name='id${i}' value="11605${i}">
<input type='hidden' name='artikel${i}' value="${p.artikel}">
<input type='hidden' name='profil${i}' value="${p.profil}">
<input type='hidden' name='hersteller${i}' value="${p.hersteller}">
<input id='bestellfeld' type='text' maxlength='2' size='1' name='anz${i}' value='${p.anz}' readonly>
</div>`,
  )
  .join('\n')}
${positions.length === 0 ? 'Aktuell keine Positionen im Warenkorb' : ''}</FORM>`

const item = (over: Partial<CartItem> = {}): CartItem => ({
  shopArticleId: ON_PAGE_1.id,
  quantity: 2,
  width: 205,
  height: 55,
  rim: 16,
  description: '',
  ...over,
})

function shop(opts: { cart?: Position[]; cartIsLogin?: boolean } = {}) {
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
      respond: () => jsonResponse(P1, UTF8_HTML),
    },
    {
      method: 'POST',
      path: '/includes/php_ajax/ajax_search.php',
      when: (f) => f.get('func') === 'filtereSuchergebnis' && f.get('filterart') === 'blaettern',
      respond: () => jsonResponse(P2, UTF8_HTML),
    },
    {
      method: 'POST',
      path: /^\/scart\.php\?site=write&/,
      respond: () => redirectResponse(`scart.php?site=show&sess-shop=${SESS}`),
    },
    {
      path: /^\/scart\.php\?site=show/,
      respond: () =>
        opts.cartIsLogin
          ? htmlResponse(LOGIN_PAGE)
          : htmlResponse(cartPage(opts.cart ?? [BERLIN]), { contentType: UTF8_HTML }),
    },
  ]
  return fakeFetch(routes)
}

const deps = (fetchFn: typeof fetch) => ({
  credentials: { user: 'user', password: 'pass' },
  maxOffers: 20,
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

const writes = (calls: RecordedCall[]) =>
  calls.filter((c) => c.method === 'POST' && c.url.pathname === '/scart.php')

describe('parseGoeggelOrderRows', () => {
  it('reads article id, row number (key) and quantity field of all 20 rows', () => {
    const rows = parseGoeggelOrderRows(ergtab(P1))
    expect(rows).toHaveLength(20)
    expect(rows[ON_PAGE_1.index]).toEqual({
      shopArticleId: ON_PAGE_1.id,
      quantityField: 'anz4',
      keyField: 'key4',
      key: '600',
      artikel: '205/55VR16TLXL',
      brand: 'BERLINTYRES',
      profile: 'Summer HP 1',
    })
  })

  it('AC23: a row without its key field is a layout change, not a guess', () => {
    const broken = ergtab(P1).replace("name='key4'", "name='schluessel4'")
    expect(() => parseGoeggelOrderRows(broken)).toThrowError(AdapterError)
  })
})

describe('parseGoeggelCartPositions', () => {
  it('reads the positions of the cart page', () => {
    expect(
      parseGoeggelCartPositions(cartPage([BERLIN, { ...BERLIN, profil: 'X', anz: 4 }])),
    ).toEqual([
      { artikel: '205/55VR16TLXL', profile: 'Summer HP 1', brand: 'BERLINTYRES', quantity: 2 },
      { artikel: '205/55VR16TLXL', profile: 'X', brand: 'BERLINTYRES', quantity: 4 },
    ])
  })

  it('an empty cart has no positions', () => {
    expect(parseGoeggelCartPositions(cartPage([]))).toEqual([])
  })
})

describe('isAllowedGoeggelUrl (cart)', () => {
  const url = (search: string) => new URL(`https://goeggel-shop.com/scart.php${search}`)
  const form = { anz0: '2', key0: '600', vkpreis: 'vkpreis_opt', opt7: '' }

  it('allows writing quantities into the cart and showing the cart', () => {
    expect(isAllowedGoeggelUrl(url(`?site=write&s=1&sess-shop=${SESS}`), form)).toBe(true)
    expect(isAllowedGoeggelUrl(url(`?site=show&sess-shop=${SESS}`))).toBe(true)
  })

  it.each([
    ['the order step', '?site=header&s=1', form],
    ['emptying the cart', '?site=delall', undefined],
    ['deleting a position', '?site=delone&id=1', undefined],
    ['changing the delivery address', '?site=extadress', undefined],
    ['writing via GET', '?site=write&s=1', undefined],
    ['posting to the cart page', '?site=show', form],
    ['a write with a field of the order form', '?site=write&s=1', { ...form, kuaufnr: 'x' }],
    ['no site at all', '', undefined],
  ])('AC21: refuses %s', (_what, search, f) => {
    expect(isAllowedGoeggelUrl(url(search), f)).toBe(false)
  })

  it('AC21: the order step is rejected before anything is sent to the shop', async () => {
    const { fetchFn, calls } = shop()
    const session = new ShopSession({
      baseUrl: 'https://goeggel-shop.com',
      isAllowed: isAllowedGoeggelUrl,
      fetchFn,
    })
    expect(await codeOf(session.post('/scart.php?site=header&s=1', { kuaufnr: '' }))).toBe(
      'FORBIDDEN_ENDPOINT',
    )
    expect(calls).toHaveLength(0)
  })
})

describe('addToCartGoeggel', () => {
  it('searches the size in the same session and posts the row number with the quantity', async () => {
    const { fetchFn, calls } = shop()
    const results = await addToCartGoeggel([item()], deps(fetchFn))
    expect(results).toEqual([{ shopArticleId: ON_PAGE_1.id, ok: true, error: null }])

    const search = calls.find((c) => c.form.get('func') === 'holeSuchergebnis')
    expect(Object.fromEntries(search!.form)).toMatchObject({
      breite: '205',
      querschnitt: '55',
      zoll: '16',
    })
    const [write] = writes(calls)
    expect(write.url.searchParams.get('site')).toBe('write')
    expect(write.url.searchParams.get('sess-shop')).toBe(SESS)
    const sent = Object.fromEntries(write.form)
    expect(Object.keys(sent)).toHaveLength(42) // 20 quantities + 20 keys + vkpreis + opt7
    expect(sent.anz4).toBe('2')
    expect(sent.key4).toBe(ON_PAGE_1.key)
    expect(sent.key0).toBe('939')
    const others = Object.entries(sent).filter(([k]) => /^anz\d+$/.test(k) && k !== 'anz4')
    expect(others.every(([, v]) => v === '')).toBe(true)
    expect(sent).toMatchObject({ vkpreis: 'vkpreis_opt', opt7: '' })
  })

  it('pages through the results until the tyre is found', async () => {
    const { fetchFn, calls } = shop({
      cart: [{ artikel: '', profil: '', hersteller: '', anz: 4 }],
    })
    // which article that row is does not matter here, only that the right row number is posted
    await addToCartGoeggel([item({ shopArticleId: ON_PAGE_2.id, quantity: 4 })], deps(fetchFn))
    const [write] = writes(calls)
    expect(write.form.get('anz0')).toBe('4')
    expect(write.form.get('key0')).toBe(ON_PAGE_2.key)
  })

  it('a tyre that is no longer in the result list → ITEM_NOT_FOUND, nothing is written', async () => {
    const { fetchFn, calls } = shop()
    const results = await addToCartGoeggel([item({ shopArticleId: '999' })], deps(fetchFn))
    expect(results).toEqual([
      {
        shopArticleId: '999',
        ok: false,
        error: expect.objectContaining({ code: 'ITEM_NOT_FOUND' }),
      },
    ])
    expect(writes(calls)).toHaveLength(0)
  })

  it('the cart page does not show the position afterwards → CART_REJECTED', async () => {
    const { fetchFn } = shop({ cart: [] })
    const results = await addToCartGoeggel([item()], deps(fetchFn))
    expect(results.map((r) => [r.ok, r.error?.code])).toEqual([[false, 'CART_REJECTED']])
  })

  it('a lower quantity than requested in the cart → CART_REJECTED', async () => {
    const { fetchFn } = shop({ cart: [{ ...BERLIN, anz: 1 }] })
    const results = await addToCartGoeggel([item()], deps(fetchFn))
    expect(results[0].error?.code).toBe('CART_REJECTED')
  })

  it('AC24: the login page instead of the cart → SESSION_EXPIRED for that item', async () => {
    const { fetchFn } = shop({ cartIsLogin: true })
    const results = await addToCartGoeggel([item()], deps(fetchFn))
    expect(results[0].error?.code).toBe('SESSION_EXPIRED')
  })

  it('AC21: only ever calls login, search, cart write and cart display', async () => {
    const { fetchFn, calls } = shop()
    await addToCartGoeggel([item()], deps(fetchFn))
    const seen = new Set(
      calls.map(
        (c) =>
          `${c.method} ${c.url.pathname}${c.url.pathname === '/scart.php' ? `?site=${c.url.searchParams.get('site')}` : ''}`,
      ),
    )
    expect([...seen].sort()).toEqual([
      'GET /login.php',
      'GET /scart.php?site=show',
      'GET /search.php',
      'POST /includes/php_ajax/ajax_search.php',
      'POST /login.php',
      'POST /scart.php?site=write',
    ])
  })

  it('wrong credentials → LOGIN_FAILED', async () => {
    const { fetchFn } = shop()
    const bad = { ...deps(fetchFn), credentials: { user: 'user', password: 'falsch' } }
    expect(await codeOf(addToCartGoeggel([item()], bad))).toBe('LOGIN_FAILED')
  })
})
