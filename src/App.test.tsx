// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse, ShopId, TireOffer } from '../supabase/functions/_shared/types.ts'
import { UnauthorizedError, type SearchFn } from './api.ts'
import { App } from './App.tsx'

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

async function renderAndSearch(search: SearchFn) {
  localStorage.setItem('werkstatt-code', 'abc')
  const user = userEvent.setup()
  render(<App search={search} />)
  await user.click(screen.getByRole('button', { name: 'Suchen' }))
  return user
}

beforeEach(() => localStorage.clear())

describe('App', () => {
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

    async function setup() {
      localStorage.setItem('werkstatt-code', 'abc')
      // first search with 2 pieces finds Pirelli at Göggel, the next one (4 pieces) Hankook at Weichberger
      const search = vi.fn<SearchFn>(async (shop, query) => {
        if (query.quantity === 2) return ok(shop, shop === 'goeggel' ? [pirelli] : [])
        return ok(shop, shop === 'weichberger' ? [hankook] : [])
      })
      const makeOfferPdf = vi.fn(async () => {})
      const user = userEvent.setup()
      render(<App search={search} makeOfferPdf={makeOfferPdf} />)
      await user.click(
        within(screen.getByRole('group', { name: 'Stückzahl' })).getByRole('button', { name: '2' }),
      )
      await user.click(screen.getByRole('button', { name: 'Suchen' }))
      return { user, search, makeOfferPdf }
    }

    const bar = () => screen.getByRole('region', { name: 'Auswahl' })

    it('AC31: a tick keeps the tyre with its quantity, also after the next search', async () => {
      const { user } = await setup()
      expect(screen.queryByRole('region', { name: 'Auswahl' })).toBeNull()
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
      expect(within(bar()).getByText(/PIRELLI W Sotozero 3/)).toHaveTextContent('2 Stk')
      expect(within(bar()).getByText(/HANKOOK IW 01/)).toHaveTextContent('4 Stk')
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
      expect(screen.queryByRole('region', { name: 'Auswahl' })).toBeNull()

      await user.click(box)
      await user.click(within(bar()).getByRole('button', { name: 'Auswahl aufheben' }))
      expect(box).not.toBeChecked()
    })

    it('AC35: "Angebot als PDF" hands the selection over without asking the search API', async () => {
      const { user, search, makeOfferPdf } = await setup()
      await user.click(
        await screen.findByRole('checkbox', { name: 'PIRELLI W Sotozero 3 (Göggel) auswählen' }),
      )
      const calls = search.mock.calls.length
      await user.click(within(bar()).getByRole('button', { name: 'Angebot als PDF' }))
      expect(makeOfferPdf).toHaveBeenCalledWith([{ offer: pirelli, quantity: 2 }])
      expect(search.mock.calls.length).toBe(calls)
    })
  })
})
