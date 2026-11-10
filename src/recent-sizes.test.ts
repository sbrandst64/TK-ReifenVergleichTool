// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecentSizes, rememberSize } from './recent-sizes.ts'

const size = (width: number, height = 55, rim = 16) => ({ width, height, rim })

beforeEach(() => localStorage.clear())

describe('recent sizes (AC53)', () => {
  it('starts empty and keeps the newest size first', () => {
    expect(loadRecentSizes()).toEqual([])
    rememberSize(size(205))
    expect(rememberSize(size(225, 45, 17))).toEqual([size(225, 45, 17), size(205)])
    expect(loadRecentSizes()).toEqual([size(225, 45, 17), size(205)])
  })

  it('moves a size that is searched again to the front instead of listing it twice', () => {
    rememberSize(size(205))
    rememberSize(size(225))
    expect(rememberSize(size(205))).toEqual([size(205), size(225)])
  })

  it('keeps five sizes', () => {
    for (const w of [175, 185, 195, 205, 215, 225]) rememberSize(size(w))
    expect(loadRecentSizes().map((s) => s.width)).toEqual([225, 215, 205, 195, 185])
  })

  it('ignores what is not a list of sizes', () => {
    localStorage.setItem('letzte-groessen', '{"kaputt":')
    expect(loadRecentSizes()).toEqual([])
    localStorage.setItem('letzte-groessen', JSON.stringify([size(205), { width: 'x' }, null, 7]))
    expect(loadRecentSizes()).toEqual([size(205)])
  })
})
