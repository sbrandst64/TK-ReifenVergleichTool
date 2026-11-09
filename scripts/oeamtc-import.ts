// Imports the results of all ÖAMTC car tyre tests from oeamtc.at into src/oeamtc-data.ts (AC43).
// Development tool only: the app itself never contacts ÖAMTC. Deterministic HTML parsing, no AI.
//
// Per test page: every result table ("Produkt" … "Gesamtnote/Gesamturteil", "Empfehlung"), the
// product name from the table's sort field (without footnotes) and the link to the tyre's own page.
// Per tyre page: the tested size. Before writing, every row is checked (grade equal on both pages,
// verdict fits the ÖAMTC grade bands, size named on the test page); any mismatch stops the import.
//
// Usage: node scripts/oeamtc-import.ts [--cache <dir>]
//   --cache keeps downloaded pages in <dir> so a re-run does not fetch them again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const INDEX = 'https://www.oeamtc.at/tests/reifentest/'
const OUT = 'src/oeamtc-data.ts'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const PAUSE_MS = 300
const TEST_PAGE =
  /\/\/www\.oeamtc\.at\/tests\/(?:reifentest|assistenzsystemtest)\/((sommer|winter|ganzjahres|all-terrain-)reifentest-(20\d\d))\//g
const SEASON: Record<string, string> = {
  sommer: 'Sommer',
  winter: 'Winter',
  ganzjahres: 'Ganzjahr',
  'all-terrain-': 'All-Terrain',
}
// Order of publication within a year (newest first): winter in autumn, all-season and
// all-terrain in early summer, summer in spring.
const SEASON_RANK: Record<string, number> = { Winter: 0, Ganzjahr: 1, 'All-Terrain': 2, Sommer: 3 }
/**
 * Known errors on oeamtc.at. All-season test 2020: every tyre page says "235/55 R15", the test
 * page says "Dimension 235/55 R17 103V/Y" (an SUV size; 235/55 R15 is not a common size).
 */
const SIZE_FIX: Record<string, string> = { 'ganzjahresreifentest-2020': '235/55 R17' }
const BANDS: [number, string][] = [
  [1.5, 'sehr gut'],
  [2.5, 'gut'],
  [3.5, 'befriedigend'],
  [4.5, 'genügend'],
  [5.5, 'nicht genügend'],
]
const SIZE = /(\d{3})\s*\/\s*(\d{2})\s*Z?R\s*(\d{2})/

interface Row {
  slug: string
  label: string
  testUrl: string
  product: string
  grade: string
  verdict: string
  url: string
  size?: string
}

const cacheArg = process.argv.indexOf('--cache')
const cacheDir = cacheArg > 0 ? process.argv[cacheArg + 1] : null
if (cacheDir) mkdirSync(cacheDir, { recursive: true })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string): Promise<string> {
  const file = cacheDir
    ? join(cacheDir, url.replace(/[^a-z0-9]+/gi, '_').slice(-120) + '.html')
    : ''
  if (file && existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const html = await res.text()
  if (file) writeFileSync(file, html)
  await sleep(PAUSE_MS)
  return html
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
const text = (html: string) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
const absolute = (href: string) => (href.startsWith('//') ? `https:${href}` : href)
const cells = (tr: string) => [...tr.matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)]
const sizeOf = (s: string) => {
  const m = s.match(SIZE)
  return m ? `${m[1]}/${m[2]} R${m[3]}` : null
}

function parseTestPage(slug: string, label: string, testUrl: string, html: string): Row[] {
  const rows: Row[] = []
  for (const table of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const trs = [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0])
    const head = cells(trs[0] ?? '').map((c) => text(c[2]))
    if (head[0] !== 'Produkt') continue // e.g. the table of grade bands
    const gradeCol = head.findIndex((h) => /^Gesamt(note|urteil)$/.test(h))
    const verdictCol = head.indexOf('Empfehlung')
    if (gradeCol < 0 || verdictCol < 0)
      throw new Error(`${slug}: unknown columns ${head.join(', ')}`)
    for (const tr of trs.slice(1)) {
      const c = cells(tr)
      const sortName = c[0]?.[1].match(/data-sort='([^']*)'|data-sort="([^"]*)"/)
      const product = decode(sortName?.[1] ?? sortName?.[2] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      const href = c[0]?.[2].match(/href="([^"]+)"/)?.[1]
      const grade = text(c[gradeCol]?.[2] ?? '')
      const verdict = text(c[verdictCol]?.[2] ?? '')
        .replace(/Stern Icon - (Ganzer Stern|Halber Stern|Stern Umriss)/g, '')
        .trim()
      if (!product || !href) throw new Error(`${slug}: row without product or link`)
      rows.push({ slug, label, testUrl, product, grade, verdict, url: absolute(href) })
    }
  }
  if (rows.length === 0) throw new Error(`${slug}: no result table`)
  return rows
}

