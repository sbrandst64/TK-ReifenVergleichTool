import { describe, expect, it } from 'vitest'
import {
  addToCartWeichberger,
  isAllowedWeichbergerUrl,
  parseWeichbergerAutoOrder,
} from '../../supabase/functions/_shared/adapters/weichberger.ts'
import { ShopSession } from '../../supabase/functions/_shared/http-session.ts'
import { AdapterError, type CartItem } from '../../supabase/functions/_shared/types.ts'
import {
  fakeFetch,
  fixture,
  htmlResponse,
  jsonResponse,
  redirectResponse,
  type FakeRoute,
} from '../helpers/fake-fetch.ts'

// Anonymized settings form of the real shop; "Automatische Bestellung" is switched off in it.
const SETTINGS_OFF = fixture('weichberger/usersettings.html')
const SWITCH = 'name="Model[3].UserSettings[1].ValueBoolean" type="checkbox" value="true" />'
const SETTINGS_ON = SETTINGS_OFF.replace(SWITCH, SWITCH.replace(' />', ' checked="checked" />'))
const LOGIN_FORM =
  '<form action="/100/Account/Login" method="post"><input name="UserName"/><input name="Password" type="password"/></form>'
const INSERTED = {
  success: true,
  UserNotification: {
    Type: 1,
    Title: 'Artikel eingefügt',
    Message: 'Der Artikel wurde eingefügt.',
  },
}

const item = (over: Partial<CartItem> = {}): CartItem => ({
  shopArticleId: '2193913',
  quantity: 4,
  width: 195,
  height: 65,
  rim: 15,
  description: 'KUM 195/65R15 WP52+ 91T 3PMSF M&S TL',
  ...over,
})

