// Season that is ticked when the page opens (AC54): what the workshop sells at that time of year.
// One tap on the tag takes it away again.
import type { Season } from '../supabase/functions/_shared/types.ts'

/** October to March: winter tyres; April to September: summer tyres. */
export function seasonForDate(date: Date): Season[] {
  const month = date.getMonth() // 0 = January
  return month >= 9 || month <= 2 ? ['winter'] : ['sommer']
}
