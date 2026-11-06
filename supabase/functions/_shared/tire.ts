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

export function parseWeichbergerDescription(_desc: string): (TireSize & LoadSpeed & { profile: string }) | null {
  throw new Error('not implemented')
}
export function parseGoeggelSize(_artikel: string): TireSize | null {
  throw new Error('not implemented')
}
export function parseLoadSpeed(_text: string): LoadSpeed | null {
  throw new Error('not implemented')
}
export function normalizeToken(_s: string): string {
  throw new Error('not implemented')
}
export function seasonFromGoeggelIcon(_src: string): Season | null {
  throw new Error('not implemented')
}
