// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { groupOffers } from '../../supabase/functions/_shared/matching.ts'
import type { TireOffer } from '../../supabase/functions/_shared/types.ts'
import { ResultList } from './ResultList.tsx'

let seq = 0
const offer = (over: Partial<TireOffer> = {}): TireOffer => ({
  shop: 'goeggel',
  shopArticleId: String(++seq),
  ean: String(seq),
  brand: 'KUMHO',
  profile: `P${seq}`,
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
  priceGrossCents: 10000 + seq,
  shippingConfigured: true,
  delayed: false,
  ...over,
})

const rowOf = (profile: string) =>
  within(screen.getByRole('heading', { name: `KUMHO ${profile}` }).closest('article')!).getByRole(
    'listitem',
  )

describe('ResultList', () => {
  it('AC30: every offer carries exactly one availability tag (green, yellow, red)', () => {
    render(
      <ResultList
        groups={groupOffers([
          offer({ profile: 'SOFORT' }),
          offer({
            shop: 'weichberger',
            profile: 'NEBEN',
            stockImmediate: 2,
            stockTotal: 6,
            delayed: true,
            deliveryNote: 'Nebenlager (2–3 Tage)',
          }),
          offer({ profile: 'LEER', stockImmediate: 0, stockTotal: 0 }),
        ])}
      />,
    )
    const tags = (profile: string) => rowOf(profile).querySelectorAll('.avail')

    expect(tags('SOFORT')).toHaveLength(1)
    expect(tags('SOFORT')[0]).toHaveTextContent(/^Lagernd$/)
    expect(tags('SOFORT')[0]).toHaveClass('avail--green')

    expect(tags('NEBEN')).toHaveLength(1)
    expect(tags('NEBEN')[0]).toHaveTextContent(/^2–3 Tage$/)
    expect(tags('NEBEN')[0]).toHaveClass('avail--yellow')

    expect(tags('LEER')).toHaveLength(1)
    expect(tags('LEER')[0]).toHaveTextContent(/^Nicht lagernd$/)
    expect(tags('LEER')[0]).toHaveClass('avail--red')
  })
})
