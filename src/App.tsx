// Searches both shops in parallel; each shop's result appears as soon as it arrives (AC4).
// Phone/tablet: after a search the form folds into a one-line summary so results are on screen.
// Wide screens: the form stays visible in a side column (CSS decides, see styles.css).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PDF_TEXTS, type PdfTexts } from '../supabase/functions/_shared/pdf-texts.ts'
import { groupOffers } from '../supabase/functions/_shared/matching.ts'
import {
  SHOPS,
  type ApiErrorCode,
  type SearchQuery,
  type ShopId,
  type TireOffer,
} from '../supabase/functions/_shared/types.ts'
import {
  defaultCart,
  defaultSearch,
  defaultSettings,
  UnauthorizedError,
  type CartFn,
  type SearchFn,
  type SettingsApi,
} from './api.ts'
import { CodePrompt } from './components/CodePrompt.tsx'
import { ListTools } from './components/ListTools.tsx'
import { offerKey, ResultList } from './components/ResultList.tsx'
import { SearchForm } from './components/SearchForm.tsx'
import { Selection, type CartEntry } from './components/Selection.tsx'
import { SettingsDialog } from './components/SettingsDialog.tsx'
import { applyView, DEFAULT_VIEW, type ListView } from './list-view.ts'
import { loadRecentSizes, rememberSize } from './recent-sizes.ts'
import { errorMessage, SHOP_LABEL, SHOP_URL } from './messages.ts'
import { DEFAULTS, SEASON_OPTIONS } from './options.ts'
import { downloadOfferPdf } from './pdf/download.ts'
import type { SelectedTyre } from './pdf/offer-model.ts'

export interface AppProps {
  search?: SearchFn
  /** Builds and saves the offer PDF from the selection (replaced in tests). */
  makeOfferPdf?: (items: SelectedTyre[], texts: PdfTexts) => Promise<void>
  /** Central PDF texts (replaced in tests). */
  settings?: SettingsApi
  /** Puts tyres into a shop's cart (replaced in tests). */
  cart?: CartFn
  /** How long the list waits for the other shop after the first answer (AC48). */
  holdMs?: number
}

/** After the first shop answered, the list waits this long for the other one (AC48). */
const HOLD_MS = 8000

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
      return `${SHOP_LABEL[shop]}: lädt`
    case 'error':
      return state.message
    case 'done': {
      const n = state.offers.length
      if (n === 0) return `${SHOP_LABEL[shop]}: Keine lagernden Reifen in dieser Größe`
      return `${SHOP_LABEL[shop]}: ${n} ${n === 1 ? 'Angebot' : 'Angebote'}`
    }
  }
}

function summaryText(q: SearchQuery, shops: ShopId[]): string {
  const seasons = q.seasons.map((s) => SEASON_OPTIONS.find((o) => o.value === s)?.label ?? s)
  const only = shops.length < SHOPS.length ? shops.map((s) => SHOP_LABEL[s]) : []
  return [
    `${q.width}/${q.height} R${q.rim}`,
    `${q.quantity} Stk`,
    ...seasons,
    ...q.brands,
    ...only,
  ].join(' · ')
}

