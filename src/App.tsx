// Searches both shops in parallel; each shop's result appears as soon as it arrives (AC4).
import { useMemo, useRef, useState } from 'react'
import { groupOffers } from '../supabase/functions/_shared/matching.ts'
import {
  SHOPS,
  type SearchQuery,
  type ShopId,
  type TireOffer,
} from '../supabase/functions/_shared/types.ts'
import { defaultSearch, UnauthorizedError, type SearchFn } from './api.ts'
import { CodePrompt } from './components/CodePrompt.tsx'
import { ResultList } from './components/ResultList.tsx'
import { SearchForm } from './components/SearchForm.tsx'
import { errorMessage, SHOP_LABEL } from './messages.ts'

export interface AppProps {
  search?: SearchFn
}

type ShopState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; offers: TireOffer[] }
  | { status: 'error'; message: string }

const CODE_KEY = 'werkstatt-code'
const IDLE: Record<ShopId, ShopState> = {
  weichberger: { status: 'idle' },
  goeggel: { status: 'idle' },
}

function storage(action: (s: Storage) => void) {
  try {
    action(localStorage)
  } catch {
    // storage may be unavailable (private mode); the code then lasts for this page only
  }
}

function readCode(): string {
  let code = ''
  storage((s) => (code = s.getItem(CODE_KEY) ?? ''))
  return code
}

function statusText(shop: ShopId, state: ShopState): string {
  switch (state.status) {
    case 'idle':
      return ''
    case 'loading':
      return `${SHOP_LABEL[shop]}: lädt …`
    case 'error':
      return state.message
    case 'done':
      return state.offers.length === 0
        ? `${SHOP_LABEL[shop]}: Keine lagernden Reifen in dieser Größe`
        : `${SHOP_LABEL[shop]}: ${state.offers.length} Angebote`
  }
}

export function App({ search = defaultSearch }: AppProps) {
  const [code, setCode] = useState(readCode)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [shops, setShops] = useState<Record<ShopId, ShopState>>(IDLE)
  const latest = useRef(0)

  const groups = useMemo(
    () =>
      groupOffers(
        SHOPS.flatMap((s) =>
          shops[s].status === 'done' ? (shops[s] as { offers: TireOffer[] }).offers : [],
        ),
      ),
    [shops],
  )

  const saveCode = (value: string) => {
    storage((s) => s.setItem(CODE_KEY, value))
    setCode(value)
    setCodeError(null)
  }

  const runSearch = (query: SearchQuery) => {
    const id = ++latest.current
    setShops({ weichberger: { status: 'loading' }, goeggel: { status: 'loading' } })
    for (const shop of SHOPS) {
      search(shop, query, code)
        .then((res) => {
          if (id !== latest.current) return // answer of an older search
          setShops((prev) => ({
            ...prev,
            [shop]: res.error
              ? { status: 'error', message: errorMessage(shop, res.error.code) }
              : { status: 'done', offers: res.offers },
          }))
        })
        .catch((e: unknown) => {
          if (id !== latest.current) return
          if (e instanceof UnauthorizedError) {
            latest.current++
            storage((s) => s.removeItem(CODE_KEY))
            setCode('')
            setCodeError('Werkstatt-Code ungültig')
            setShops(IDLE)
            return
          }
          setShops((prev) => ({
            ...prev,
            [shop]: { status: 'error', message: errorMessage(shop, 'UPSTREAM_ERROR') },
          }))
        })
    }
  }

  return (
    <main className="app">
      <header className="app__head">
        <h1>Reifen-Preisvergleich</h1>
      </header>
      {!code ? (
        <CodePrompt error={codeError} onSave={saveCode} />
      ) : (
        <>
          <SearchForm onSearch={runSearch} />
          <div className="status" aria-live="polite">
            {SHOPS.map((shop) => {
              const state = shops[shop]
              const text = statusText(shop, state)
              return text ? (
                <p
                  key={shop}
                  data-testid={`status-${shop}`}
                  className={`status__line status__line--${state.status}`}
                >
                  {text}
                </p>
              ) : null
            })}
          </div>
          <ResultList groups={groups} />
        </>
      )}
    </main>
  )
}
