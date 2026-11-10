// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PDF_TEXTS, type PdfTexts } from '../supabase/functions/_shared/pdf-texts.ts'
import type {
  ApiErrorCode,
  SearchResponse,
  ShopId,
  TireOffer,
} from '../supabase/functions/_shared/types.ts'
import { UnauthorizedError, type CartFn, type SearchFn, type SettingsApi } from './api.ts'
import { App } from './App.tsx'

// No network in tests: the default settings service answers with the template texts.
vi.mock('./api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api.ts')>()),
  defaultSettings: {
    load: async () => DEFAULT_PDF_TEXTS,
    save: async (_code: string, texts: PdfTexts) => texts,
  },
}))

let seq = 0
const offer = (over: Partial<TireOffer> = {}): TireOffer => ({
  shop: 'goeggel',
  shopArticleId: String(++seq),
  ean: null,
  brand: 'KUMHO',
  profile: 'ES31',
  width: 205,
  height: 55,
  rim: 16,
  loadIndex: '91',
  speedIndex: 'H',
  description: '',
  stockImmediate: 20,
  stockTotal: 20,
  deliveryNote: 'sofort',
  season: 'sommer',
  priceGrossCents: 10700,
  shippingConfigured: true,
  delayed: false,
  ...over,
})
const ok = (shop: ShopId, offers: TireOffer[]): SearchResponse => ({ shop, offers, error: null })
const never = () => new Promise<SearchResponse>(() => {})

function searchWith(responses: Partial<Record<ShopId, () => Promise<SearchResponse>>>) {
  return vi.fn<SearchFn>((shop) => (responses[shop] ?? (() => Promise.resolve(ok(shop, []))))())
}