export function App({
  search = defaultSearch,
  makeOfferPdf = downloadOfferPdf,
  settings = defaultSettings,
  cart = defaultCart,
  holdMs = HOLD_MS,
}: AppProps) {
  // PDF texts: template until the central ones arrive (AC37); dialog via "Einstellungen" (AC36).
  const [pdfTexts, setPdfTexts] = useState<PdfTexts>(DEFAULT_PDF_TEXTS)
  const [textsWarning, setTextsWarning] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  // Ticked tyres in tick order; kept across searches, only in memory (AC31).
  const [selection, setSelection] = useState<SelectedTyre[]>([])
  // Quantity marked in the filter right now; a tick takes it, even without a new search (AC31).
  const [filterQuantity, setFilterQuantity] = useState(DEFAULTS.quantity)
  // Cart state per ticked tyre (offerKey); gone again when the tyre leaves the selection.
  const [cartState, setCartState] = useState<Record<string, CartEntry>>({})
  const selectedKeys = useMemo(() => new Set(selection.map((s) => offerKey(s.offer))), [selection])
  const [code, setCode] = useState(readCode)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [shops, setShops] = useState<Record<ShopId, ShopState>>(IDLE)
  const [lastSearch, setLastSearch] = useState<{
    id: number
    query: SearchQuery
    shops: ShopId[]
  } | null>(null)
  // Search (id) whose waiting time for the slower shop is over (AC48).
  const [holdOver, setHoldOver] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  // Order and filters of the list; kept across searches until the page is reloaded (AC52).
  const [view, setView] = useState<ListView>(DEFAULT_VIEW)
  // Last searched sizes, kept in this browser (AC53).
  const [recentSizes, setRecentSizes] = useState(loadRecentSizes)
  const latest = useRef(0)

  const groups = useMemo(
    () =>
      groupOffers(
        SHOPS.flatMap((s) => {
          const state = shops[s]
          return state.status === 'done' ? state.offers : []
        }),
      ),
    [shops],
  )

  // Both shops answered with offers, but no tyre is in both: say so instead of leaving the user
  // looking for a comparison that is not there (AC47).
  const noCommonTyre =
    lastSearch !== null &&
    lastSearch.shops.length === SHOPS.length &&
    SHOPS.every((s) => {
      const state = shops[s]
      return state.status === 'done' && state.offers.length > 0
    }) &&
    groups.every((g) => g.shops.length < 2)

  // The list appears in one go: when every searched shop has answered, or holdMs after the first
  // answer. So it does not re-sort while somebody is already reading or ticking in it (AC48).
  const searchId = lastSearch?.id ?? 0
  const searched = lastSearch?.shops ?? []
  const loading = searched.filter((s) => shops[s].status === 'loading').length
  const answered = searched.length - loading
  const holding = answered > 0 && loading > 0
  useEffect(() => {
    if (!holding) return
    const timer = setTimeout(() => setHoldOver(searchId), holdMs)
    return () => clearTimeout(timer)
  }, [holding, searchId, holdMs])
  const listVisible = loading === 0 || (answered > 0 && holdOver === searchId)
  const shownGroups = useMemo(() => applyView(groups, view), [groups, view])

  useEffect(() => {
    if (!code) return
    let current = true
    settings
      .load(code)
      .then((texts) => {
        if (!current) return
        setPdfTexts(texts)
        setTextsWarning(null)
      })
      .catch(() => {
        if (current)
          setTextsWarning('Gespeicherte Texte konnten nicht geladen werden – es gilt die Vorlage.')
      })
    return () => {
      current = false
    }
  }, [code, settings])

  const saveTexts = async (texts: PdfTexts) => {
    const stored = await settings.save(code, texts)
    setPdfTexts(stored)
    setTextsWarning(null)
    setSettingsOpen(false)
  }

  const forgetCart = (keys: string[]) =>
    setCartState((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))),
    )

  // Puts every ticked tyre that is not in a cart yet into the cart of its shop (spec 3.4).
  // One call per shop; nothing is ordered.
  const addToCart = async () => {
    const todo = selection.filter((s) => cartState[offerKey(s.offer)]?.status !== 'ok')
    if (todo.length === 0) return
    const mark = (items: SelectedTyre[], entry: (item: SelectedTyre) => CartEntry) =>
      setCartState((prev) => ({
        ...prev,
        ...Object.fromEntries(items.map((i) => [offerKey(i.offer), entry(i)])),
      }))
    mark(todo, () => ({ status: 'pending' }))
    await Promise.all(
      SHOPS.map(async (shop) => {
        const items = todo.filter((s) => s.offer.shop === shop)
        if (items.length === 0) return
        const failed = (code: ApiErrorCode): CartEntry => ({
          status: 'error',
          message: errorMessage(shop, code),
        })
        try {
          const res = await cart(
            shop,
            items.map(({ offer, quantity }) => ({
              shopArticleId: offer.shopArticleId,
              quantity,
              width: offer.width,
              height: offer.height,
              rim: offer.rim,
              description: offer.description,
            })),
            code,
          )
          if (res.error) {
            const shopError = res.error.code
            mark(items, () => failed(shopError))
            return
          }
          mark(items, (item) => {
            const result = res.results.find((r) => r.shopArticleId === item.offer.shopArticleId)
            return result?.ok ? { status: 'ok' } : failed(result?.error?.code ?? 'UPSTREAM_ERROR')
          })
        } catch (e) {
          mark(items, () =>
            failed(e instanceof UnauthorizedError ? 'UNAUTHORIZED' : 'UPSTREAM_ERROR'),
          )
        }
      }),
    )
  }

  const toggle = (offer: TireOffer) => {
    const key = offerKey(offer)
    forgetCart([key])
    setSelection((prev) =>
      prev.some((s) => offerKey(s.offer) === key)
        ? prev.filter((s) => offerKey(s.offer) !== key)
        : [...prev, { offer, quantity: filterQuantity }],
    )
  }

  const saveCode = (value: string) => {
    storage((s) => s.setItem(CODE_KEY, value))
    setCode(value)
    setCodeError(null)
  }

  const runSearch = (query: SearchQuery, selected: ShopId[]) => {
    const id = ++latest.current
    setLastSearch({ id, query, shops: selected })
    setRecentSizes(rememberSize(query))
    setCollapsed(true)
    // Bring summary + results into view (phones: the form above has just folded away).
    document.documentElement.scrollTop = 0
    // Shops left out by the provider filter stay idle: no status line, no offers (AC27).
    setShops({
      ...IDLE,
      ...Object.fromEntries(selected.map((s) => [s, { status: 'loading' } as const])),
    })
    for (const shop of selected) {
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
            setCollapsed(false)
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
    <main
      className={[
        'app',
        // room for the filter and selection columns once the app is unlocked (AC49)
        code && 'app--columns',
        // room for the action bar at the bottom of narrower screens
        selection.length > 0 && 'app--selection',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
        <div className="topbar__title">
          {/* workshop logo, cut from the header of the offer template; PC: top of the left panel */}
          <div className="brand">
            <img
              className="brand__logo"
              src={`${import.meta.env.BASE_URL}logos/tk-kopf.jpg`}
              alt="TK Kopf GmbH"
              width={566}
              height={238}
            />
          </div>
          <h1>Reifen-Preisvergleich</h1>
        </div>
        {/* shop logos open the shop in a new tab; the app stays open (AC42) */}
        <nav className="shoplinks" aria-label="Shops öffnen">
          {SHOPS.map((shop) => (
            <a
              key={shop}
              className={`shop-badge shop-badge--${shop} shoplinks__link`}
              href={SHOP_URL[shop]}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="shop-badge__logo"
                src={`${import.meta.env.BASE_URL}logos/${shop}.png`}
                alt={`${SHOP_LABEL[shop]}-Shop öffnen`}
              />
            </a>
          ))}
        </nav>
        {code && (
          <button
            type="button"
            className="button topbar__settings"
            onClick={() => setSettingsOpen(true)}
          >
            <span aria-hidden="true">⚙ </span>Einstellungen
          </button>
        )}
      </header>
      {settingsOpen && (
        <SettingsDialog
          texts={pdfTexts}
          warning={textsWarning}
          onSave={saveTexts}
          onClose={closeSettings}
        />
      )}
      {!code ? (
        <CodePrompt error={codeError} onSave={saveCode} />
      ) : (
        <div className="layout">
          <aside className="panel" data-testid="search-panel" data-collapsed={String(collapsed)}>
            {collapsed && lastSearch && (
              <div className="summary" data-testid="search-summary">
                <span className="summary__text">
                  {summaryText(lastSearch.query, lastSearch.shops)}
                </span>
                <button type="button" className="button" onClick={() => setCollapsed(false)}>
                  Ändern
                </button>
              </div>
            )}
            <SearchForm
              onSearch={runSearch}
              onQuantityChange={setFilterQuantity}
              recentSizes={recentSizes}
            />
          </aside>
          {/* own area for the ticked tyres: wide PC right screen edge, otherwise above the list */}
          <Selection
            items={selection}
            onRemove={(item) => toggle(item.offer)}
            onClear={() => {
              setSelection([])
              setCartState({})
            }}
            onOfferPdf={() => makeOfferPdf(selection, pdfTexts)}
            cart={cartState}
            onAddToCart={addToCart}
          />
          <section className="results-col" aria-label="Suchergebnisse">
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
                    {state.status === 'loading' && <span className="spinner" aria-hidden="true" />}
                  </p>
                ) : null
              })}
            </div>
            {!listVisible && (
              <p className="results-wait" data-testid="results-wait">
                Suche läuft.
                {searched.length > 1 &&
                  ' Die Liste erscheint, sobald beide Shops geantwortet haben.'}
              </p>
            )}
            {noCommonTyre && (
              <p className="compare-hint" data-testid="compare-hint">
                Kein Reifen ist in beiden Shops lagernd.
                {lastSearch?.query.brands.length === 0 &&
                  ' Für den direkten Preisvergleich eine Marke wählen.'}
              </p>
            )}
            {listVisible && groups.length > 0 && (
              <ListTools
                view={view}
                onChange={setView}
                shown={shownGroups.length}
                total={groups.length}
              />
            )}
            {listVisible && groups.length > 0 && shownGroups.length === 0 && (
              <p className="list-empty">Kein Reifen passt zu diesen Filtern.</p>
            )}
            <ResultList
              groups={listVisible ? shownGroups : []}
              selected={selectedKeys}
              onToggle={toggle}
              quantity={lastSearch?.query.quantity}
            />
          </section>
        </div>
      )}
    </main>
  )
}