function shop(opts: { settings?: string; insert?: unknown; settingsToLogin?: boolean } = {}) {
  const routes: FakeRoute[] = [
    {
      path: '/100/Account/Login',
      respond: () =>
        htmlResponse(LOGIN_FORM, { cookies: ['ASP.NET_SessionId=s1; path=/; HttpOnly'] }),
    },
    {
      method: 'POST',
      path: '/100/Account/Login',
      when: (f) => f.get('UserName') === 'user' && f.get('Password') === 'pass',
      respond: () =>
        redirectResponse('/115/Account/RedirectIntern?time=415', [
          '.ASPXAUTH=tok; path=/; HttpOnly',
        ]),
    },
    { method: 'POST', path: '/100/Account/Login', respond: () => htmlResponse(LOGIN_FORM) },
    { path: '/115/Account/RedirectIntern', respond: () => redirectResponse('/115') },
    { path: '/115', respond: () => htmlResponse('<a href="/115/Account/LogOff">Abmelden</a>') },
    {
      path: '/115/cu/UserSettings',
      respond: () =>
        opts.settingsToLogin
          ? redirectResponse('/100/Account/Login')
          : htmlResponse(opts.settings ?? SETTINGS_OFF),
    },
    {
      method: 'POST',
      path: '/115/b/JsonInsertIntoBasket',
      respond: () => jsonResponse(opts.insert ?? INSERTED),
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

const inserts = (calls: { url: URL }[]) =>
  calls.filter((c) => c.url.pathname.endsWith('/b/JsonInsertIntoBasket'))

describe('parseWeichbergerAutoOrder', () => {
  it('reads "off" from the real settings form', () => {
    expect(parseWeichbergerAutoOrder(SETTINGS_OFF)).toBe('off')
  })

  it('reads "on" when the switch is ticked', () => {
    expect(parseWeichbergerAutoOrder(SETTINGS_ON)).toBe('on')
  })

  it.each([
    ['the setting is missing', SETTINGS_OFF.replaceAll('Automatische Bestellung', 'Etwas anderes')],
    ['the page is something else', '<html><body><h1>Wartung</h1></body></html>'],
    [
      'the switch is not a checkbox',
      SETTINGS_OFF.replace(SWITCH, SWITCH.replace('checkbox', 'text')),
    ],
    ['the setting appears twice', SETTINGS_OFF + SETTINGS_ON],
  ])('is "unknown" when %s (fail closed)', (_why, html) => {
    expect(parseWeichbergerAutoOrder(html)).toBe('unknown')
  })
})

describe('isAllowedWeichbergerUrl (cart)', () => {
  const url = (path: string) => new URL(`https://b2b.weichberger.at${path}`)

  it('allows reading the settings and putting an article into the basket', () => {
    expect(isAllowedWeichbergerUrl(url('/115/cu/UserSettings'))).toBe(true)
    expect(isAllowedWeichbergerUrl(url('/115/b/JsonInsertIntoBasket'), { itemID: '1' })).toBe(true)
  })

  it('non-goal 7: the settings page can only be read, never posted to', () => {
    expect(isAllowedWeichbergerUrl(url('/115/cu/UserSettings'), { x: '1' })).toBe(false)
    expect(isAllowedWeichbergerUrl(url('/115/cu/ChangeUserSettings'), { x: '1' })).toBe(false)
  })

  it.each([
    '/115/ck/Checkout',
    '/115/b/Basket',
    '/115/b/JsonResetBasket',
    '/115/cu/Orders',
    '/115/cu/InsertIntoOffer',
    '/115/Account/LogOff',
  ])('AC21: refuses %s as GET and as POST', (path) => {
    expect(isAllowedWeichbergerUrl(url(path))).toBe(false)
    expect(isAllowedWeichbergerUrl(url(path), { any: '1' })).toBe(false)
  })

  it('AC21: an order endpoint is rejected before anything is sent to the shop', async () => {
    const { fetchFn, calls } = shop()
    const session = new ShopSession({
      baseUrl: 'https://b2b.weichberger.at',
      isAllowed: isAllowedWeichbergerUrl,
      fetchFn,
    })
    expect(await codeOf(session.post('/115/ck/Checkout', { confirm: '1' }))).toBe(
      'FORBIDDEN_ENDPOINT',
    )
    expect(calls).toHaveLength(0)
  })
})

describe('addToCartWeichberger', () => {
  it('checks the order setting, then puts every item with its quantity into the basket', async () => {
    const { fetchFn, calls } = shop()
    const results = await addToCartWeichberger(
      [item(), item({ shopArticleId: '2040920', quantity: 2 })],
      deps(fetchFn),
    )
    expect(results).toEqual([
      { shopArticleId: '2193913', ok: true, error: null },
      { shopArticleId: '2040920', ok: true, error: null },
    ])
    const paths = calls.map((c) => c.url.pathname)
    expect(paths.indexOf('/115/cu/UserSettings')).toBeLessThan(
      paths.indexOf('/115/b/JsonInsertIntoBasket'),
    )
    expect(inserts(calls).map((c) => Object.fromEntries(c.form))).toEqual([
      {
        itemID: '2193913',
        quantity: '4',
        imagepath: '',
        description: 'KUM 195/65R15 WP52+ 91T 3PMSF M&S TL',
        info: '',
      },
      {
        itemID: '2040920',
        quantity: '2',
        imagepath: '',
        description: 'KUM 195/65R15 WP52+ 91T 3PMSF M&S TL',
        info: '',
      },
    ])
  })

  it('AC19: automatic ordering is on → AUTO_ORDER_ENABLED, nothing is put into the basket', async () => {
    const { fetchFn, calls } = shop({ settings: SETTINGS_ON })
    expect(await codeOf(addToCartWeichberger([item()], deps(fetchFn)))).toBe('AUTO_ORDER_ENABLED')
    expect(inserts(calls)).toHaveLength(0)
  })

  it('AC20: the setting cannot be read → AUTO_ORDER_UNKNOWN, nothing is put into the basket', async () => {
    const { fetchFn, calls } = shop({ settings: '<html><body>Wartungsarbeiten</body></html>' })
    expect(await codeOf(addToCartWeichberger([item()], deps(fetchFn)))).toBe('AUTO_ORDER_UNKNOWN')
    expect(inserts(calls)).toHaveLength(0)
  })

  it('a redirect to the login page instead of the settings → SESSION_EXPIRED, nothing inserted', async () => {
    const { fetchFn, calls } = shop({ settingsToLogin: true })
    expect(await codeOf(addToCartWeichberger([item()], deps(fetchFn)))).toBe('SESSION_EXPIRED')
    expect(inserts(calls)).toHaveLength(0)
  })

  it('reports an item the shop does not accept, and still tries the next one', async () => {
    const { fetchFn, calls } = shop({ insert: { success: false } })
    const results = await addToCartWeichberger(
      [item(), item({ shopArticleId: '2040920' })],
      deps(fetchFn),
    )
    expect(results.map((r) => [r.ok, r.error?.code])).toEqual([
      [false, 'CART_REJECTED'],
      [false, 'CART_REJECTED'],
    ])
    expect(inserts(calls)).toHaveLength(2)
  })

  it('AC21: never sends anything that looks like an order confirmation', async () => {
    const { fetchFn, calls } = shop()
    await addToCartWeichberger([item()], deps(fetchFn))
    expect(calls.every((c) => !/checkout|order|bestell/i.test(c.url.pathname))).toBe(true)
  })

  it('wrong credentials → LOGIN_FAILED', async () => {
    const { fetchFn } = shop()
    const bad = { ...deps(fetchFn), credentials: { user: 'user', password: 'falsch' } }
    expect(await codeOf(addToCartWeichberger([item()], bad))).toBe('LOGIN_FAILED')
  })
})
