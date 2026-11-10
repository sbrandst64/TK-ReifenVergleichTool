// EANs the app has already read from Göggel's detail layer (spec 3.3, AC46). An article keeps its
// EAN, so entries never expire. Only EANs are kept: no prices, stock or search results.
export interface EanCache {
  /** EANs known for these Göggel article numbers; unknown ones are simply missing. */
  get(articleIds: string[]): Promise<Map<string, string>>
  put(entries: Map<string, string>): Promise<void>
}

/** What may go into a request or a stored row: plain article numbers and EAN-8 … GTIN-14. */
export const isArticleId = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id)
export const isEan = (ean: unknown): ean is string =>
  typeof ean === 'string' && /^\d{8,14}$/.test(ean)
