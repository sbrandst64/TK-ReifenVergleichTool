// Parsing of tyre sizes, load/speed index and profile names as the shops write them.
import type { Season } from './types.ts'

export interface TireSize {
  width: number
  height: number
  rim: number
}
export interface LoadSpeed {
  loadIndex: string
  speedIndex: string
}

const LOAD_SPEED_TOKEN = /^(\d{2,3}(?:\/\d{2,3})?)([A-Z]{1,2})$/

/** Weichberger: "<Kürzel> 205/55R16 <Profil …> 91H [Zusätze]". */
export function parseWeichbergerDescription(
  desc: string,
): (TireSize & LoadSpeed & { profile: string }) | null {
  const m = desc.trim().match(/^\S+\s+(\d{3})\/(\d{2})\s*Z?R\s*(\d{2})\s+(.+)$/i)
  if (!m) return null
  const tokens = m[4].split(/\s+/)
  const idx = tokens.findIndex((t) => LOAD_SPEED_TOKEN.test(t))
  if (idx <= 0) return null
  const ls = tokens[idx].match(LOAD_SPEED_TOKEN)!
  return {
    width: Number(m[1]),
    height: Number(m[2]),
    rim: Number(m[3]),
    profile: tokens.slice(0, idx).join(' '),
    loadIndex: ls[1],
    speedIndex: ls[2],
  }
}

/** Göggel: "205/55VR16TLXL". */
export function parseGoeggelSize(artikel: string): TireSize | null {
  const m = artikel.match(/(\d{3})\/(\d{2})\s*[A-Z]{0,2}R\s*(\d{2})/i)
  return m ? { width: Number(m[1]), height: Number(m[2]), rim: Number(m[3]) } : null
}

/** "91 V  EA BMW", "91H", "98/96 H". */
export function parseLoadSpeed(text: string): LoadSpeed | null {
  const m = text.trim().match(/^(\d{2,3}(?:\/\d{2,3})?)\s*([A-Z]{1,2})\b/)
  return m ? { loadIndex: m[1], speedIndex: m[2] } : null
}

/** Comparable form of brand/profile names: upper case, "+" kept as PLUS, no spaces or symbols. */
export function normalizeToken(s: string): string {
  return s
    .toUpperCase()
    .replace(/\+/g, 'PLUS')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

export function seasonFromGoeggelIcon(src: string): Season | null {
  const m = src.match(/(sommer|winter|allwetter)_[^/]*$/i)
  if (!m) return null
  const s = m[1].toLowerCase()
  return s === 'allwetter' ? 'ganzjahr' : (s as Season)
}