// holdMs 0: a shop's offers show as soon as they arrive; the hold itself is tested under AC48
async function renderAndSearch(search: SearchFn, holdMs = 0) {
  localStorage.setItem('werkstatt-code', 'abc')
  const user = userEvent.setup()
  render(<App search={search} holdMs={holdMs} />)
  await user.click(screen.getByRole('button', { name: 'Suchen' }))
  return user
}

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('shows the TK Kopf logo top left, before the title', () => {
    render(<App search={vi.fn<SearchFn>()} />)
    const logo = screen.getByRole('img', { name: 'TK Kopf GmbH' })
    expect(logo.getAttribute('src')).toMatch(/logos\/tk-kopf\.jpg$/)
    const title = screen.getByRole('heading', { level: 1, name: 'Reifen-Preisvergleich' })
    expect(logo.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows both shop logos in the header as links that open the shop in a new tab', () => {
    render(<App search={vi.fn<SearchFn>()} />)
    const nav = screen.getByRole('navigation', { name: 'Shops öffnen' })
    const expected: [string, string, RegExp][] = [
      ['Weichberger-Shop öffnen', 'https://b2b.weichberger.at/', /logos\/weichberger\.png$/],
      ['Göggel-Shop öffnen', 'https://goeggel-shop.com/', /logos\/goeggel\.png$/],
    ]
    for (const [name, href, src] of expected) {
      const link = within(nav).getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      expect(within(link).getByRole('img').getAttribute('src')).toMatch(src)
    }
  })

  it('asks for the workshop code first and remembers it', async () => {
    const user = userEvent.setup()
    render(<App search={searchWith({})} />)
    expect(screen.queryByRole('button', { name: 'Suchen' })).toBeNull()
    await user.type(screen.getByLabelText('Werkstatt-Code'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(localStorage.getItem('werkstatt-code')).toBe('abc')
    expect(screen.getByRole('button', { name: 'Suchen' })).toBeInTheDocument()
  })

  it('AC3/AC5a: sends size, quantity and the selected tags to both shops', async () => {
    localStorage.setItem('werkstatt-code', 'abc')
    const search = searchWith({})
    const user = userEvent.setup()
    render(<App search={search} />)
    await user.selectOptions(screen.getByLabelText('Breite'), '225')
    await user.selectOptions(screen.getByLabelText('Höhe'), '45')
    await user.selectOptions(screen.getByLabelText('Zoll'), '17')
    await user.click(
      within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: /^2/ }),
    )
    await user.click(screen.getByRole('button', { name: /Winter/ }))
    await user.click(screen.getByRole('button', { name: /MICHELIN/ }))
    await user.click(screen.getByRole('button', { name: 'Suchen' }))
    const expected = {
      width: 225,
      height: 45,
      rim: 17,
      quantity: 2,
      seasons: ['winter'],
      brands: ['MICHELIN'],
    }
    expect(search).toHaveBeenCalledWith('weichberger', expected, 'abc')
    expect(search).toHaveBeenCalledWith('goeggel', expected, 'abc')
  })

  it('phone flow: after searching, the form folds into a summary with "Ändern"', async () => {
    localStorage.setItem('werkstatt-code', 'abc')
    const user = userEvent.setup()
    render(<App search={searchWith({})} />)
    const panel = screen.getByTestId('search-panel')
    expect(panel).toHaveAttribute('data-collapsed', 'false')
    expect(screen.queryByTestId('search-summary')).toBeNull()

    await user.selectOptions(screen.getByLabelText('Zoll'), '17')
    await user.click(screen.getByRole('button', { name: /Winter/ }))
    await user.click(screen.getByRole('button', { name: /MICHELIN/ }))
    await user.click(screen.getByRole('button', { name: 'Suchen' }))
    expect(panel).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('search-summary')).toHaveTextContent(
      '205/55 R17 · 4 Stk · Winter · MICHELIN',
    )

    await user.click(screen.getByRole('button', { name: 'Ändern' }))
    expect(panel).toHaveAttribute('data-collapsed', 'false')
    expect(screen.queryByTestId('search-summary')).toBeNull()
    expect(screen.getByLabelText('Zoll')).toHaveValue('17') // previous input is kept
  })

  it('uses the singular for a single offer', async () => {
    await renderAndSearch(searchWith({ goeggel: async () => ok('goeggel', [offer()]) }))
    expect(await screen.findByText('Göggel: 1 Angebot')).toBeInTheDocument()
  })

  it('AC4: shows the offers of one shop while the other is still loading', async () => {
    await renderAndSearch(
      searchWith({ goeggel: async () => ok('goeggel', [offer()]), weichberger: never }),
    )
    expect(await screen.findByRole('article')).toHaveTextContent('KUMHO')
    expect(screen.getByTestId('status-weichberger')).toHaveTextContent('lädt')
  })

  describe('AC48: the list appears in one go when the shops have answered', () => {
    const WAIT = 'Suche läuft. Die Liste erscheint, sobald beide Shops geantwortet haben.'
    const late = () => {
      let answer: (r: SearchResponse) => void = () => {}
      const search = searchWith({
        goeggel: async () => ok('goeggel', [offer()]),
        weichberger: () => new Promise((r) => (answer = r)),
      })
      const arrive = () => answer(ok('weichberger', [offer({ shop: 'weichberger', profile: 'B' })]))
      return { search, arrive }
    }

    it('holds the first shop back until the other answers, then shows both at once', async () => {
      const { search, arrive } = late()
      await renderAndSearch(search, 60_000)
      expect(await screen.findByText('Göggel: 1 Angebot')).toBeInTheDocument()
      expect(screen.queryByRole('article')).toBeNull()
      expect(screen.getByTestId('results-wait')).toHaveTextContent(WAIT)
      arrive()
      expect(await screen.findAllByRole('article')).toHaveLength(2)
      expect(screen.queryByTestId('results-wait')).toBeNull()
    })

    it('AC4: after the hold time it shows what is there and adds the late shop', async () => {
      const { search, arrive } = late()
      await renderAndSearch(search, 40)
      expect(await screen.findByRole('article')).toHaveTextContent('KUMHO')
      expect(screen.queryByTestId('results-wait')).toBeNull()
      expect(screen.getByTestId('status-weichberger')).toHaveTextContent('lädt')
      arrive()
      expect(await screen.findAllByRole('article')).toHaveLength(2)
    })

    it('shows the waiting note from the start of the search', async () => {
      await renderAndSearch(searchWith({ goeggel: never, weichberger: never }), 60_000)
      expect(screen.getByTestId('results-wait')).toHaveTextContent(WAIT)
    })

    it('does not wait for a shop that failed', async () => {
      await renderAndSearch(
        searchWith({
          goeggel: async () => ok('goeggel', [offer()]),
          weichberger: async () => ({
            shop: 'weichberger',
            offers: [],
            error: { code: 'TIMEOUT', message: 'x' },
          }),
        }),
        60_000,
      )
      expect(await screen.findByRole('article')).toHaveTextContent('KUMHO')
      expect(screen.queryByTestId('results-wait')).toBeNull()
    })

    it('does not wait when only one shop is searched', async () => {
      localStorage.setItem('werkstatt-code', 'abc')
      const user = userEvent.setup()
      render(
        <App
          search={searchWith({ goeggel: async () => ok('goeggel', [offer()]) })}
          holdMs={60_000}
        />,
      )
      await user.click(
        within(screen.getByRole('group', { name: 'Anbieter' })).getByRole('button', {
          name: 'Göggel',
        }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      expect(await screen.findByRole('article')).toHaveTextContent('KUMHO')
    })
  })

  it('AC49: the selection area is there from the start and says how to use it', () => {
    localStorage.setItem('werkstatt-code', 'abc')
    render(<App search={searchWith({})} />)
    const area = screen.getByRole('region', { name: 'Auswahl' })
    expect(area).toHaveTextContent('Noch kein Reifen ausgewählt')
    expect(area).toHaveClass('selection--empty')
    expect(within(area).queryByRole('button')).toBeNull()
    // the page keeps room for the column, so ticking a tyre does not change the list width
    expect(screen.getByRole('main')).toHaveClass('app--columns')
    expect(screen.getByRole('main')).not.toHaveClass('app--selection')
  })

  it('AC49: no selection area and no room for it while the workshop code is asked', () => {
    render(<App search={searchWith({})} />)
    expect(screen.queryByRole('region', { name: 'Auswahl' })).toBeNull()
    expect(screen.getByRole('main')).not.toHaveClass('app--columns')
  })

  it('shows a spinning circle instead of dots while a shop is loading', async () => {
    await renderAndSearch(
      searchWith({ goeggel: async () => ok('goeggel', [offer()]), weichberger: never }),
    )
    await screen.findByRole('article')
    const loading = screen.getByTestId('status-weichberger')
    expect(loading.querySelector('.spinner')).not.toBeNull()
    expect(loading).not.toHaveTextContent('…')
    expect(screen.getByTestId('status-goeggel').querySelector('.spinner')).toBeNull()
  })

  it('AC22: shows a clear message for a failing shop and keeps the other', async () => {
    await renderAndSearch(
      searchWith({
        goeggel: async () => ok('goeggel', [offer()]),
        weichberger: async () => ({
          shop: 'weichberger',
          offers: [],
          error: { code: 'LOGIN_FAILED', message: 'x' },
        }),
      }),
    )
    expect(
      await screen.findByText('Weichberger: Anmeldung fehlgeschlagen – Zugangsdaten prüfen'),
    ).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveTextContent('KUMHO')
  })

  it('AC7: shows an empty state per shop', async () => {
    await renderAndSearch(searchWith({}))
    expect(await screen.findAllByText(/Keine lagernden Reifen in dieser Größe/)).toHaveLength(2)
  })

  it('AC13: merges both shops into one card and marks the cheaper offer', async () => {
    await renderAndSearch(
      searchWith({
        goeggel: async () => ok('goeggel', [offer({ ean: '111', priceGrossCents: 10700 })]),
        weichberger: async () =>
          ok('weichberger', [offer({ shop: 'weichberger', ean: '111', priceGrossCents: 11300 })]),
      }),
    )
    await screen.findByText(/113,00/)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(1)
    const rows = within(cards[0]).getAllByRole('listitem')
    expect(within(rows[0]).getByRole('img', { name: 'Göggel' })).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('Günstigster')
    expect(rows[0]).toHaveTextContent(/107,00/)
    expect(within(rows[1]).getByRole('img', { name: 'Weichberger' })).toBeInTheDocument()
    expect(rows[1]).not.toHaveTextContent('Günstigster')
  })

  describe('AC47: hint when no tyre is in both shops', () => {
    const HINT = 'Kein Reifen ist in beiden Shops lagernd.'
    const ADVICE = 'Für den direkten Preisvergleich eine Marke wählen.'
    const different = () =>
      searchWith({
        goeggel: async () => ok('goeggel', [offer({ profile: 'A' })]),
        weichberger: async () => ok('weichberger', [offer({ shop: 'weichberger', profile: 'B' })]),
      })

    it('says so and suggests a brand when both shops answered with different tyres', async () => {
      await renderAndSearch(different())
      expect(await screen.findByTestId('compare-hint')).toHaveTextContent(`${HINT} ${ADVICE}`)
    })

    it('leaves the advice out when a brand is already chosen', async () => {
      localStorage.setItem('werkstatt-code', 'abc')
      const user = userEvent.setup()
      render(<App search={different()} />)
      await user.click(screen.getByRole('button', { name: /MICHELIN/ }))
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      const hint = await screen.findByTestId('compare-hint')
      expect(hint).toHaveTextContent(HINT)
      expect(hint).not.toHaveTextContent(ADVICE)
    })

    it('stays away when a tyre is in both shops', async () => {
      await renderAndSearch(
        searchWith({
          goeggel: async () => ok('goeggel', [offer({ ean: '111' }), offer({ profile: 'A' })]),
          weichberger: async () => ok('weichberger', [offer({ shop: 'weichberger', ean: '111' })]),
        }),
      )
      await screen.findByText('Weichberger: 1 Angebot')
      expect(screen.queryByTestId('compare-hint')).toBeNull()
    })

    it('stays away while a shop is loading, when a shop has nothing, and for a single shop', async () => {
      const one = async () => ok('goeggel', [offer()])
      await renderAndSearch(searchWith({ goeggel: one, weichberger: never }))
      await screen.findByText('Göggel: 1 Angebot')
      expect(screen.queryByTestId('compare-hint')).toBeNull()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Ändern' }))
      // weichberger answers with nothing now
      await user.click(
        within(screen.getByRole('group', { name: 'Anbieter' })).getByRole('button', {
          name: 'Göggel',
        }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      await screen.findByText('Göggel: 1 Angebot')
      expect(screen.queryByTestId('compare-hint')).toBeNull()
    })

    it('stays away when one shop has no offers', async () => {
      await renderAndSearch(searchWith({ goeggel: async () => ok('goeggel', [offer()]) }))
      await screen.findByText(/Weichberger: Keine lagernden Reifen/)
      expect(screen.queryByTestId('compare-hint')).toBeNull()
    })
  })

  it('AC28: every offer row shows its shop logo on a shop-coloured badge', async () => {
    await renderAndSearch(
      searchWith({
        goeggel: async () => ok('goeggel', [offer({ ean: '7' })]),
        weichberger: async () => ok('weichberger', [offer({ shop: 'weichberger', ean: '7' })]),
      }),
    )
    const goeggelLogo = await screen.findByRole('img', { name: 'Göggel' })
    expect(goeggelLogo.getAttribute('src')).toMatch(/logos\/goeggel\.png$/)
    expect(goeggelLogo.closest('.shop-badge')).toHaveClass('shop-badge--goeggel')
    const weichbergerLogo = screen.getByRole('img', { name: 'Weichberger' })
    expect(weichbergerLogo.getAttribute('src')).toMatch(/logos\/weichberger\.png$/)
    expect(weichbergerLogo.closest('.shop-badge')).toHaveClass('shop-badge--weichberger')
  })

  it('AC27: the provider filter searches only the chosen shop', async () => {
    localStorage.setItem('werkstatt-code', 'abc')
    const search = searchWith({
      weichberger: async () => ok('weichberger', [offer({ shop: 'weichberger' })]),
    })
    const user = userEvent.setup()
    render(<App search={search} />)
    const providers = screen.getByRole('group', { name: 'Anbieter' })
    expect(within(providers).getByRole('button', { name: 'Beide' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(providers).getByRole('button', { name: 'Weichberger' }))
    await user.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('weichberger', expect.anything(), 'abc')
    expect(await screen.findByText('Weichberger: 1 Angebot')).toBeInTheDocument()
    expect(screen.queryByTestId('status-goeggel')).toBeNull()
    expect(screen.getByTestId('search-summary')).toHaveTextContent(
      '205/55 R16 · 4 Stk · Weichberger',
    )
  })

  it('AC16: marks offers that need the slower stock in yellow', async () => {
    await renderAndSearch(
      searchWith({
        weichberger: async () =>
          ok('weichberger', [
            offer({ shop: 'weichberger', delayed: true, deliveryNote: 'Nebenlager (2–3 Tage)' }),
          ]),
      }),
    )
    const row = await screen.findByRole('listitem')
    expect(row).toHaveAttribute('data-delayed', 'true')
    expect(row.querySelector('.avail--yellow')).toHaveTextContent('2–3 Tage')
  })

  it('AC43: each tested tyre shows its ÖAMTC result in the offer row (logo, stars, coloured grade), untested sizes none', async () => {
    const conti = {
      brand: 'CONTINENTAL',
      profile: 'WinterContact TS 870',
      season: 'winter' as const,
    }
    await renderAndSearch(
      searchWith({
        goeggel: async () =>
          ok('goeggel', [
            offer({ ...conti, width: 185, height: 65, rim: 15 }),
            offer({ ...conti, width: 205, height: 55, rim: 16 }),
            offer({ ...conti, width: 195, height: 55, rim: 20 }),
          ]),
      }),
    )
    const links = await screen.findAllByRole('link', { name: /^ÖAMTC-Test / })
    expect(links).toHaveLength(2)
    const card = (size: string) =>
      screen.getAllByRole('article').find((a) => a.textContent?.includes(size))!
    const row = (size: string) => within(card(size)).getByRole('listitem')

    const r15 = within(row('185/65 R15')).getByRole('link', {
      name: 'ÖAMTC-Test Winter 2026: Gesamtnote 2,2 (gut)',
    })
    expect(r15.getAttribute('href')).toBe(
      'https://www.oeamtc.at/tests/reifentest/winterreifentest-2026/continental-wintercontact-ts-870-89453540',
    )
    expect(r15.querySelector('img')?.getAttribute('src')).toMatch(/logos\/oeamtc\.png$/)
    expect(r15.querySelector<HTMLElement>('.stars__fill')?.style.width).toBe('66%')
    expect(r15.querySelector('.grade--gut')).toHaveTextContent('2,2')
    expect(r15).toHaveTextContent('Winter 2026')

    within(row('205/55 R16')).getByRole('link', {
      name: 'ÖAMTC-Test Winter 2024: Gesamtnote 2,0 (gut)',
    })
    expect(card('195/55 R20')).not.toHaveTextContent(/ÖAMTC|Winter 20/)
    expect(card('195/55 R20').querySelector('.rating')).toBeNull()
  })

  it('AC11: marks a provisional cheapest offer and missing shipping', async () => {
    await renderAndSearch(
      searchWith({
        goeggel: async () => ok('goeggel', [offer({ ean: '5', priceGrossCents: 12000 })]),
        weichberger: async () =>
          ok('weichberger', [
            offer({
              shop: 'weichberger',
              ean: '5',
              priceGrossCents: 10000,
              shippingConfigured: false,
            }),
          ]),
      }),
    )
    expect(await screen.findByText('Günstigster (vorläufig)')).toBeInTheDocument()
    expect(screen.getByText('Versand nicht hinterlegt')).toBeInTheDocument()
  })

  it('AC25: an invalid code brings back the code prompt', async () => {
    await renderAndSearch(vi.fn<SearchFn>(() => Promise.reject(new UnauthorizedError())))
    expect(await screen.findByText('Werkstatt-Code ungültig')).toBeInTheDocument()
    expect(screen.getByLabelText('Werkstatt-Code')).toBeInTheDocument()
    expect(localStorage.getItem('werkstatt-code')).toBeNull()
  })

  it('ignores answers of an older search', async () => {
    let resolveOld: (r: SearchResponse) => void = () => {}
    let calls = 0
    const search = vi.fn<SearchFn>((shop) => {
      if (shop !== 'goeggel') return Promise.resolve(ok(shop, []))
      calls++
      return calls === 1
        ? new Promise((r) => (resolveOld = r))
        : Promise.resolve(ok('goeggel', [offer({ brand: 'NEU' })]))
    })
    const user = await renderAndSearch(search)
    await user.click(screen.getByRole('button', { name: 'Suchen' }))
    await screen.findByText(/NEU/)
    resolveOld(ok('goeggel', [offer({ brand: 'ALT' })]))
    await Promise.resolve()
    expect(screen.queryByText(/ALT/)).toBeNull()
  })

  describe('selection and offer PDF', () => {
    const pirelli = offer({ brand: 'PIRELLI', profile: 'W Sotozero 3', ean: '1' })
    const hankook = offer({ shop: 'weichberger', brand: 'HANKOOK', profile: 'IW 01', ean: '2' })

    // a cart service that takes everything
    const takesAll: CartFn = async (shop, items) => ({
      shop,
      results: items.map((i) => ({ shopArticleId: i.shopArticleId, ok: true, error: null })),
      error: null,
    })

    async function setup(cartImpl: CartFn = takesAll) {
      localStorage.setItem('werkstatt-code', 'abc')
      // first search with 2 pieces finds Pirelli at Göggel, the next one (4 pieces) Hankook at Weichberger
      const search = vi.fn<SearchFn>(async (shop, query) => {
        if (query.quantity === 2) return ok(shop, shop === 'goeggel' ? [pirelli] : [])
        return ok(shop, shop === 'weichberger' ? [hankook] : [])
      })
      const makeOfferPdf = vi.fn(async () => {})
      const cart = vi.fn<CartFn>(cartImpl)
      const user = userEvent.setup()
      render(<App search={search} makeOfferPdf={makeOfferPdf} cart={cart} />)
      await user.click(
        within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: '2' }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      return { user, search, makeOfferPdf, cart }
    }

    // the selection has its own area next to the results (PC: right screen edge), not in the filters
    const bar = () => screen.getByRole('region', { name: 'Auswahl' })
    // nothing ticked: the area only explains itself, without list and buttons (AC49)
    const expectEmptySelection = () => {
      expect(bar()).toHaveTextContent('Noch kein Reifen ausgewählt')
      expect(within(bar()).queryByRole('button')).toBeNull()
    }
    const actions = () => within(bar()).getByRole('group', { name: 'Aktionen zur Auswahl' })
    const row = (name: RegExp) => within(bar()).getByText(name).closest('li') as HTMLElement

    it('AC31: the selection has its own area outside the filter panel, with both buttons', async () => {
      const { user } = await setup()
      expectEmptySelection()
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      expect(screen.getByTestId('search-panel')).not.toContainElement(bar())
      expect(screen.getByRole('region', { name: 'Suchergebnisse' })).not.toContainElement(bar())
      expect(within(bar()).getByRole('button', { name: 'Auswahl aufheben' })).toBeInTheDocument()
      expect(within(actions()).getByRole('button', { name: 'Angebot als PDF' })).toBeInTheDocument()
    })

    it('AC31: every selected tyre shows the logo of its shop', async () => {
      const { user } = await setup()
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      const logo = within(row(/PIRELLI W Sotozero 3/)).getByRole('img', { name: 'Göggel' })
      expect(logo.getAttribute('src')).toMatch(/logos\/goeggel\.png$/)
      expect(row(/PIRELLI W Sotozero 3/)).toHaveTextContent('2 Stk')
    })

    it('AC31: a tick keeps the tyre with its quantity, also after the next search', async () => {
      const { user } = await setup()
      expectEmptySelection()
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      expect(bar()).toHaveTextContent('1 Reifen ausgewählt')

      await user.click(screen.getByRole('button', { name: 'Ändern' }))
      await user.click(
        within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: '4' }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      await user.click(
        await screen.findByRole('checkbox', { name: 'HANKOOK IW 01 (Weichberger) auswählen' }),
      )
      expect(bar()).toHaveTextContent('2 Reifen ausgewählt')
      expect(row(/PIRELLI W Sotozero 3/)).toHaveTextContent('2 Stk')
      expect(row(/HANKOOK IW 01/)).toHaveTextContent('4 Stk')
    })

    it('AC31: a tick takes the quantity marked in the filter right now, even without a new search', async () => {
      const { user } = await setup()
      const quantity = (n: string) =>
        within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: n })
      await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' })
      await user.click(screen.getByRole('button', { name: 'Ändern' }))
      await user.click(quantity('6'))
      await user.click(
        screen.getByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      expect(row(/PIRELLI W Sotozero 3/)).toHaveTextContent('6 Stk')

      // changing the filter later leaves tyres already chosen as they are
      await user.click(quantity('8'))
      expect(row(/PIRELLI W Sotozero 3/)).toHaveTextContent('6 Stk')
    })

    it('AC31: single remove and "Auswahl aufheben"', async () => {
      const { user } = await setup()
      const box = await screen.findByRole('checkbox', {
        name: 'PIRELLI W Sotozero 3 (Göggel) auswählen',
      })
      await user.click(box)
      await user.click(
        within(bar()).getByRole('button', { name: 'PIRELLI W Sotozero 3 entfernen' }),
      )
      expect(box).not.toBeChecked()
      expectEmptySelection()

      await user.click(box)
      await user.click(within(bar()).getByRole('button', { name: 'Auswahl aufheben' }))
      expect(box).not.toBeChecked()
    })

    /** Ticks the Pirelli at Göggel (2 pieces) and, after a second search, the Hankook at Weichberger (4). */
    async function tickBoth(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      await user.click(screen.getByRole('button', { name: 'Ändern' }))
      await user.click(
        within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: '4' }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      await user.click(
        await screen.findByRole('checkbox', { name: 'HANKOOK IW 01 (Weichberger) auswählen' }),
      )
    }
    const cartButton = () => within(actions()).getByRole('button', { name: 'In den Warenkorb' })

    it('AC18: "In den Warenkorb" sends each shop its tyres with their quantities and shows the result per tyre', async () => {
      const { user, cart, search } = await setup()
      await tickBoth(user)
      const searches = search.mock.calls.length
      await user.click(cartButton())

      expect(cart).toHaveBeenCalledTimes(2)
      expect(cart).toHaveBeenCalledWith(
        'goeggel',
        [
          {
            shopArticleId: pirelli.shopArticleId,
            quantity: 2,
            width: 205,
            height: 55,
            rim: 16,
            description: pirelli.description,
          },
        ],
        'abc',
      )
      expect(cart).toHaveBeenCalledWith(
        'weichberger',
        [expect.objectContaining({ shopArticleId: hankook.shopArticleId, quantity: 4 })],
        'abc',
      )
      expect(
        await within(row(/PIRELLI W Sotozero 3/)).findByText('Im Warenkorb'),
      ).toBeInTheDocument()
      expect(within(row(/HANKOOK IW 01/)).getByText('Im Warenkorb')).toBeInTheDocument()
      expect(search.mock.calls.length).toBe(searches)
    })

    it.each([
      [
        'AC19',
        'AUTO_ORDER_ENABLED',
        'Weichberger: Automatische Bestellung ist aktiv – Warenkorb wird nicht befüllt',
      ],
      [
        'AC20',
        'AUTO_ORDER_UNKNOWN',
        'Weichberger: Bestell-Einstellung nicht lesbar – Warenkorb wird nicht befüllt',
      ],
    ] as [string, ApiErrorCode, string][])(
      '%s: %s is shown at the Weichberger tyre, the Göggel tyre is still put into its cart',
      async (_ac, code, text) => {
        const { user } = await setup(async (shop, items) =>
          shop === 'weichberger'
            ? { shop, results: [], error: { code, message: 'x' } }
            : takesAll(shop, items, ''),
        )
        await tickBoth(user)
        await user.click(cartButton())
        expect(await within(row(/HANKOOK IW 01/)).findByRole('alert')).toHaveTextContent(text)
        expect(within(row(/PIRELLI W Sotozero 3/)).getByText('Im Warenkorb')).toBeInTheDocument()
      },
    )

    it('a tyre the shop did not take shows its error; the next click only retries that one', async () => {
      let attempt = 0
      const { user, cart } = await setup(async (shop, items) => {
        attempt++
        return attempt === 1
          ? {
              shop,
              results: items.map((i) => ({
                shopArticleId: i.shopArticleId,
                ok: false,
                error: { code: 'ITEM_NOT_FOUND', message: 'x' },
              })),
              error: null,
            }
          : takesAll(shop, items, '')
      })
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      await user.click(cartButton())
      expect(await within(row(/PIRELLI W Sotozero 3/)).findByRole('alert')).toHaveTextContent(
        'Göggel: Reifen im Shop nicht mehr gefunden – bitte neu suchen',
      )

      await user.click(cartButton())
      expect(
        await within(row(/PIRELLI W Sotozero 3/)).findByText('Im Warenkorb'),
      ).toBeInTheDocument()
      // everything is in the cart now: a further click must not put it there a second time
      expect(cartButton()).toBeDisabled()
      expect(cart).toHaveBeenCalledTimes(2)
    })

    it('a tyre that was removed and ticked again can be put into the cart again', async () => {
      const { user } = await setup()
      const box = await screen.findByRole('checkbox', {
        name: 'PIRELLI W Sotozero 3 (Göggel) auswählen',
      })
      await user.click(box)
      await user.click(cartButton())
      await within(row(/PIRELLI W Sotozero 3/)).findByText('Im Warenkorb')
      await user.click(box)
      await user.click(box)
      expect(within(row(/PIRELLI W Sotozero 3/)).queryByText('Im Warenkorb')).toBeNull()
      expect(cartButton()).toBeEnabled()
    })

    it('a wrong workshop code is reported at the tyre', async () => {
      const { user } = await setup(async () => {
        throw new UnauthorizedError()
      })
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      await user.click(cartButton())
      expect(await within(row(/PIRELLI W Sotozero 3/)).findByRole('alert')).toHaveTextContent(
        'Göggel: Werkstatt-Code ungültig',
      )
    })

    it('AC35: "Angebot als PDF" hands the selection over without asking the search API', async () => {
      const { user, search, makeOfferPdf } = await setup()
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      const calls = search.mock.calls.length
      await user.click(within(actions()).getByRole('button', { name: 'Angebot als PDF' }))
      expect(makeOfferPdf).toHaveBeenCalledWith(
        [{ offer: pirelli, quantity: 2 }],
        DEFAULT_PDF_TEXTS,
      )
      expect(search.mock.calls.length).toBe(calls)
    })
  })

  describe('PDF text settings', () => {
    const stored: PdfTexts = { ...DEFAULT_PDF_TEXTS, title: 'GESPEICHERT' }

    function settingsWith(over: Partial<SettingsApi> = {}) {
      return {
        load: vi.fn(async () => stored),
        save: vi.fn(async (_code: string, texts: PdfTexts) => texts),
        ...over,
      }
    }

    async function openSettings(settings: SettingsApi) {
      localStorage.setItem('werkstatt-code', 'abc')
      const makeOfferPdf = vi.fn(async () => {})
      const user = userEvent.setup()
      render(
        <App
          search={searchWith({ goeggel: async () => ok('goeggel', [offer({ brand: 'PIRELLI' })]) })}
          makeOfferPdf={makeOfferPdf}
          settings={settings}
        />,
      )
      await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
      const dialog = await screen.findByRole('dialog', { name: 'PDF-Texte' })
      return { user, dialog, makeOfferPdf }
    }

    it('AC36: "Einstellungen" opens all PDF texts, prefilled with the stored ones', async () => {
      const settings = settingsWith()
      const { dialog } = await openSettings(settings)
      expect(settings.load).toHaveBeenCalledWith('abc')
      expect(within(dialog).getByLabelText('Titel')).toHaveValue('GESPEICHERT')
      expect(within(dialog).getByLabelText('Beschriftung Kunde')).toHaveValue('Kunde:')
      expect(within(dialog).getByLabelText('Hinweis Gültigkeit')).toHaveValue(
        DEFAULT_PDF_TEXTS.validity,
      )
      expect(within(dialog).getByLabelText('Zusatz 1 Text')).toHaveValue(
        'Räder umstecken PKW bis 17":',
      )
      expect(within(dialog).getByLabelText('Zusatz 1 Preis')).toHaveValue('€ 34,-')
    })

    it('AC37: "Speichern" stores the texts centrally and the next PDF uses them', async () => {
      const settings = settingsWith()
      const { user, dialog, makeOfferPdf } = await openSettings(settings)
      const title = within(dialog).getByLabelText('Titel')
      await user.clear(title)
      await user.type(title, 'WINTER-ANGEBOT')
      await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      expect(settings.save).toHaveBeenCalledWith(
        'abc',
        expect.objectContaining({ title: 'WINTER-ANGEBOT' }),
      )
      expect(screen.queryByRole('dialog')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      await user.click(await screen.findByRole('checkbox', { name: /PIRELLI/ }))
      await user.click(screen.getByRole('button', { name: 'Angebot als PDF' }))
      expect(makeOfferPdf).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ title: 'WINTER-ANGEBOT' }),
      )
    })

    it('AC38: extra rows can be added and removed', async () => {
      const settings = settingsWith()
      const { user, dialog } = await openSettings(settings)
      await user.click(within(dialog).getByRole('button', { name: 'Zeile hinzufügen' }))
      await user.type(within(dialog).getByLabelText('Zusatz 6 Text'), 'Felgen lackieren')
      await user.type(within(dialog).getByLabelText('Zusatz 6 Preis'), '€ 80,-')
      await user.click(within(dialog).getByRole('button', { name: 'Zusatz 1 entfernen' }))
      await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      const saved = vi.mocked(settings.save).mock.calls[0][1]
      expect(saved.extras).toHaveLength(5)
      expect(saved.extras[0].text).toBe('Räder umstecken SUV/LLKW/ab 18":')
      expect(saved.extras[4]).toEqual({ text: 'Felgen lackieren', price: '€ 80,-' })
    })

    it('AC39: "Auf Vorlage zurücksetzen" fills in the template texts', async () => {
      const { user, dialog } = await openSettings(settingsWith())
      await user.click(within(dialog).getByRole('button', { name: 'Auf Vorlage zurücksetzen' }))
      expect(within(dialog).getByLabelText('Titel')).toHaveValue('REIFEN - ANGEBOT')
    })

    it('keeps the dialog open with a message when saving fails; "Abbrechen" discards', async () => {
      const settings = settingsWith({ save: vi.fn(async () => Promise.reject(new Error('x'))) })
      const { user, dialog } = await openSettings(settings)
      await user.type(within(dialog).getByLabelText('Titel'), ' NEU')
      await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('nicht gespeichert')
      await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
      expect(screen.getByLabelText('Titel')).toHaveValue('GESPEICHERT')
    })
  })
})