function check(row: Row, detailText: string, testText: string): void {
  const where = `${row.label} ${row.product}`
  if (!/^\d,\d$/.test(row.grade)) throw new Error(`${where}: grade "${row.grade}"`)
  const band = BANDS.find(([max]) => Number(row.grade.replace(',', '.')) <= max)?.[1]
  if (band !== row.verdict) throw new Error(`${where}: verdict "${row.verdict}" for ${row.grade}`)
  // some pages put a footnote number between the label and the weight ("Gesamturteil 1 100% 3,8")
  const detailGrade = detailText.match(/Gesamt(?:note|urteil)(?: \d)? 100\s?% (\d,\d)/)?.[1]
  if (detailGrade !== row.grade)
    throw new Error(`${where}: ${row.grade} vs. tyre page ${detailGrade}`)
  if (!row.url.startsWith(row.testUrl)) throw new Error(`${where}: link outside the test`)
  if (!row.size || !testText.replace(/\s+/g, '').includes(row.size.replace(/\s+/g, ''))) {
    throw new Error(`${where}: size ${row.size} is not named on the test page`)
  }
}

async function main() {
  const index = await get(INDEX)
  const slugs = [...new Set([...index.matchAll(TEST_PAGE)].map((m) => m[0]))]
  const tests = slugs
    .map((href) => {
      const [, slug, kind, year] = href.match(
        /\/((sommer|winter|ganzjahres|all-terrain-)reifentest-(20\d\d))\/$/,
      )!
      const label = `${SEASON[kind]} ${year}`
      return {
        slug,
        label,
        year: Number(year),
        rank: SEASON_RANK[SEASON[kind]],
        url: absolute(href),
      }
    })
    .sort((a, b) => b.year - a.year || a.rank - b.rank)

  const results: [number, Row][] = []
  for (const [i, test] of tests.entries()) {
    const html = await get(test.url)
    // the page's own address; some tests are linked from a different section of the site
    test.url = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? test.url
    const testText = text(html)
    const rows = parseTestPage(test.slug, test.label, test.url, html)
    for (const row of rows) {
      const detail = text(await get(row.url))
      row.size = SIZE_FIX[test.slug] ?? sizeOf(detail) ?? undefined
      check(row, detail, testText)
      results.push([i, row])
    }
    console.log(`${test.label}: ${rows.length} Ergebnisse`)
  }

  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const lines = [
    `// GENERATED by scripts/oeamtc-import.ts – do not edit by hand. Source: the result tables and`,
    `// tyre pages of all ÖAMTC car tyre tests on oeamtc.at, imported ${new Date().toISOString().slice(0, 10)}.`,
    `// ${tests.length} tests, ${results.length} results. Shown on screen only, not in the offer PDF (AC43).`,
    ``,
    `export interface OeamtcTest {`,
    `  /** e.g. "Winter 2026" */`,
    `  label: string`,
    `  url: string`,
    `}`,
    ``,
    `/** Newest first. */`,
    `export const OEAMTC_TESTS: OeamtcTest[] = [`,
    ...tests.map((t) => `  { label: ${q(t.label)}, url: ${q(t.url)} },`),
    `]`,
    ``,
    `/** [test index, product as ÖAMTC writes it, tested size, Gesamtnote, Empfehlung, tyre page below the test url] */`,
    `export type OeamtcResult = [number, string, string, string, string, string]`,
    ``,
    `export const OEAMTC_RESULTS: OeamtcResult[] = [`,
    ...results.map(
      ([i, r]) =>
        `  [${i}, ${q(r.product)}, ${q(r.size!)}, ${q(r.grade)}, ${q(r.verdict)}, ${q(r.url.slice(r.testUrl.length))}],`,
    ),
    `]`,
    ``,
  ]
  writeFileSync(OUT, lines.join('\n'))
  console.log(`${OUT}: ${tests.length} Tests, ${results.length} Ergebnisse`)
}

main().catch((e: unknown) => {
  console.error('Import abgebrochen:', (e as Error).message)
  process.exit(1)
})
