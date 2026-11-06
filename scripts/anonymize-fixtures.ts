// Builds anonymised test fixtures from raw shop recordings.
//
// Input:  recon/raw/* and recon/goeggel-detail.json (git-ignored, contain real data)
// Output: test/fixtures/** (committed)
//
// - Purchase prices (EK) are replaced by synthetic values that keep their rank order,
//   so sort/paging behaviour stays testable without revealing real prices.
// - All other money amounts become 0.
// - Session ids are zeroed.
// - The script aborts if anything that looks like customer data survives.
//
// Usage: node scripts/anonymize-fixtures.ts [--forbid=<comma separated strings>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const raw = (name: string) => readFileSync(join(root, 'recon', name), 'utf8')
const out = (name: string, content: string) => {
  const file = join(root, 'test', 'fixtures', name)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  console.log(`wrote test/fixtures/${name} (${content.length} chars)`)
}

const forbidden = (process.argv.find((a) => a.startsWith('--forbid='))?.slice(9) ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function rankMap(values: number[], base: number, step: number): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  return new Map(sorted.map((v, i) => [v, Math.round((base + i * step) * 100) / 100]))
}

function assertClean(name: string, content: string): void {
  for (const f of forbidden) {
    if (content.includes(f)) throw new Error(`${name}: forbidden string "${f}" still present`)
  }
  if (/sess-shop=(?!0{32})[0-9a-f]{32}/.test(content)) throw new Error(`${name}: session id left`)
}

// ---------------- Weichberger ----------------
const wFiles = {
  'weichberger/result-p1.html': 'raw/w-result-qty4-p1.html',
  'weichberger/result-last.html': 'raw/w-result-qty4-p4.html',
}
const deNumber = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
const deFormat = (n: number) => n.toFixed(2).replace('.', ',')
const NETPRICE = /(id="netprice">\s*)?€\s*([\d.]+,\d{2})/g

const wNet: number[] = []
for (const src of Object.values(wFiles)) {
  for (const m of raw(src).matchAll(NETPRICE)) if (m[1]) wNet.push(deNumber(m[2]))
}
const wMap = rankMap(wNet, 40, 0.75)
for (const [target, src] of Object.entries(wFiles)) {
  const html = raw(src)
    .replace(NETPRICE, (_all, prefix: string | undefined, value: string) =>
      prefix ? `${prefix}€ ${deFormat(wMap.get(deNumber(value)) ?? 0)}` : '€ 0,00',
    )
    .replace(/value="\d+,\d+"/g, 'value="0"')
  assertClean(target, html)
  out(target, html)
}
out('weichberger/footer.html', raw('raw/w-footer-qty4.html'))

// ---------------- Göggel ----------------
interface GoeggelJson {
  filter: string
  ergtab: string
  [k: string]: unknown
}
const gFiles = {
  'goeggel/search-p1.json': 'raw/g-search.json',
  'goeggel/page2.json': 'raw/g-page2.json',
  'goeggel/michelin-sommer.json': 'raw/g-search-michelin-sommer.json',
  'goeggel/nurvfg-off.json': 'raw/g-nurvfg-toggle.json',
}
const EK = /(class='clsdiv_search_ek preiszahl'[^>]*>)([\d.]+)(<)/g
const gEk: number[] = []
for (const src of Object.values(gFiles)) {
  for (const m of (JSON.parse(raw(src)) as GoeggelJson).ergtab.matchAll(EK)) gEk.push(Number(m[2]))
}
const gMap = rankMap(gEk, 35, 0.4)
const zeroSession = (s: string) => s.replace(/sess-shop=[0-9a-f]{32}/g, `sess-shop=${'0'.repeat(32)}`)
const anonymizeGoeggelHtml = (s: string) =>
  zeroSession(
    s
      .replace(EK, (_a, open: string, v: string, close: string) => `${open}${(gMap.get(Number(v)) ?? 0).toFixed(2)}${close}`)
      .replace(/(class='clsdiv_search_(?:ertag|vko|vkm|kbpreis) preiszahl'[^>]*>)[\d.]+(\s*%)?/g, '$10.00$2')
      .replace(/data-(min|max|min_start|max_start)='[\d.]+'/g, "data-$1='0'")
      .replace(/\d+(?:[.,]\d+)?\s*&euro;/g, '0 &euro;')
      .replace(/data-(kb|preis|aulapreis)='[\d.]+'/g, "data-$1='0'"),
  )
for (const [target, src] of Object.entries(gFiles)) {
  const json = JSON.parse(raw(src)) as GoeggelJson
  const anon = { ...json, filter: anonymizeGoeggelHtml(json.filter), ergtab: anonymizeGoeggelHtml(json.ergtab) }
  const text = JSON.stringify(anon)
  assertClean(target, text)
  out(target, text)
}
const detail = zeroSession(raw('goeggel-detail.json')).replace(/\d+(?:[.,]\d+)?\s*(?:&euro;|€)/g, '0 €')
assertClean('goeggel/detail.json', detail)
out('goeggel/detail.json', detail)
