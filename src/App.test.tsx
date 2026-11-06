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
    expect(rows[0]).toHaveTextContent('Göggel')
    expect(rows[0]).toHaveTextContent('Günstigster')
    expect(rows[0]).toHaveTextContent(/107,00/)
    expect(rows[1]).toHaveTextContent('Weichberger')
    expect(rows[1]).not.toHaveTextContent('Günstigster')
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
    expect(row).toHaveTextContent('Nebenlager (2–3 Tage)')
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
})
